// components/PendingPaymentVerification.jsx
'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import toast from 'react-hot-toast';

export default function PendingPaymentVerification({ storeId }) {
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPending();
    // Realtime: new transactions arrive
    const channel = supabase
      .channel('pending-utr')
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'transactions',
        filter: `store_id=eq.${storeId}`,
      }, () => loadPending())
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [storeId]);

  const loadPending = async () => {
    const { data } = await supabase
      .from('transactions')
      .select(`
        id, transaction_id, utr_number, amount, initiated_at,
        orders!transactions_order_id_fkey(order_number, id)
      `)
      .eq('store_id', storeId)
      .eq('status', 'processing')
      .not('utr_number', 'is', null)
      .order('initiated_at', { ascending: false });

    setPending(data || []);
    setLoading(false);
  };

  const handleConfirm = async (txn) => {
    // Mark transaction as completed
    const { error: txnErr } = await supabase
      .from('transactions')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', txn.id);

    if (txnErr) { toast.error('Failed to confirm'); return; }

    // Mark order as confirmed
    const { error: orderErr } = await supabase
      .from('orders')
      .update({ payment_status: 'paid', order_status: 'confirmed' })
      .eq('id', txn.orders.id);

    if (orderErr) { toast.error('Order update failed'); return; }

    toast.success(`✅ Payment confirmed — UTR ${txn.utr_number}`);
    loadPending();
  };

  const handleReject = async (txn) => {
    const { error: txnErr } = await supabase
      .from('transactions')
      .update({ status: 'failed', error_message: 'UTR not verified by seller' })
      .eq('id', txn.id);

    if (txnErr) { toast.error('Failed to reject'); return; }

    await supabase
      .from('orders')
      .update({ payment_status: 'failed', order_status: 'cancelled' })
      .eq('id', txn.orders.id);

    toast.success('Payment rejected');
    loadPending();
  };

  if (loading) return null;
  if (pending.length === 0) return null;

  return (
    <div style={{
      padding: '1.5rem', borderRadius: '16px', marginBottom: '1.5rem',
      background: '#fefce8', border: '2px solid #fde68a',
    }}>
      <h3 style={{ fontWeight: 700, fontSize: '1rem', color: '#92400e', marginBottom: '1rem' }}>
        ⚠️ {pending.length} Payment{pending.length > 1 ? 's' : ''} Awaiting Verification
      </h3>
      <p style={{ fontSize: '0.82rem', color: '#78350f', marginBottom: '1.25rem' }}>
        Check your UPI app to confirm these amounts were received, then approve or reject.
      </p>

      {pending.map(txn => (
        <div key={txn.id} style={{
          background: 'white', borderRadius: '12px', padding: '1rem 1.25rem',
          border: '1px solid #fde68a', marginBottom: '0.75rem',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: '0.75rem',
        }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#1a1a1a' }}>
              Order #{txn.orders?.order_number}
            </div>
            <div style={{ fontSize: '0.82rem', color: '#6b7280', marginTop: '2px' }}>
              Amount: <strong style={{ color: '#059669' }}>₹{Number(txn.amount).toFixed(2)}</strong>
              {' · '}
              UTR: <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#1a1a1a' }}>
                {txn.utr_number}
              </span>
            </div>
            <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '2px' }}>
              {new Date(txn.initiated_at).toLocaleString()}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.625rem' }}>
            <button
              onClick={() => handleConfirm(txn)}
              style={{
                padding: '0.5rem 1.25rem', borderRadius: '50px', border: 'none',
                background: '#059669', color: 'white', fontWeight: 700,
                fontSize: '0.85rem', cursor: 'pointer',
              }}
            >
              ✓ Confirm
            </button>
            <button
              onClick={() => handleReject(txn)}
              style={{
                padding: '0.5rem 1.25rem', borderRadius: '50px',
                border: '1.5px solid #ef4444', background: 'white',
                color: '#ef4444', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer',
              }}
            >
              ✕ Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}