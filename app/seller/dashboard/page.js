'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { getSellerDashboard, getStoreDetails } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import { useNotifications } from '@/app/context/NotificationContext';
import { supabase } from '@/lib/supabase/client';
import { hasProductsFeature } from '@/lib/categoryConfig';
import toast from 'react-hot-toast';
import Sidebar from '../../components/Sidebar';
import styles from './SellerDashboard.module.css';

import {
  getHourlyActivity,
  getRecentOrders,
  getRecentQueueEntries,
  getTodayStats,
  getQueueStats,
  subscribeToDashboardUpdates
} from '@/lib/api/dashboard';

const POLL_INTERVAL    = 30_000; // 30 seconds
const STAT_INTERVAL    = 60_000; // 1 minute for heavier stats

export default function SellerDashboard() {
  const router = useRouter();
  const { unreadCount } = useNotifications();

  const [loading, setLoading]           = useState(true);
  const [currentTime, setCurrentTime]   = useState(new Date());
  const [storeId, setStoreId]           = useState(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [storeType, setStoreType]       = useState('');
  const [hasProducts, setHasProducts]   = useState(true);
  const [storeConfig, setStoreConfig]   = useState(null);
  const [latestOrder, setLatestOrder]   = useState(null);
  const [showOrderAlert, setShowOrderAlert] = useState(false);

  const [dashboardData, setDashboardData] = useState({
    store: { id: null, name: '', type: '', is_open: false },
    stats: {
      today_orders: 0, order_change: 0,
      today_revenue: 0, revenue_change: 0,
      today_customers: 0, customer_change: 0,
      completion_rate: 0, completion_change: 0
    },
    queue: { total_in_queue: 0, served_today: 0 }
  });

  const [storeDetails, setStoreDetails]   = useState(null);
  const [recentOrders, setRecentOrders]   = useState([]);
  const [recentQueue, setRecentQueue]     = useState([]);
  const [hourlyData, setHourlyData]       = useState([]);
  const [waitingQueueList, setWaitingQueueList] = useState([]);
  const [queueLoading, setQueueLoading]   = useState(false);

  // Stable ref for storeId so callbacks don't go stale
  const storeIdRef     = useRef(null);
  const hasProductsRef = useRef(true);

  const avgWaitTime = useMemo(() => {
    if (!storeConfig) return 0;
    return storeConfig.avg_service_time ?? storeConfig.estimated_service_time ?? 15;
  }, [storeConfig]);

  const isQueueOnly = !hasProducts;

  // ── Sidebar collapse detection ──────────────────────────────────────────────
  useEffect(() => {
    const check = () => {
      const sidebar = document.querySelector('[class*="sidebar"]');
      if (sidebar) {
        setIsSidebarCollapsed(
          sidebar.classList.contains('collapsed') ||
          sidebar.className.includes('collapsed')
        );
      }
    };
    check();
    const observer = new MutationObserver(check);
    const sidebar = document.querySelector('[class*="sidebar"]');
    if (sidebar) observer.observe(sidebar, { attributes: true, attributeFilter: ['class'] });
    window.addEventListener('resize', check);
    return () => { observer.disconnect(); window.removeEventListener('resize', check); };
  }, []);

  // ── Helpers ─────────────────────────────────────────────────────────────────

  const formatTimeValue = (date) => {
    try { return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }); }
    catch { return ''; }
  };

  function isBusinessHour(hourStr) {
    const h = parseInt(hourStr.replace(/[^\d]/g, ''));
    return h >= 9 && h <= 21;
  }

  function getDefaultHourlyData() {
    return ['9AM','10AM','11AM','12PM','1PM','2PM','3PM','4PM','5PM','6PM']
      .map(h => ({ hour: h, customers: 0, revenue: 0 }));
  }

  // ── Live queue fetch ────────────────────────────────────────────────────────
  // For product-based stores: only show 'waiting' and 'in_service' — 
  // 'ready' customers have already been served at the counter and don't need
  // to remain in the visible queue.
  // For queue-only stores: include 'ready' as well since it's still relevant.
  const loadWaitingQueueList = useCallback(async (id) => {
    const targetId = id ?? storeIdRef.current;
    if (!targetId) return;
    setQueueLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];

      // Determine which statuses to show based on store type
      const statusFilter = hasProductsRef.current
        ? ['waiting', 'in_service']          // product-based: exclude 'ready'
        : ['waiting', 'in_service', 'ready']; // queue-only: include 'ready'

      const { data, error } = await supabase
        .from('queue')
        .select(`id, token_number, customer_name, customer_phone, order_items, total_amount, wait_time_minutes, issued_at, status, priority, queue_position, token_sequence`)
        .eq('store_id', targetId)
        .eq('issued_date', today)
        .in('status', statusFilter)
        .order('token_sequence', { ascending: true });

      if (error) { console.error('❌ live queue error:', error); return; }

      const formatted = (data || []).map(entry => ({
        id: entry.id,
        tokenNumber: entry.token_number,
        customerName: entry.customer_name || 'Customer',
        customerPhone: entry.customer_phone || '',
        orderItems: Array.isArray(entry.order_items) ? entry.order_items : [],
        totalAmount: entry.total_amount || 0,
        waitTime: entry.wait_time_minutes || 0,
        orderTime: formatTimeValue(new Date(entry.issued_at)),
        status: entry.status,
        priority: entry.priority || 'normal',
        position: entry.queue_position ?? entry.token_sequence,
      }));
      setWaitingQueueList(formatted);
    } catch (err) {
      console.error('Unexpected error loading live queue:', err);
    } finally {
      setQueueLoading(false);
    }
  }, []);

  // ── Lightweight queue stats refresh ────────────────────────────────────────
  const refreshQueueStats = useCallback(async () => {
    const id = storeIdRef.current;
    if (!id) return;
    const result = await getQueueStats(id);
    if (result.data) {
      setDashboardData(prev => ({ ...prev, queue: result.data }));
    }
  }, []);

  // ── Full stats refresh (heavier, runs every minute) ────────────────────────
  const refreshStats = useCallback(async () => {
    const id = storeIdRef.current;
    if (!id) return;
    const queueOnly = !hasProductsRef.current;

    const [statsResult, queueResult, hourlyResult] = await Promise.all([
      getTodayStats(id, queueOnly),
      getQueueStats(id),
      getHourlyActivity(id, queueOnly),
    ]);

    if (statsResult.data) setDashboardData(prev => ({ ...prev, stats: statsResult.data }));
    if (queueResult.data) setDashboardData(prev => ({ ...prev, queue: queueResult.data }));
    if (hourlyResult.data) {
      const filtered = hourlyResult.data.filter(h => h.customers > 0 || isBusinessHour(h.hour));
      setHourlyData(filtered.length > 0 ? filtered : getDefaultHourlyData());
    }

    // Refresh recent list
    if (queueOnly) {
      const r = await getRecentQueueEntries(id, 5);
      if (r.data) setRecentQueue(r.data);
    } else {
      const r = await getRecentOrders(id, 3);
      if (r.data) setRecentOrders(r.data);
    }
  }, []);

  // ── Initial data load ───────────────────────────────────────────────────────
  useEffect(() => {
    async function loadDashboard() {
      try {
        setLoading(true);
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user) { router.push('/auth/signin'); return; }

        const { data: store, error: storeError } = await supabase
          .from('stores')
          .select('id, store_name, store_type, is_open, avg_service_time, estimated_service_time')
          .eq('owner_id', user.id)
          .single();

        if (storeError || !store) {
          toast.error('Store not found. Please complete registration.');
          router.push('/seller/register');
          return;
        }

        storeIdRef.current     = store.id;
        hasProductsRef.current = hasProductsFeature(store.store_type || 'retail');

        setStoreId(store.id);
        setStoreConfig(store);

        const currentStoreType = store.store_type || 'retail';
        const storeHasProducts = hasProductsFeature(currentStoreType);
        const storeIsQueueOnly = !storeHasProducts;

        setStoreType(currentStoreType);
        setHasProducts(storeHasProducts);

        const dashboardResult = await getSellerDashboard();
        if (dashboardResult.success && dashboardResult.data) {
          setDashboardData(dashboardResult.data);
        }

        const [statsResult, queueResult, hourlyResult] = await Promise.all([
          getTodayStats(store.id, storeIsQueueOnly),
          getQueueStats(store.id),
          getHourlyActivity(store.id, storeIsQueueOnly),
        ]);

        if (statsResult.data) setDashboardData(prev => ({ ...prev, stats: statsResult.data }));
        if (queueResult.data) setDashboardData(prev => ({ ...prev, queue: queueResult.data }));

        if (hourlyResult.data) {
          const filtered = hourlyResult.data.filter(h => h.customers > 0 || isBusinessHour(h.hour));
          setHourlyData(filtered.length > 0 ? filtered : getDefaultHourlyData());
        } else {
          setHourlyData(getDefaultHourlyData());
        }

        await loadWaitingQueueList(store.id);

        if (storeIsQueueOnly) {
          const r = await getRecentQueueEntries(store.id, 5);
          if (r.data) setRecentQueue(r.data);
        } else {
          const r = await getRecentOrders(store.id, 3);
          if (r.data) setRecentOrders(r.data);
        }

        const storeResult = await getStoreDetails();
        if (storeResult.success) setStoreDetails(storeResult.data);

      } catch (error) {
        console.error('Dashboard load error:', error);
        toast.error('Failed to load dashboard');
      } finally {
        setLoading(false);
      }
    }
    loadDashboard();
  }, [router, loadWaitingQueueList]);

  // ── Real-time + polling + visibility/focus auto-refresh ────────────────────
  useEffect(() => {
    if (!storeId) return;

    // 1. Supabase real-time subscription
    const cleanup = subscribeToDashboardUpdates(storeId, {
      onOrderUpdate: !isQueueOnly
        ? async (payload) => {
            if (payload.eventType === 'INSERT') {
              const newOrder = payload.new;
              setLatestOrder(newOrder);
              setShowOrderAlert(true);
              setTimeout(() => setShowOrderAlert(false), 10000);

              setDashboardData(prev => ({
                ...prev,
                stats: {
                  ...prev.stats,
                  today_orders:  prev.stats.today_orders + 1,
                  today_revenue: prev.stats.today_revenue + (parseFloat(newOrder.total_amount) || 0)
                }
              }));

              const r = await getRecentOrders(storeId, 3);
              if (r.data) setRecentOrders(r.data);

              toast.success(`New Order #${newOrder.order_number}!`, { duration: 5000, icon: '🎉' });
            }
          }
        : undefined,

      onQueueUpdate: async (payload) => {
        // Refresh queue list + stats on every realtime change
        await Promise.all([
          loadWaitingQueueList(storeId),
          refreshQueueStats(),
        ]);

        if (isQueueOnly) {
          const r = await getRecentQueueEntries(storeId, 5);
          if (r.data) setRecentQueue(r.data);

          if (payload.eventType === 'INSERT') {
            setDashboardData(prev => ({
              ...prev,
              stats: {
                ...prev.stats,
                today_customers: (prev.stats.today_customers || 0) + 1,
                today_orders:    (prev.stats.today_orders    || 0) + 1
              }
            }));
            toast.success('New customer joined the queue!', { duration: 4000, icon: '👋' });
          }
        }
      }
    });

    // 2. Lightweight queue poll every 30s (catches missed realtime events)
    const queuePoll = setInterval(() => {
      loadWaitingQueueList();
      refreshQueueStats();
    }, POLL_INTERVAL);

    // 3. Full stats refresh every 60s
    const statPoll = setInterval(() => {
      refreshStats();
    }, STAT_INTERVAL);

    // 4. Refetch everything when tab becomes visible again
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        loadWaitingQueueList();
        refreshStats();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    // 5. Refetch on window focus
    const handleFocus = () => {
      loadWaitingQueueList();
      refreshQueueStats();
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      cleanup?.();
      clearInterval(queuePoll);
      clearInterval(statPoll);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleFocus);
    };
  }, [storeId, isQueueOnly, loadWaitingQueueList, refreshQueueStats, refreshStats]);

  // ── Clock ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (date) =>
    date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  const formatDate = (date) =>
    date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const handleQuickAction = (action) => {
    switch (action) {
      case 'Manage Queue': router.push('/seller/queue'); break;
      case 'Add Product':
        hasProducts ? router.push('/seller/products') : toast.error('Not available for queue-only services');
        break;
      case 'Issue Token': router.push('/seller/queue'); break;
      case 'View Reports': router.push('/seller/analytics'); break;
      default: break;
    }
  };

  const getQueueStatusLabel = (status) => ({
    waiting: '⏳ Waiting', in_service: '✂️ In Service', ready: '✓ Ready',
    completed: '✓ Done', served: '✓ Served', cancelled: '✕ Cancelled', no_show: '✕ No Show'
  }[status] || status);

  const getQueueStatusClass = (status) => ({
    waiting: styles.statusPending, in_service: styles.statusPreparing,
    ready: styles.statusReady, completed: styles.statusCompleted,
    served: styles.statusCompleted, cancelled: styles.statusCancelled,
    no_show: styles.statusCancelled
  }[status] || styles.statusPending);

  const getStatusPill = (status) => ({
    waiting:    { label: '⏳ Waiting',    bg: '#fef3c7', color: '#92400e' },
    in_service: { label: '✂️ In Service', bg: '#dbeafe', color: '#1e40af' },
    ready:      { label: '✓ Ready',       bg: '#d1fae5', color: '#065f46' },
  }[status] || { label: status, bg: '#f3f4f6', color: '#374151' });

  if (loading) {
    return (
      <div className={styles.dashboard}>
        <Sidebar />
        <main className={`${styles.mainContent} ${isSidebarCollapsed ? styles.mainContentCollapsed : ''}`}>
          <div className={styles.loadingContainer}>
            <div className={styles.loader}></div>
            <p>Loading dashboard...</p>
          </div>
        </main>
      </div>
    );
  }

  const maxCustomers = Math.max(...hourlyData.map(d => d.customers), 1);
  const { store, stats, queue } = dashboardData;

  return (
    <div className={styles.dashboard}>
      <Sidebar />

      <main className={`${styles.mainContent} ${isSidebarCollapsed ? styles.mainContentCollapsed : ''}`}>

        {/* ── New Order Alert ── */}
        {!isQueueOnly && showOrderAlert && latestOrder && (
          <div className={styles.orderAlertOverlay}>
            <div className={styles.orderAlertCard}>
              <div className={styles.orderAlertHeader}>
                <h3>🎉 New Order Received!</h3>
                <button className={styles.orderAlertClose} onClick={() => setShowOrderAlert(false)}>✕</button>
              </div>
              <div className={styles.orderAlertBody}>
                <div className={styles.orderAlertInfo}>
                  <div className={styles.orderAlertRow}><span>Order Number:</span><strong>#{latestOrder.order_number}</strong></div>
                  <div className={styles.orderAlertRow}><span>Amount:</span><strong className={styles.orderAlertAmount}>₹{parseFloat(latestOrder.total_amount || 0).toFixed(2)}</strong></div>
                  <div className={styles.orderAlertRow}><span>Items:</span><strong>{latestOrder.items?.length || 0} items</strong></div>
                  <div className={styles.orderAlertRow}><span>Payment:</span><strong>{latestOrder.payment_method}</strong></div>
                </div>
              </div>
              <div className={styles.orderAlertActions}>
                <button className={styles.orderAlertBtnPrimary} onClick={() => { setShowOrderAlert(false); router.push('/seller/orders'); }}>View Order →</button>
                <button className={styles.orderAlertBtnSecondary} onClick={() => setShowOrderAlert(false)}>Dismiss</button>
              </div>
            </div>
          </div>
        )}

        {/* ── Top Bar ── */}
        <header className={styles.topBar}>
          <div className={styles.topBarLeft}>
            <h1 className={styles.pageTitle}>Dashboard</h1>
            <div className={styles.dateTime}>
              <div className={styles.date}>{formatDate(currentTime)}</div>
              <div className={styles.time}>{formatTime(currentTime)}</div>
            </div>
          </div>
          <div className={styles.topBarRight}>
            <button className={styles.iconButton} onClick={() => router.push('/seller/notifications')}>
              {unreadCount > 0 && <span className={styles.notificationBadge}>{unreadCount}</span>}
              🔔
            </button>
            <button className={styles.iconButton} onClick={() => router.push('/seller/settings')}>⚙️</button>
          </div>
        </header>

        {/* ── Store Banner ── */}
        {store && store.name && (
          <div className={`${styles.storeBanner} ${store.is_open ? styles.storeOpen : styles.storeClosed}`}>
            <div className={styles.storeBannerContent}>
              <div className={styles.storeBannerLeft}>
                <h2>{store.name}</h2>
                <div style={{ display:'flex', alignItems:'center', gap:'0.75rem', flexWrap:'wrap' }}>
                  <span className={styles.storeType}>{store.type}</span>
                  {isQueueOnly && (
                    <span style={{ padding:'0.375rem 0.875rem', background:'#fef3c7', color:'#92400e', borderRadius:'0.5rem', fontSize:'0.75rem', fontWeight:'700', textTransform:'uppercase', letterSpacing:'0.05em' }}>
                      Queue-Only Service
                    </span>
                  )}
                </div>
              </div>
              <div className={styles.storeBannerRight}>
                <span className={styles.storeStatus}>{store.is_open ? '🟢 Open' : '🔴 Closed'}</span>
              </div>
            </div>
          </div>
        )}

        {/* ── Live Queue Summary Banner ── */}
        <div className={styles.liveAlert}>
          <div className={styles.liveAlertContent}>
            <div className={styles.liveIndicator}>
              <span className={styles.liveDot}></span>
              <span className={styles.liveText}>LIVE QUEUE</span>
            </div>
            <div className={styles.liveStats}>
              <div className={styles.liveStat}>
                <span className={styles.liveStatLabel}>Active</span>
                <span className={styles.liveStatValue}>{waitingQueueList.length}</span>
              </div>
              <div className={styles.liveStat}>
                <span className={styles.liveStatLabel}>Waiting</span>
                <span className={styles.liveStatValue}>{waitingQueueList.filter(e => e.status === 'waiting').length}</span>
              </div>
              <div className={styles.liveStat}>
                <span className={styles.liveStatLabel}>Served Today</span>
                <span className={styles.liveStatValue}>{queue?.served_today || 0}</span>
              </div>
              <div className={styles.liveStat}>
                <span className={styles.liveStatLabel}>Avg Wait</span>
                <span className={styles.liveStatValue}>{avgWaitTime} min</span>
              </div>
            </div>
            <button className={styles.manageQueueBtn} onClick={() => handleQuickAction('Manage Queue')}>
              Manage Queue →
            </button>
          </div>
        </div>

        {/* ── Live Queue Cards ── */}
        <div className={styles.liveQueueSection}>
          <div className={styles.liveQueueHeader}>
            <h3 className={styles.liveQueueTitle}>
              <span className={styles.liveQueueIcon}>⏳</span>
              Currently in Queue
            </h3>
            <div style={{ display:'flex', alignItems:'center', gap:'0.75rem', flexWrap:'wrap' }}>
              <span className={styles.liveQueueCount}>{waitingQueueList.length} active</span>
              <button
                onClick={() => loadWaitingQueueList(storeId)}
                disabled={queueLoading}
                style={{
                  padding:'0.3rem 0.75rem', background:'#f3f4f6', border:'1px solid #e5e7eb',
                  borderRadius:'0.5rem', fontSize:'0.75rem',
                  cursor: queueLoading ? 'not-allowed' : 'pointer', color:'#374151'
                }}
              >
                {queueLoading ? '...' : '↻ Refresh'}
              </button>
            </div>
          </div>

          {queueLoading ? (
            <div style={{ textAlign:'center', padding:'2rem', color:'#94A3B8' }}>Loading queue...</div>
          ) : waitingQueueList.length === 0 ? (
            <div style={{ background:'#f9fafb', border:'2px dashed #e5e7eb', borderRadius:'1rem', padding:'2rem', textAlign:'center', color:'#9ca3af' }}>
              <div style={{ fontSize:'2rem', marginBottom:'0.5rem' }}>🎉</div>
              <div style={{ fontWeight:'600' }}>Queue is empty right now</div>
              <div style={{ fontSize:'0.875rem', marginTop:'0.25rem' }}>New customers will appear here automatically</div>
            </div>
          ) : (
            <>
              <div className={styles.liveQueueGrid}>
                {waitingQueueList.slice(0, 4).map((customer, index) => {
                  const pill = getStatusPill(customer.status);
                  return (
                    <div
                      key={customer.id}
                      className={styles.liveQueueCard}
                      style={
                        customer.status === 'in_service' ? { borderLeft:'4px solid #3b82f6' } :
                        customer.status === 'ready'      ? { borderLeft:'4px solid #10b981' } : {}
                      }
                    >
                      <div className={styles.liveQueueCardHeader}>
                        <div className={styles.queuePositionBadge}>#{index + 1}</div>
                        <div style={{ display:'flex', gap:'0.35rem', flexWrap:'wrap', alignItems:'center' }}>
                          <span style={{ padding:'0.2rem 0.55rem', background:pill.bg, color:pill.color, borderRadius:'999px', fontSize:'0.68rem', fontWeight:'700' }}>
                            {pill.label}
                          </span>
                          {customer.priority === 'urgent' && (
                            <span className={styles.urgentTag}>⚡ URGENT</span>
                          )}
                        </div>
                      </div>
                      <div className={styles.liveQueueCardBody}>
                        <div className={styles.queueCustomerName}>
                          <span className={styles.customerIcon}>👤</span>
                          {customer.customerName}
                        </div>
                        <div className={styles.queueMeta}>
                          <span className={styles.queueWaitTime}>⏱️ {customer.waitTime} min</span>
                          <span className={styles.queueOrderTime}>🕐 {customer.orderTime}</span>
                        </div>
                        {customer.orderItems.length > 0 && (
                          <div className={styles.queueOrderInfo}>
                            <span>📦 {customer.orderItems.length} items</span>
                            <span>₹{customer.totalAmount}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {waitingQueueList.length > 4 && (
                <div className={styles.liveQueueFooter}>
                  <button className={styles.viewAllQueueBtn} onClick={() => router.push('/seller/queue')}>
                    View All {waitingQueueList.length} in Queue →
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Stat Cards ── */}
        <div className={styles.statsGrid}>
          <div className={`${styles.statCard} ${styles.statCardPrimary}`}>
            <div className={styles.statIcon}>{isQueueOnly ? '👥' : '📦'}</div>
            <div className={styles.statContent}>
              <div className={styles.statLabel}>{isQueueOnly ? "Today's Customers" : "Today's Orders"}</div>
              <div className={styles.statValue}>{isQueueOnly ? (stats?.today_customers || 0) : (stats?.today_orders || 0)}</div>
              <div className={styles.statChange}>
                <span className={(isQueueOnly ? stats?.customer_change : stats?.order_change) >= 0 ? styles.statChangeUp : styles.statChangeDown}>
                  {(isQueueOnly ? stats?.customer_change : stats?.order_change) >= 0 ? '↑' : '↓'}
                  {' '}{Math.abs(isQueueOnly ? stats?.customer_change || 0 : stats?.order_change || 0)}%
                </span>
                <span className={styles.statChangeText}>from yesterday</span>
              </div>
            </div>
          </div>

          {hasProducts && (
            <div className={`${styles.statCard} ${styles.statCardSuccess}`}>
              <div className={styles.statIcon}>💰</div>
              <div className={styles.statContent}>
                <div className={styles.statLabel}>Today's Revenue</div>
                <div className={styles.statValue}>₹{(stats?.today_revenue || 0).toLocaleString('en-IN')}</div>
                <div className={styles.statChange}>
                  <span className={stats?.revenue_change >= 0 ? styles.statChangeUp : styles.statChangeDown}>
                    {stats?.revenue_change >= 0 ? '↑' : '↓'} {Math.abs(stats?.revenue_change || 0)}%
                  </span>
                  <span className={styles.statChangeText}>from yesterday</span>
                </div>
              </div>
            </div>
          )}

          <div className={`${styles.statCard} ${styles.statCardWarning}`}>
            <div className={styles.statIcon}>⏱️</div>
            <div className={styles.statContent}>
              <div className={styles.statLabel}>Avg Wait Time</div>
              <div className={styles.statValue}>{avgWaitTime} min</div>
              <div className={styles.statChange}><span className={styles.statChangeText}>per customer</span></div>
            </div>
          </div>

          <div className={`${styles.statCard} ${styles.statCardInfo}`}>
            <div className={styles.statIcon}>✅</div>
            <div className={styles.statContent}>
              <div className={styles.statLabel}>Completion Rate</div>
              <div className={styles.statValue}>{stats?.completion_rate || 0}%</div>
              <div className={styles.statChange}>
                <span className={stats?.completion_change >= 0 ? styles.statChangeUp : styles.statChangeDown}>
                  {stats?.completion_change >= 0 ? '↑' : '↓'} {Math.abs(stats?.completion_change || 0)}%
                </span>
                <span className={styles.statChangeText}>from yesterday</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Chart + Recent List ── */}
        <div className={styles.contentGrid}>
          <div className={styles.chartCard}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>Today's Activity</h2>
              <div className={styles.chartLegend}>
                <span className={styles.legendItem}>
                  <span className={`${styles.legendDot} ${styles.legendDotPrimary}`}></span>
                  {isQueueOnly ? 'Customers' : 'Orders'}
                </span>
              </div>
            </div>
            <div className={styles.chartContainer}>
              {hourlyData.length > 0 ? (
                hourlyData.map((data, index) => (
                  <div key={`hour-${data.hour}-${index}`} className={styles.chartBar}>
                    <div className={styles.barFill} style={{ height:`${(data.customers / maxCustomers) * 100}%` }}>
                      <span className={styles.barValue}>{data.customers}</span>
                    </div>
                    <div className={styles.barLabel}>{data.hour}</div>
                  </div>
                ))
              ) : (
                <div style={{ textAlign:'center', padding:'2rem', color:'#94A3B8', width:'100%' }}>No activity data yet today</div>
              )}
            </div>
          </div>

          {isQueueOnly ? (
            <div className={styles.ordersCard}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>Recent Customers</h2>
                <a href="/seller/queue" className={styles.cardLink}>View Queue →</a>
              </div>
              <div className={styles.ordersTable}>
                {recentQueue.length === 0 ? (
                  <div className={styles.emptyOrders}><p>No customers yet today.</p></div>
                ) : (
                  recentQueue.map((entry) => (
                    <div key={entry.id} className={styles.orderRow}>
                      <div className={styles.orderInfo}>
                        <div className={styles.orderCustomer}>{entry.customer}</div>
                        <div className={styles.orderDetails}>
                          <div className={styles.orderMeta}>
                            {entry.waitTime > 0 && (<span>~{entry.waitTime} min</span>)}
                          </div>
                          <div className={styles.orderTime}>{entry.time}</div>
                        </div>
                      </div>
                      <div className={styles.orderRight}>
                        <span className={`${styles.orderStatus} ${getQueueStatusClass(entry.status)}`}>
                          {getQueueStatusLabel(entry.status)}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className={styles.ordersCard}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>Recent Orders</h2>
                <a href="/seller/orders" className={styles.cardLink}>View All →</a>
              </div>
              <div className={styles.ordersTable}>
                {recentOrders.length === 0 ? (
                  <div className={styles.emptyOrders}><p>No orders yet.</p></div>
                ) : (
                  recentOrders.map((order) => (
                    <div key={order.id} className={styles.orderRow}>
                      <div className={styles.orderInfo}>
                        <div className={styles.orderCustomer}>{order.customer}</div>
                        <div className={styles.orderDetails}>
                          <div className={styles.orderMeta}>
                            <span>{order.orderNumber}</span><span>•</span><span>{order.items} items</span>
                          </div>
                          <div className={styles.orderTime}>{order.time}</div>
                        </div>
                      </div>
                      <div className={styles.orderRight}>
                        <div className={styles.orderAmount}>₹{parseFloat(order.amount).toFixed(2)}</div>
                        <span className={`${styles.orderStatus} ${
                          order.status === 'completed' ? styles.statusCompleted :
                          order.status === 'ready'     ? styles.statusReady :
                          order.status === 'preparing' ? styles.statusPreparing :
                          order.status === 'cancelled' ? styles.statusCancelled :
                          styles.statusPending
                        }`}>
                          {order.status === 'completed' ? '✓ Done' :
                           order.status === 'ready'     ? '✓ Ready' :
                           order.status === 'preparing' ? '⏳ Preparing' :
                           order.status === 'cancelled' ? '✕ Cancelled' :
                           '⏱️ Pending'}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

      </main>
    </div>
  );
}