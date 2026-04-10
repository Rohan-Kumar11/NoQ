
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { 
  fetchStoreOrders, 
  acceptOrder, 
  rejectOrder, 
  markOrderReady, 
  completeOrderWithToken,
  updatePreparationTime 
} from '@/lib/api/orders';
import toast from 'react-hot-toast';
import Sidebar from '../../components/Sidebar';
import styles from './OrdersHistory.module.css';

export default function SellerOrderManagement() {
  const router = useRouter();
  
  const [currentTime, setCurrentTime] = useState(new Date());
  const [storeId, setStoreId] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingOrder, setProcessingOrder] = useState(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  
  const [activeOrderId, setActiveOrderId] = useState(null);
  const [prepTimeInput, setPrepTimeInput] = useState({});
  const [rejectReason, setRejectReason] = useState({});
  const [tokenInput, setTokenInput] = useState({});
  const [showTokenModal, setShowTokenModal] = useState(null);
  const [expandedOrders, setExpandedOrders] = useState(new Set());
  
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // ── FIXED: MutationObserver instead of setInterval polling ────────────────
  useEffect(() => {
    const timer = setTimeout(() => {
      const sidebar = document.querySelector('[class*="sidebar"]');
      if (!sidebar) return;
      const check = (el) => setSidebarCollapsed(el.classList.toString().includes('collapsed'));
      check(sidebar);
      const obs = new MutationObserver(() => check(sidebar));
      obs.observe(sidebar, { attributes: true, attributeFilter: ['class'] });
      return () => obs.disconnect();
    }, 200);
    return () => clearTimeout(timer);
  }, []);

  const toggleOrderExpansion = (orderId) => {
    setExpandedOrders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(orderId)) newSet.delete(orderId);
      else newSet.add(orderId);
      return newSet;
    });
  };

  useEffect(() => {
    async function loadData() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { router.push('/auth/signin'); return; }

        const { data: stores, error: storeError } = await supabase
          .from('stores')
          .select('id, store_name')
          .eq('owner_id', user.id)
          .single();

        if (storeError || !stores) {
          console.error('❌ Store not found for seller:', user.id, storeError);
          toast.error('Store not found. Please complete registration.');
          router.push('/seller/register');
          return;
        }
        
        setStoreId(stores.id);
        await loadOrders(stores.id);
        
      } catch (error) {
        console.error('❌ Error loading data:', error);
        toast.error('Failed to load orders');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [router]);

  const loadOrders = async (id) => {
    const result = await fetchStoreOrders(id, { limit: 100 });
    if (result.data) setOrders(result.data);
  };

  // Realtime orders subscription (unchanged from original)
  useEffect(() => {
    if (!storeId) return;

    const channel = supabase
      .channel('orders-channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `store_id=eq.${storeId}` },
        (payload) => {
          loadOrders(storeId);
          if (payload.eventType === 'INSERT') {
            toast.success(`New Order! #${payload.new.order_number}`, { duration: 6000, icon: '🎉' });
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [storeId]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleAcceptOrder = async (order) => {
    const prepTime = prepTimeInput[order.id] || 15;
    setProcessingOrder(order.id);
    toast.loading('Accepting order...', { id: 'accept-order' });
    const result = await acceptOrder(order.id, prepTime);
    setProcessingOrder(null);
    if (result.error) { toast.error(result.error, { id: 'accept-order' }); }
    else { toast.success(`Order accepted! Prep time: ${prepTime} mins`, { id: 'accept-order' }); await loadOrders(storeId); setActiveOrderId(null); }
  };

  const handleRejectOrder = async (order) => {
    const reason = rejectReason[order.id] || 'Out of stock';
    if (!confirm(`Reject order #${order.order_number}?`)) return;
    setProcessingOrder(order.id);
    toast.loading('Rejecting...', { id: 'reject-order' });
    const result = await rejectOrder(order.id, reason);
    setProcessingOrder(null);
    if (result.error) { toast.error(result.error, { id: 'reject-order' }); }
    else { toast.success('Order rejected', { id: 'reject-order' }); await loadOrders(storeId); setActiveOrderId(null); }
  };

  const handleMarkReady = async (order) => {
    setProcessingOrder(order.id);
    toast.loading('Marking as ready...', { id: 'mark-ready' });
    const result = await markOrderReady(order.id);
    setProcessingOrder(null);
    if (result.error) { toast.error(result.error, { id: 'mark-ready' }); }
    else { toast.success('Customer notified!', { id: 'mark-ready' }); await loadOrders(storeId); }
  };

  const handleCompleteOrder = async (order) => { setShowTokenModal(order.id); };

  const handleTokenSubmit = async (orderId) => {
    const enteredToken = tokenInput[orderId];
    if (!enteredToken || enteredToken.trim().length === 0) { toast.error('Please enter token number'); return; }
    setProcessingOrder(orderId);
    toast.loading('Verifying token...', { id: 'complete' });
    const result = await completeOrderWithToken(orderId, enteredToken);
    setProcessingOrder(null);
    if (result.error) { toast.error(result.error, { id: 'complete' }); }
    else { toast.success('Order completed! Stock updated 🎉', { id: 'complete' }); await loadOrders(storeId); setShowTokenModal(null); setTokenInput({}); }
  };

  const handleUpdatePrepTime = async (order) => {
    const newTime = prepTimeInput[order.id];
    if (!newTime || newTime < 1) { toast.error('Enter valid time'); return; }
    setProcessingOrder(order.id);
    const result = await updatePreparationTime(order.id, newTime);
    setProcessingOrder(null);
    if (result.error) { toast.error(result.error); }
    else { toast.success('Time updated'); await loadOrders(storeId); }
  };

  const getFilteredOrders = () => {
    let filtered = [...orders];
    if (searchQuery) filtered = filtered.filter(o => o.order_number?.toLowerCase().includes(searchQuery.toLowerCase()));
    if (statusFilter !== 'all') filtered = filtered.filter(o => o.order_status === statusFilter);
    filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return filtered;
  };

  const filteredOrders = getFilteredOrders();

  const formatTime = (date) => date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  const formatDate = (date) => date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const getStatusColor = (status) => ({
    pending: '#f59e0b', confirmed: '#4A90E2', preparing: '#8b5cf6',
    ready: '#10b981', completed: '#059669', cancelled: '#ef4444'
  }[status] || '#6b7280');

  const getActionButtons = (order) => {
    const isProcessing = processingOrder === order.id;
    
    switch (order.order_status) {
      case 'pending':
      case 'confirmed':
        return (
          <div className={styles.orderActions}>
            {activeOrderId === order.id ? (
              <>
                <div className={styles.prepTimeControl}>
                  <label>Preparation Time (minutes)</label>
                  <input type="number" min="1" max="120" value={prepTimeInput[order.id] || 15}
                    onChange={(e) => setPrepTimeInput({ ...prepTimeInput, [order.id]: parseInt(e.target.value) })}
                    className={styles.prepTimeInput} />
                </div>
                <button onClick={() => handleAcceptOrder(order)} disabled={isProcessing} className={styles.btnAccept}>✓ Accept Order</button>
                <button onClick={() => setActiveOrderId(null)} className={styles.btnCancel}>Cancel</button>
                <div className={styles.rejectSection}>
                  <input type="text" placeholder="Reason for rejection..."
                    value={rejectReason[order.id] || ''}
                    onChange={(e) => setRejectReason({ ...rejectReason, [order.id]: e.target.value })}
                    className={styles.rejectInput} />
                  <button onClick={() => handleRejectOrder(order)} disabled={isProcessing} className={styles.btnReject}>✕ Reject Order</button>
                </div>
              </>
            ) : (
              <button onClick={() => setActiveOrderId(order.id)} className={styles.btnManage}>Manage Order →</button>
            )}
          </div>
        );
      
      case 'preparing':
        return (
          <div className={styles.orderActions}>
            <button onClick={() => handleMarkReady(order)} disabled={isProcessing} className={styles.btnReady}>✓ Mark as Ready</button>
            {activeOrderId === order.id ? (
              <>
                <input type="number" min="1" placeholder="Update time (mins)"
                  value={prepTimeInput[order.id] || ''}
                  onChange={(e) => setPrepTimeInput({ ...prepTimeInput, [order.id]: parseInt(e.target.value) })}
                  className={styles.prepTimeInput} />
                <button onClick={() => handleUpdatePrepTime(order)} className={styles.btnUpdate}>Update Time</button>
              </>
            ) : (
              <button onClick={() => setActiveOrderId(order.id)} className={styles.btnSecondary}>Update Prep Time</button>
            )}
          </div>
        );
      
      case 'ready':
        return (
          <div className={styles.orderActions}>
            {showTokenModal === order.id ? (
              <div className={styles.tokenModal}>
                <div className={styles.tokenHeader}>
                  <h4>🎫 Verify Customer Token</h4>
                  <p className={styles.tokenInstruction}>Ask the customer for their pickup token number</p>
                </div>
                <input type="text" placeholder="Enter token"
                  value={tokenInput[order.id] || ''}
                  onChange={(e) => setTokenInput({ ...tokenInput, [order.id]: e.target.value.trim() })}
                  className={styles.tokenInput} autoFocus />
                <div className={styles.tokenButtons}>
                  <button onClick={() => handleTokenSubmit(order.id)} disabled={isProcessing} className={styles.btnVerify}>✓ Verify & Complete</button>
                  <button onClick={() => { setShowTokenModal(null); setTokenInput({}); }} className={styles.btnCancel}>Cancel</button>
                </div>
              </div>
            ) : (
              <button onClick={() => handleCompleteOrder(order)} disabled={isProcessing} className={styles.btnComplete}>🎫 Verify Token & Complete</button>
            )}
          </div>
        );
      
      case 'completed':
        return (
          <div className={styles.orderActions}>
            <span className={styles.completedBadge}>✓ Order Completed</span>
            <span className={styles.completedDate}>Completed: {new Date(order.completed_at).toLocaleString()}</span>
          </div>
        );
      
      case 'cancelled':
        return (
          <div className={styles.orderActions}>
            <span className={styles.cancelledBadge}>✕ Order Cancelled</span>
            {order.cancellation_reason && <div className={styles.cancellationReason}>Reason: {order.cancellation_reason}</div>}
          </div>
        );
      
      default: return null;
    }
  };

  if (loading) {
    return (
      <div className={styles.dashboard}>
        <Sidebar />
        <main className={styles.mainContent}>
          <div className={styles.loadingContainer}><div className={styles.loader}></div><p>Loading your orders...</p></div>
        </main>
      </div>
    );
  }

  return (
    <div className={styles.dashboard}>
      <Sidebar />

      <main className={`${styles.mainContent} ${sidebarCollapsed ? styles.expanded : ''}`}>
        <header className={styles.topBar}>
          <div className={styles.topBarLeft}>
            <h1 className={styles.pageTitle}>Orders</h1>
            <div className={styles.dateTime}>
              <div className={styles.date}>{formatDate(currentTime)}</div>
              <div className={styles.time}>{formatTime(currentTime)}</div>
            </div>
          </div>
          <div className={styles.topBarRight}>
            <button className={styles.iconButton} onClick={() => router.push('/seller/notifications')} title="Notifications">
              🔔
              {orders.filter(o => o.order_status === 'confirmed').length > 0 && (
                <span className={styles.notificationBadge}>{orders.filter(o => o.order_status === 'confirmed').length}</span>
              )}
            </button>
            <button className={styles.iconButton} onClick={() => router.push('/seller/settings')} title="Settings">⚙️</button>
          </div>
        </header>

        <div className={styles.liveStatusBar}>
          <div className={styles.liveIndicator}><span className={styles.liveDot}></span><span className={styles.liveText}>LIVE ORDERS</span></div>
          <div className={styles.liveInfo}>Real-time updates active • Auto-refresh enabled</div>
        </div>

        <div className={styles.statsGrid}>
          {[
            { icon: '⏳', label: 'Pending',          val: orders.filter(o => o.order_status === 'confirmed').length  },
            { icon: '🔥', label: 'Preparing',         val: orders.filter(o => o.order_status === 'preparing').length  },
            { icon: '✅', label: 'Ready',             val: orders.filter(o => o.order_status === 'ready').length     },
            { icon: '🎉', label: 'Completed',   val: orders.filter(o => o.order_status === 'completed').length  },
          ].map((s, i) => (
            <div key={i} className={styles.statCard}>
              <div className={styles.statIcon}>{s.icon}</div>
              <div className={styles.statContent}>
                <div className={styles.statLabel}>{s.label}</div>
                <div className={styles.statValue}>{s.val}</div>
              </div>
            </div>
          ))}
        </div>

        <div className={styles.filtersCard}>
          <div className={styles.filtersGrid}>
            <div className={styles.filterGroup}>
              <input type="text" placeholder="🔍 Search by order number..." value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)} className={styles.searchInput} />
            </div>
            <div className={styles.filterGroup}>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={styles.filterSelect}>
                <option value="all">All Orders</option>
                <option value="confirmed">⏳ Pending</option>
                <option value="preparing">🔥 Preparing</option>
                <option value="ready">✅ Ready for Pickup</option>
                <option value="completed">🎉 Completed</option>
                <option value="cancelled">✕ Cancelled</option>
              </select>
            </div>
          </div>
        </div>

        <div className={styles.ordersSection}>
          <div className={styles.ordersList}>
            {filteredOrders.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>📦</div>
                <div className={styles.emptyText}>
                  {searchQuery || statusFilter !== 'all' ? 'No orders match your filters' : 'No orders yet'}
                </div>
              </div>
            ) : (
              filteredOrders.map(order => {
                const isExpanded = expandedOrders.has(order.id);
                return (
                  <div key={order.id} className={`${styles.orderCard} ${styles[`status_${order.order_status}`]}`}>
                    {/* Compact header */}
                    <div className={styles.orderHeaderCompact} onClick={() => toggleOrderExpansion(order.id)}>
                      <div className={styles.orderHeaderLeft}>
                        <div className={styles.orderNumber}>#{order.order_number}</div>
                        <span className={styles.statusBadge} style={{ backgroundColor: getStatusColor(order.order_status), color: 'white' }}>
                          {order.order_status?.toUpperCase()}
                        </span>
                      </div>
                      <div className={styles.orderHeaderRight}>
                        <div className={styles.orderAmount}>₹{order.total_amount?.toFixed(2)}</div>
                        <button className={styles.expandToggle}>{isExpanded ? '▲' : '▼'}</button>
                      </div>
                    </div>

                    {/* Quick info */}
                    <div className={styles.orderQuickInfo}>
                      {[
                        { icon: '📅', text: new Date(order.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) },
                        { icon: '💳', text: order.payment_method },
                        { icon: '📦', text: `${order.items?.length || 0} items` },
                        ...(order.profiles ? [{ icon: '👤', text: order.profiles.full_name }] : [])
                      ].map((item, i) => (
                        <div key={i} className={styles.quickInfoItem}>
                          <span className={styles.infoIcon}>{item.icon}</span>
                          <span className={styles.infoText}>{item.text}</span>
                        </div>
                      ))}
                    </div>

                    {/* Expandable details */}
                    {isExpanded && (
                      <div className={styles.orderExpandedDetails}>
                        <div className={styles.orderItems}>
                          <h4>Order Items</h4>
                          {order.items?.map((item, idx) => (
                            <div key={idx} className={styles.orderItem}>
                              <span className={styles.itemName}>{item.name}</span>
                              <span className={styles.itemQuantity}>× {item.quantity}</span>
                              <span className={styles.itemPrice}>₹{item.price}</span>
                            </div>
                          ))}
                        </div>
                        {order.customer_notes && (
                          <div className={styles.customerNotes}><strong>📝 Customer Note:</strong> {order.customer_notes}</div>
                        )}
                      </div>
                    )}

                    {/* Action buttons */}
                    {getActionButtons(order)}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </main>
    </div>
  );
}