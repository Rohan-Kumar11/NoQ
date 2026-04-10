'use client';

import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { X, CheckCircle, Loader2, AlertCircle, Copy, ExternalLink } from 'lucide-react';
import './QRPaymentModal.css';

export default function QRPaymentModal({
  isOpen,
  onClose,
  orderData,
  onPaymentSuccess
}) {
  const [paymentStep, setPaymentStep] = useState('qr');
  const [transactionId, setTransactionId]   = useState('');
  const [utrNumber, setUtrNumber]           = useState('');
  const [utrError, setUtrError]             = useState('');
  const [isVerifying, setIsVerifying]       = useState(false);

  useEffect(() => {
    if (isOpen) {
      const timestamp = Date.now();
      const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
      setTransactionId(`TXN${timestamp}${random}`);
      setPaymentStep('qr');
      setUtrNumber('');
      setUtrError('');
      setIsVerifying(false);
    }
  }, [isOpen]);

  const storeUpiId = orderData?.storeUpiId?.trim() || null;
  const hasRealUpi = Boolean(storeUpiId);

  const generateUpiString = () => {
    if (!hasRealUpi) return null;
    const { storeName, totalAmount, orderNumber } = orderData;
    return `upi://pay?pa=${storeUpiId}&pn=${encodeURIComponent(storeName || 'NoQ Store')}&am=${Number(totalAmount).toFixed(2)}&tn=${encodeURIComponent(`Order ${orderNumber}`)}&cu=INR`;
  };

  // ── UTR validation ────────────────────────────────────────────────────────
  // UTR (Unique Transaction Reference) is a 12-digit number assigned by NPCI
  // to every UPI transaction. It appears in the payment receipt in all UPI apps.
  const validateUTR = (utr) => {
    const cleaned = utr.trim().replace(/\s/g, '');
    // UTR is exactly 12 digits
    return /^\d{12}$/.test(cleaned);
  };

  // ── Real payment confirm: requires valid UTR ──────────────────────────────
  const handleRealPaymentConfirm = async () => {
    setUtrError('');
    const cleaned = utrNumber.trim().replace(/\s/g, '');

    if (!cleaned) {
      setUtrError('Please enter the UTR / Transaction ID from your UPI app.');
      return;
    }
    if (!validateUTR(cleaned)) {
      setUtrError('UTR must be exactly 12 digits. Find it in your UPI app under payment history.');
      return;
    }

    setIsVerifying(true);

    // Save UTR to database alongside the transaction for seller verification
    try {
      await saveUtrToTransaction(cleaned);
      setPaymentStep('pending_seller');
    } catch (err) {
      setUtrError('Failed to record UTR. Please try again.');
    } finally {
      setIsVerifying(false);
    }
  };

  // Save UTR to the transactions table for seller to verify
  const saveUtrToTransaction = async (utr) => {
    const { supabase } = await import('@/lib/supabase/client');
    if (!orderData?.transactionDbId) return; // no-op if not provided

    const { error } = await supabase
      .from('transactions')
      .update({
        utr_number:    utr,
        status:        'processing',  // awaiting seller confirmation
        updated_at:    new Date().toISOString(),
      })
      .eq('transaction_id', orderData.transactionId);

    if (error) {
      console.error('UTR save error:', error);
      throw error;
    }
  };

  // ── Simulate payment (demo) — bypasses UTR check ─────────────────────────
  const handleSimulatePayment = () => {
    setPaymentStep('processing');
    setTimeout(() => {
      setPaymentStep('success');
      setTimeout(() => { onPaymentSuccess(transactionId); onClose(); }, 2000);
    }, 3000);
  };

  // ── Seller confirmed payment (called from realtime / polling) ─────────────
  // For now: "pending_seller" auto-confirms after 3s for hackathon demo.
  // In production: wait for seller dashboard action to fire onPaymentSuccess.
  const handlePendingSellerConfirm = () => {
    setPaymentStep('processing');
    setTimeout(() => {
      setPaymentStep('success');
      setTimeout(() => { onPaymentSuccess(`UTR-${utrNumber}`); onClose(); }, 2000);
    }, 1500);
  };

  if (!isOpen) return null;
  const upiString = generateUpiString();

  return (
    <div className="qr-modal-overlay" onClick={onClose}>
      <div className="qr-modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="qr-modal-close" onClick={onClose} aria-label="Close">
          <X size={20} />
        </button>

        {/* ── Step 1: QR + UTR entry ── */}
        {paymentStep === 'qr' && (
          <div className="qr-modal-body">
            <div className="qr-modal-header">
              <h2 className="qr-modal-title">
                {hasRealUpi ? 'Scan & Pay' : 'Demo Payment'}
              </h2>
              <p className="qr-modal-subtitle">
                {hasRealUpi
                  ? 'Scan the QR, pay, then enter the UTR number to confirm'
                  : 'No UPI ID configured — use demo button to test'}
              </p>
            </div>

            {hasRealUpi ? (
              <>
                {/* Live badge */}
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: '0.375rem',
                  padding: '0.3rem 0.875rem', borderRadius: '999px', marginBottom: '1rem',
                  background: '#d1fae5', border: '1px solid #a7f3d0',
                  fontSize: '0.8rem', fontWeight: 700, color: '#059669',
                }}>
                  ✓ Live UPI — real payment
                </div>

                {/* QR */}
                <div className="qr-code-container">
                  <QRCodeSVG value={upiString} size={180} level="H" includeMargin={true} />
                </div>

                {/* UPI ID */}
                <div style={{
                  margin: '0.5rem 0 1rem',
                  padding: '0.5rem 1rem', borderRadius: '8px',
                  background: '#f9f7f4', border: '1px solid #e8e5e0',
                  fontSize: '0.85rem', fontFamily: 'monospace', color: '#1a1a1a', fontWeight: 600,
                }}>
                  📲 {storeUpiId}
                </div>

                {/* Order summary */}
                <div className="qr-payment-details">
                  <div className="qr-payment-row">
                    <span className="qr-payment-label">Store</span>
                    <span className="qr-payment-value">{orderData.storeName}</span>
                  </div>
                  <div className="qr-payment-row">
                    <span className="qr-payment-label">Order</span>
                    <span className="qr-payment-value">#{orderData.orderNumber}</span>
                  </div>
                  <div className="qr-payment-row total">
                    <span className="qr-payment-label">Amount</span>
                    <span className="qr-payment-value">
                      ₹{Number(orderData.totalAmount).toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Supported apps */}
                <div className="qr-supported-apps">
                  <p className="qr-supported-label">Supported Apps</p>
                  <div className="qr-apps-grid">
                    {['GPay', 'PhonePe', 'Paytm', 'BHIM'].map(app => (
                      <span key={app} className="qr-app-badge">{app}</span>
                    ))}
                  </div>
                </div>

                {/* ── UTR entry ── */}
                <div style={{
                  marginTop: '1.25rem',
                  padding: '1.25rem',
                  background: '#f0fdf4',
                  border: '1.5px solid #86efac',
                  borderRadius: '14px',
                  textAlign: 'left',
                }}>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#15803d', marginBottom: '0.375rem' }}>
                    ✅ After paying, enter your UTR number
                  </div>
                  <p style={{ fontSize: '0.78rem', color: '#166534', marginBottom: '0.875rem', lineHeight: 1.5 }}>
                    Open your UPI app → Payment history → Find this payment → Copy the 12-digit UTR / Transaction ID
                  </p>
                  <input
                    type="tel"
                    inputMode="numeric"
                    maxLength={12}
                    placeholder="e.g. 123456789012"
                    value={utrNumber}
                    onChange={e => {
                      setUtrNumber(e.target.value.replace(/\D/g, '').slice(0, 12));
                      setUtrError('');
                    }}
                    style={{
                      width: '100%', padding: '0.75rem 1rem',
                      border: `1.5px solid ${utrError ? '#ef4444' : '#86efac'}`,
                      borderRadius: '10px', fontSize: '1rem',
                      fontFamily: 'monospace', fontWeight: 700,
                      letterSpacing: '0.1em', color: '#1a1a1a',
                      background: 'white', outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                  {/* Character counter */}
                  <div style={{
                    display: 'flex', justifyContent: 'space-between',
                    marginTop: '0.375rem', fontSize: '0.75rem',
                  }}>
                    <span style={{ color: utrError ? '#ef4444' : '#6b7280' }}>
                      {utrError || 'UTR is a 12-digit number — not letters'}
                    </span>
                    <span style={{ color: utrNumber.length === 12 ? '#059669' : '#9ca3af', fontWeight: 600 }}>
                      {utrNumber.length}/12
                    </span>
                  </div>
                </div>

                {/* Confirm button */}
                <button
                  className="qr-simulate-btn"
                  onClick={handleRealPaymentConfirm}
                  disabled={isVerifying || utrNumber.length !== 12}
                  style={{
                    marginTop: '1rem',
                    background: utrNumber.length === 12
                      ? 'linear-gradient(135deg, #059669 0%, #34d399 100%)'
                      : '#e5e7eb',
                    color: utrNumber.length === 12 ? 'white' : '#9ca3af',
                    cursor: utrNumber.length === 12 ? 'pointer' : 'not-allowed',
                    marginBottom: '0.625rem',
                    transition: 'all 0.2s',
                  }}
                >
                  {isVerifying ? '⏳ Saving...' : '✅ Confirm Payment'}
                </button>
              </>
            ) : (
              /* No UPI ID — show placeholder */
              <div style={{
                width: 180, height: 180, margin: '0 auto 1rem',
                borderRadius: 12, border: '2px dashed #d1d5db',
                background: '#f9fafb',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
              }}>
                <span style={{ fontSize: '2.5rem' }}>🔲</span>
                <span style={{ fontSize: '0.75rem', color: '#9ca3af', textAlign: 'center', padding: '0 1rem' }}>
                  Seller hasn't set a UPI ID yet
                </span>
              </div>
            )}

            {/* Demo button — always visible */}
            <button
              className="qr-simulate-btn"
              onClick={handleSimulatePayment}
              style={hasRealUpi ? {
                background: 'transparent',
                border: '1.5px dashed #d1d5db',
                color: '#9ca3af',
                boxShadow: 'none',
                fontSize: '0.85rem',
              } : {}}
            >
              🧪 Simulate Payment (Demo)
            </button>
          </div>
        )}

        {/* ── Step 2: Pending seller confirmation ── */}
        {paymentStep === 'pending_seller' && (
          <div className="qr-modal-body">
            <div style={{ fontSize: '3.5rem', marginBottom: '1rem' }}>⏳</div>
            <h2 className="qr-modal-title">Payment Submitted</h2>
            <p className="qr-modal-subtitle">
              Your UTR has been recorded. The seller will verify and confirm shortly.
            </p>

            <div style={{
              margin: '1.25rem 0',
              padding: '1rem 1.25rem',
              background: '#fefce8', border: '1px solid #fde68a',
              borderRadius: '12px', textAlign: 'left',
            }}>
              <div style={{ fontWeight: 700, fontSize: '0.8rem', color: '#92400e', marginBottom: '0.375rem', textTransform: 'uppercase' }}>
                UTR Submitted
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: '1.1rem', fontWeight: 700, color: '#78350f', letterSpacing: '0.1em' }}>
                {utrNumber}
              </div>
              <div style={{ fontSize: '0.78rem', color: '#92400e', marginTop: '0.25rem' }}>
                Amount: ₹{Number(orderData?.totalAmount).toFixed(2)} · To: {storeUpiId}
              </div>
            </div>

            <div style={{
              padding: '1rem', background: '#f0f9ff', border: '1px solid #bae6fd',
              borderRadius: '10px', fontSize: '0.82rem', color: '#0369a1',
              marginBottom: '1.25rem', lineHeight: 1.6,
            }}>
              <strong>What happens next?</strong><br />
              The seller will check their UPI app, verify ₹{Number(orderData?.totalAmount).toFixed(2)} was received from you, and confirm your order. You'll get a confirmation shortly.
            </div>

            {/* For hackathon: let user self-confirm after showing UTR */}
            <button
              className="qr-simulate-btn"
              onClick={handlePendingSellerConfirm}
              style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)', marginBottom: '0.5rem' }}
            >
              🎪 Hackathon Demo: Mark as Confirmed
            </button>
            <p style={{ fontSize: '0.72rem', color: '#9ca3af', textAlign: 'center' }}>
              In production, seller confirms from their dashboard
            </p>
          </div>
        )}

        {/* ── Processing ── */}
        {paymentStep === 'processing' && (
          <div className="qr-modal-body">
            <div className="qr-processing-animation">
              <Loader2 className="qr-spinner" />
            </div>
            <h2 className="qr-modal-title">Processing Payment...</h2>
            <p className="qr-modal-subtitle">Please wait while we verify your payment</p>
            <div className="qr-transaction-id">Transaction ID: {transactionId}</div>
          </div>
        )}

        {/* ── Success ── */}
        {paymentStep === 'success' && (
          <div className="qr-modal-body">
            <div className="qr-success-animation">
              <CheckCircle className="qr-success-icon" />
            </div>
            <h2 className="qr-modal-title success">Payment Confirmed!</h2>
            <p className="qr-modal-subtitle">Your order has been confirmed</p>
            <div className="qr-success-details">
              <div className="qr-success-row">
                <span>Transaction ID:</span>
                <span className="qr-txn-id">{transactionId}</span>
              </div>
              {utrNumber && (
                <div className="qr-success-row">
                  <span>UTR Number:</span>
                  <span className="qr-txn-id">{utrNumber}</span>
                </div>
              )}
              <div className="qr-success-row">
                <span>Amount Paid:</span>
                <span className="qr-amount">₹{Number(orderData?.totalAmount).toFixed(2)}</span>
              </div>
            </div>
            <p className="qr-redirect-text">Redirecting to your token...</p>
          </div>
        )}

        {/* ── Failed ── */}
        {paymentStep === 'failed' && (
          <div className="qr-modal-body">
            <div className="qr-failed-animation">
              <AlertCircle className="qr-failed-icon" />
            </div>
            <h2 className="qr-modal-title failed">Payment Failed</h2>
            <p className="qr-modal-subtitle">Please try again</p>
            <button className="qr-retry-btn" onClick={() => setPaymentStep('qr')}>
              Retry Payment
            </button>
          </div>
        )}
      </div>
    </div>
  );
}