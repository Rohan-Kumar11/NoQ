// app/seller/queue/page.js
//
// ✅ Queue-only shop changes (conditional on isQueueOnly flag):
// 1. Detects store_type and sets isQueueOnly = store not in product-based types
// 2. Replaces "Live Queue Active" info section with Token Confirmation panel
// 3. Token confirmation: seller selects from dropdown of waiting tokens → confirms
// 4. Serving button changed from "Mark as Served" to "Mark as Served" → calls markAsCompleted()
// 5. No auto-call after completing service
// 6. Auto-transition timer disabled for queue-only shops
//
// ✅ Product shop behavior: ZERO changes — all existing logic preserved behind isQueueOnly checks
//
'use client';

import { useState, useEffect } from 'react';
import Sidebar from '../../components/Sidebar';
import LiveIndicator from '../../components/LiveIndicator';
import styles from './QueueManagement.module.css';
import { supabase } from '@/lib/supabase/client';
import {
  getSellerStoreId,
  getCurrentServingToken,
  getWaitingQueue,
  getQueueStats,
  callNextCustomer,
  callNextByToken,
  markAsServed,
  markAsCompleted,
  skipQueueEntry,
  getStoreSettings,
  toggleStoreStatus,
  updateQueueSettings,
  checkAndAutoTransition,
  isProductBasedStore,
} from '@/lib/api/queue';
import { subscribeToSellerQueue } from '@/lib/api/realtime';
import toast from 'react-hot-toast';

export default function QueueManagement() {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [storeId, setStoreId] = useState(null);
  const [storeName, setStoreName] = useState('');
  const [storeType, setStoreType] = useState('');
  const [isQueueOnly, setIsQueueOnly] = useState(false);
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(true);

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const [queueStatus, setQueueStatus] = useState('active');
  const [autoCallNext, setAutoCallNext] = useState(false);
  const [activeToken, setActiveToken] = useState(null);
  const [queueList, setQueueList] = useState([]);
  const [queueStats, setQueueStats] = useState({
    totalInQueue: 0,
    avgWaitTime: 0,
    servedToday: 0,
    cancelledToday: 0,
  });

  // ── Queue-only: token confirmation state ─────────────────────────────────
  const [selectedTokenId, setSelectedTokenId] = useState('');
  const [isConfirmingToken, setIsConfirmingToken] = useState(false);

  // ── Sidebar collapse detection ────────────────────────────────────────────
  useEffect(() => {
    const handleSidebarToggle = () => {
      const sidebar = document.querySelector('[class*="sidebar"]');
      if (sidebar) {
        const isCollapsed =
          sidebar.classList.contains('collapsed') ||
          sidebar.className.includes('collapsed');
        setIsSidebarCollapsed(isCollapsed);
      }
    };

    handleSidebarToggle();
    const observer = new MutationObserver(handleSidebarToggle);
    const sidebar = document.querySelector('[class*="sidebar"]');
    if (sidebar) {
      observer.observe(sidebar, { attributes: true, attributeFilter: ['class'] });
    }
    window.addEventListener('resize', handleSidebarToggle);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', handleSidebarToggle);
    };
  }, []);

  // ── Clock ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // ── Auto-transition timer — PRODUCT SHOPS ONLY ────────────────────────────
  useEffect(() => {
    // ✅ Skip entirely for queue-only shops
    if (!storeId || !autoCallNext || isQueueOnly) {
      if (isQueueOnly) {
        console.log('⏰ Auto-transition: Skipped — queue-only shop');
      }
      return;
    }

    console.log('⏰ Starting auto-transition timer for store:', storeId);

    const checkTimer = setInterval(async () => {
      const result = await checkAndAutoTransition(storeId);
      if (result?.shouldReload) await loadQueueData();
    }, 10000);

    (async () => {
      const result = await checkAndAutoTransition(storeId);
      if (result?.shouldReload) await loadQueueData();
    })();

    return () => clearInterval(checkTimer);
  }, [storeId, autoCallNext, isQueueOnly]);

  // ── Initialize ────────────────────────────────────────────────────────────
  useEffect(() => {
    initializeQueue();
  }, []);

  // ── Realtime subscriptions ────────────────────────────────────────────────
  useEffect(() => {
    if (!storeId) return;

    console.log('🔔 Setting up realtime for store:', storeId);

    const unsubscribe = subscribeToSellerQueue(storeId, {
      onQueueUpdate: () => loadQueueData(),
      onOrderUpdate: () => loadQueueData(),
      onNewCustomer: (newEntry) => {
        toast.success(`New customer: ${newEntry.token_number}`, { icon: '🎫', duration: 4000 });
      },
      onError: (error) => {
        console.error('❌ Realtime error:', error);
        setIsRealtimeConnected(false);
        toast.error('Live updates disconnected. Reconnecting...');
        setTimeout(() => setIsRealtimeConnected(true), 3000);
      }
    });

    setIsRealtimeConnected(true);
    return () => unsubscribe();
  }, [storeId]);

  // ── Init queue ────────────────────────────────────────────────────────────
  const initializeQueue = async () => {
    try {
      setLoading(true);

      const { data: store, error: storeError } = await getSellerStoreId();
      if (storeError || !store) {
        toast.error('Failed to load store information');
        return;
      }

      setStoreId(store.id);
      setStoreName(store.store_name || 'Store');
      setStoreType(store.store_type || '');

      // ✅ Derive isQueueOnly from store_type
      const queueOnly = !isProductBasedStore(store.store_type);
      setIsQueueOnly(queueOnly);
      console.log(`🏪 Store type: "${store.store_type}" → isQueueOnly: ${queueOnly}`);

      const { data: settings } = await getStoreSettings(store.id);
      if (settings) {
        // Queue-only shops don't use auto_call_next — lock it off in state
        setAutoCallNext(queueOnly ? false : (settings.auto_call_next || false));
        setQueueStatus(settings.is_open ? 'active' : 'paused');
      }

      await loadQueueData(store.id);
    } catch (error) {
      console.error('Error initializing queue:', error);
      toast.error('Failed to initialize queue');
    } finally {
      setLoading(false);
    }
  };

  // ── Load queue data ───────────────────────────────────────────────────────
  const loadQueueData = async (id = storeId) => {
    if (!id) return;

    try {
      const { data: current } = await getCurrentServingToken(id);
      const formattedCurrent = current ? formatQueueEntry(current) : null;
      setActiveToken(formattedCurrent);

      const { data: waiting } = await getWaitingQueue(id);
      const formattedWaiting = waiting.map(formatQueueEntry);
      setQueueList(formattedWaiting);

      // Reset dropdown when queue reloads
      setSelectedTokenId('');

      const { data: stats } = await getQueueStats(id);
      setQueueStats(stats);

      // ✅ Auto-call next ONLY for product shops
      if (!current && formattedWaiting.length > 0 && autoCallNext && !isQueueOnly) {
        console.log('🤖 Auto-calling next (product shop)...');
        await handleCallNext();
      }
    } catch (error) {
      console.error('Error loading queue data:', error);
    }
  };

  const formatQueueEntry = (entry) => {
    const items = entry.order_items || [];
    const order = entry.orders || {};
    return {
      id: entry.id,
      tokenNumber: entry.token_number,
      customerName: entry.customer_name || 'Customer',
      customerPhone: entry.customer_phone || '',
      orderItems: items,
      totalAmount: entry.total_amount || 0,
      paymentStatus: order.payment_status || 'paid',
      waitTime: entry.wait_time_minutes || 0,
      orderTime: formatTime(new Date(entry.issued_at)),
      status: entry.status,
      priority: entry.priority || 'normal',
      queueId: entry.id,
      orderId: order.id || null,
      serviceStartedAt: entry.service_started_at || null,
      estimatedTime: entry.estimated_time || entry.wait_time_minutes || 5
    };
  };

  // ── Handlers: Product shop — Call Next ───────────────────────────────────
  // `skipActiveCheck` is used internally after marking as served, where we know
  // the active token has already been cleared by the DB — avoids stale closure issue.
  const handleCallNext = async (skipActiveCheck = false) => {
    if (!storeId) return;
    if (!skipActiveCheck && activeToken) {
      toast.error('Please complete current order before calling next');
      return;
    }
    try {
      const { data, error } = await callNextCustomer(storeId);
      if (error) {
        // Silently ignore "someone already being served" when called automatically
        // after mark-as-served — it means the DB still shows in_service briefly
        if (skipActiveCheck && error.includes('already being served')) return;
        toast.error(error);
        return;
      }
      if (data) {
        toast.success(`Called ${data.token_number} - ${data.customer_name}`, { icon: '📢', duration: 3000 });
        await loadQueueData();
      } else {
        if (!skipActiveCheck) toast.info('No customers in queue');
      }
    } catch (error) {
      toast.error('Failed to call next customer');
    }
  };

  // ── Handlers: Product shop — Mark as Ready ────────────────────────────────
  const handleMarkServed = async () => {
    if (!activeToken) { toast.error('No active customer'); return; }
    try {
      const { error } = await markAsServed(activeToken.queueId, storeId);
      if (error) { toast.error(error); return; }
      toast.success(`${activeToken.tokenNumber} marked as ready!`, { icon: '✅', duration: 3000 });
      // Reload first so activeToken is cleared in state
      await loadQueueData();
      // Auto-call next using skipActiveCheck=true to bypass the stale closure guard
      if (autoCallNext) {
        await handleCallNext(true);
      }
    } catch (error) {
      toast.error('Failed to mark as served');
    }
  };

  // ── Handlers: Queue-only — Confirm Token ──────────────────────────────────
  const handleConfirmToken = async () => {
    if (!selectedTokenId) {
      toast.error('Please select a token number first');
      return;
    }
    if (activeToken) {
      toast.error(`${activeToken.tokenNumber} is still being served. Mark them as served first.`);
      return;
    }

    setIsConfirmingToken(true);
    try {
      const { data, error } = await callNextByToken(storeId, selectedTokenId);
      if (error) { toast.error(error); return; }
      toast.success(
        `Token ${data.token_number} confirmed — ${data.customer_name || 'Customer'} is now being served`,
        { icon: '🎫', duration: 4000 }
      );
      setSelectedTokenId('');
      await loadQueueData();
    } catch (error) {
      toast.error('Failed to confirm token');
    } finally {
      setIsConfirmingToken(false);
    }
  };

  // ── Handlers: Queue-only — Mark as Completed ──────────────────────────────
  const handleMarkCompleted = async () => {
    if (!activeToken) { toast.error('No active customer to mark as served'); return; }
    try {
      const { error } = await markAsCompleted(activeToken.queueId, storeId);
      if (error) { toast.error(error); return; }
      toast.success(
        `${activeToken.tokenNumber} — service completed!`,
        { icon: '✅', duration: 3000 }
      );
      await loadQueueData();
      // ✅ No auto-call — seller must confirm next token manually
    } catch (error) {
      toast.error('Failed to mark as served');
    }
  };

  // ── Handlers: Shared ──────────────────────────────────────────────────────
  const handleSkipToken = async (queueId, tokenNumber) => {
    if (!window.confirm(`Remove ${tokenNumber} from queue?`)) return;
    try {
      const { error } = await skipQueueEntry(queueId, storeId);
      if (error) { toast.error(error); return; }
      toast.success(`${tokenNumber} removed from queue`, { icon: '❌' });
      await loadQueueData();
    } catch (error) {
      toast.error('Failed to skip token');
    }
  };

  const handlePauseQueue = async () => {
    const newStatus = queueStatus === 'active' ? 'paused' : 'active';
    const isOpen = newStatus === 'active';
    try {
      const { error } = await toggleStoreStatus(storeId, isOpen);
      if (error) { toast.error(error); return; }
      setQueueStatus(newStatus);
      toast.success(isOpen ? 'Queue resumed' : 'Queue paused', { icon: isOpen ? '▶️' : '⏸️' });
    } catch (error) {
      toast.error('Failed to toggle queue');
    }
  };

  const handleAutoCallToggle = async (checked) => {
    try {
      const { error } = await updateQueueSettings(storeId, { autoCallNext: checked });
      if (error) { toast.error(error); return; }
      setAutoCallNext(checked);
      toast.success(checked ? 'Auto-call enabled' : 'Auto-call disabled');
    } catch (error) {
      toast.error('Failed to update settings');
    }
  };

  // ── Time remaining (product shops) ────────────────────────────────────────
  const getTimeRemaining = () => {
    if (!activeToken || !activeToken.serviceStartedAt) return null;
    try {
      const now = new Date();
      const started = new Date(activeToken.serviceStartedAt);
      if (isNaN(started.getTime())) return null;
      const elapsedMinutes = Math.round((now - started) / 60000);
      const estimatedTime = activeToken.estimatedTime || 5;
      const remainingMinutes = estimatedTime - elapsedMinutes;
      return { elapsed: elapsedMinutes, remaining: remainingMinutes, isOvertime: remainingMinutes < 0 };
    } catch {
      return null;
    }
  };

  const formatTime = (date) =>
    date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });

  const formatDate = (date) =>
    date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  // ── Loading state ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className={styles.dashboard}>
        <Sidebar />
        <main className={styles.mainContent}>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ fontSize: '3rem' }}>⏳</div>
            <p style={{ fontSize: '1.2rem', color: '#666666' }}>Loading queue management...</p>
          </div>
        </main>
      </div>
    );
  }

  const timeInfo = getTimeRemaining();

  return (
    <div className={styles.dashboard}>
      <Sidebar />

      <main className={`${styles.mainContent} ${isSidebarCollapsed ? styles.mainContentCollapsed : ''}`}>

        {/* ── Top Bar ───────────────────────────────────────────────────────── */}
        <header className={styles.topBar}>
          <div className={styles.topBarLeft}>
            <h1 className={styles.pageTitle}>Live Queue Management</h1>
            <div className={styles.dateTime}>
              <div className={styles.date}>{formatDate(currentTime)}</div>
              <div className={styles.time}>{formatTime(currentTime)}</div>
            </div>
          </div>
          <div className={styles.topBarRight}>
            <LiveIndicator isConnected={isRealtimeConnected} />
            <div style={{ background: '#F5F5F0', padding: '0.5rem 1rem', borderRadius: '50px', fontWeight: '600', color: '#1a1a1a', border: '1px solid #E5E5E5' }}>
              {storeName}
            </div>
            {/* ✅ Show store mode badge */}
            <div className={isQueueOnly ? styles.modeTagQueueOnly : styles.modeTagProduct}>
              {isQueueOnly ? '🎫 Queue Only' : '🛒 Product Shop'}
            </div>
          </div>
        </header>

        {/* ── Status Bar ───────────────────────────────────────────────────── */}
        <div className={`${styles.statusBar} ${queueStatus === 'paused' ? styles.statusBarPaused : ''}`}>
          <div className={styles.statusBarLeft}>
            <div className={styles.statusIndicator}>
              <span className={`${styles.statusDot} ${queueStatus === 'active' ? styles.statusDotActive : styles.statusDotPaused}`}></span>
              <span className={styles.statusText}>
                {queueStatus === 'active' ? 'Queue Active' : 'Queue Paused'}
              </span>
            </div>

            {/* ✅ Auto-call toggle only visible for product shops */}
            {!isQueueOnly && (
              <div className={styles.autoCallToggle}>
                <label className={styles.toggleLabel}>
                  <input
                    type="checkbox"
                    checked={autoCallNext}
                    onChange={(e) => handleAutoCallToggle(e.target.checked)}
                    className={styles.toggleInput}
                  />
                  <span className={styles.toggleSlider}></span>
                  <span className={styles.toggleText}>Auto-call next</span>
                </label>
              </div>
            )}
          </div>
          <div className={styles.statusBarRight}>
            <button
              className={`${styles.pauseBtn} ${queueStatus === 'paused' ? styles.resumeBtn : ''}`}
              onClick={handlePauseQueue}
            >
              {queueStatus === 'active' ? '⏸️ Pause Queue' : '▶️ Resume Queue'}
            </button>
          </div>
        </div>

        {/* ── Stats Grid ───────────────────────────────────────────────────── */}
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <div className={styles.statIcon}>👥</div>
            <div className={styles.statContent}>
              <div className={styles.statLabel}>In Queue</div>
              <div className={styles.statValue}>{queueStats.totalInQueue}</div>
            </div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statIcon}>⏱️</div>
            <div className={styles.statContent}>
              <div className={styles.statLabel}>Avg Wait Time</div>
              <div className={styles.statValue}>{queueStats.avgWaitTime} min</div>
            </div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statIcon}>✅</div>
            <div className={styles.statContent}>
              <div className={styles.statLabel}>Served Today</div>
              <div className={styles.statValue}>{queueStats.servedToday}</div>
            </div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statIcon}>❌</div>
            <div className={styles.statContent}>
              <div className={styles.statLabel}>Cancelled Today</div>
              <div className={styles.statValue}>{queueStats.cancelledToday}</div>
            </div>
          </div>
        </div>

        {/* ── Queue Grid ───────────────────────────────────────────────────── */}
        <div className={styles.queueGrid}>

          {/* ── Now Serving ──────────────────────────────────────────────── */}
          <div className={styles.currentServing}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Now Serving</h2>
              <span className={styles.servingBadge}>🔴 LIVE</span>
            </div>

            {activeToken ? (
              <div className={styles.activeTokenCard}>
                <div className={styles.tokenHeader}>
                  <div className={styles.tokenStatus}>
                    <span className={styles.statusBadge}>Serving</span>

                    {/* Time remaining: only shown for product shops */}
                    {!isQueueOnly && (
                      timeInfo ? (
                        <span className={`${styles.waitTimeBadge} ${timeInfo.isOvertime ? styles.overtimeBadge : ''}`}>
                          ⏱️ {timeInfo.isOvertime
                            ? `+${Math.abs(timeInfo.remaining)} min overtime`
                            : `${timeInfo.remaining} min left`}
                        </span>
                      ) : (
                        <span className={styles.waitTimeBadge}>⏱️ Calculating...</span>
                      )
                    )}
                  </div>

                  {/* Token number badge — shown for queue-only shops */}
                  {isQueueOnly && (
                    <div className={styles.tokenNumberDisplay}>
                      <span className={styles.tokenNumberLabel}>Token</span>
                      <span className={styles.tokenNumberValue}>{activeToken.tokenNumber}</span>
                    </div>
                  )}
                </div>

                <div className={styles.customerInfo}>
                  <div className={styles.customerName}>
                    <span className={styles.customerIcon}>👤</span>
                    {activeToken.customerName}
                  </div>
                  {activeToken.customerPhone && (
                    <div className={styles.customerPhone}>📞 {activeToken.customerPhone}</div>
                  )}
                  <div className={styles.orderTime}>🕐 Joined at {activeToken.orderTime}</div>
                </div>

                {/* Order details only shown for product shops */}
                {!isQueueOnly && (
                  <div className={styles.orderDetails}>
                    <div className={styles.orderHeader}>
                      <h3 className={styles.orderTitle}>Order Summary</h3>
                      <span className={`${styles.paymentBadge} ${activeToken.paymentStatus === 'paid' ? styles.paymentPaid : styles.paymentPending}`}>
                        {activeToken.paymentStatus === 'paid' ? '✓ Paid' : '⏳ Pending'}
                      </span>
                    </div>
                    {activeToken.orderItems.length > 0 ? (
                      <>
                        <div className={styles.orderItems}>
                          {activeToken.orderItems.map((item, index) => (
                            <div key={index} className={styles.orderItem}>
                              <div className={styles.itemInfo}>
                                <span className={styles.itemName}>{item.name}</span>
                                <span className={styles.itemQty}>x{item.quantity}</span>
                              </div>
                              <div className={styles.itemPrice}>₹{item.price * item.quantity}</div>
                            </div>
                          ))}
                        </div>
                        <div className={styles.orderTotal}>
                          <span className={styles.totalLabel}>Total Amount</span>
                          <span className={styles.totalValue}>₹{activeToken.totalAmount}</span>
                        </div>
                      </>
                    ) : (
                      <div style={{ padding: '1rem', background: '#F5F5F0', borderRadius: '12px', textAlign: 'center', color: '#666666' }}>
                        Queue-only service (no items)
                      </div>
                    )}
                  </div>
                )}

                {/* Action buttons — conditionally render by shop type */}
                <div className={styles.actionButtons}>
                  {isQueueOnly ? (
                    // ✅ Queue-only: single "Mark as Served" button → completed
                    <button
                      className={`${styles.actionBtn} ${styles.actionBtnSuccess}`}
                      onClick={handleMarkCompleted}
                      style={{ gridColumn: '1 / -1' }}
                    >
                      <span className={styles.btnIcon}>✓</span>
                      Mark as Served
                    </button>
                  ) : (
                    // Product shop: existing two-button layout
                    <>
                      <button
                        className={`${styles.actionBtn} ${styles.actionBtnSuccess}`}
                        onClick={handleMarkServed}
                      >
                        <span className={styles.btnIcon}>✓</span>
                        Mark as Served
                      </button>
                      <button
                        className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
                        onClick={handleCallNext}
                        disabled={queueList.length === 0}
                      >
                        <span className={styles.btnIcon}>📢</span>
                        Call Next
                      </button>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className={styles.emptyQueue}>
                <div className={styles.emptyIcon}>👋</div>
                <div className={styles.emptyText}>No customer being served</div>
                <div className={styles.emptySubtext}>
                  {queueList.length > 0
                    ? isQueueOnly
                      ? 'Confirm a token below to start serving'
                      : 'Click "Call Next" to serve the next customer'
                    : 'Waiting for customers...'}
                </div>
                {/* Product shops only — queue-only has the token panel below */}
                {!isQueueOnly && queueList.length > 0 && (
                  <button
                    className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
                    onClick={handleCallNext}
                    style={{ marginTop: '1rem' }}
                  >
                    <span className={styles.btnIcon}>📢</span>
                    Call Next Customer
                  </button>
                )}
              </div>
            )}
          </div>

          {/* ── Waiting Queue ─────────────────────────────────────────────── */}
          <div className={styles.queueList}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Waiting Queue</h2>
              <span className={styles.queueCount}>{queueList.length} in queue</span>
            </div>

            <div className={styles.queueItems}>
              {queueList.length === 0 ? (
                <div className={styles.emptyQueue}>
                  <div className={styles.emptyIcon}>🎉</div>
                  <div className={styles.emptyText}>No customers in queue</div>
                  <div className={styles.emptySubtext}>You're all caught up!</div>
                </div>
              ) : (
                queueList.map((token, index) => (
                  <div
                    key={token.id}
                    className={`${styles.queueCard} ${token.priority === 'urgent' ? styles.queueCardUrgent : ''}`}
                  >
                    <div className={styles.queueCardHeader}>
                      <div className={styles.queueTokenInfo}>
                        <div className={styles.queuePosition}>#{index + 1}</div>
                        {/* ✅ Show token number in waiting list for queue-only shops */}
                        {isQueueOnly && (
                          <div className={styles.queueTokenNumberBadge}>
                            {token.tokenNumber}
                          </div>
                        )}
                        {token.priority === 'urgent' && (
                          <span className={styles.urgentBadge}>⚡ URGENT</span>
                        )}
                      </div>
                      <div className={styles.queueMetaTags}>
                        <div className={styles.queueWaitTime}>⏱️ {token.waitTime} min</div>
                        <span className={`${styles.queuePaymentStatusBadge} ${token.paymentStatus === 'paid' ? styles.queuePaymentPaid : styles.queuePaymentPending}`}>
                          {token.paymentStatus === 'paid' ? '✓ Paid' : '⏳ Pending'}
                        </span>
                      </div>
                    </div>

                    <div className={styles.queueCardBody}>
                      <div className={styles.queueCustomerName}>👤 {token.customerName}</div>
                      {!isQueueOnly && (
                        <div className={styles.queueOrderInfo}>
                          <span className={styles.queueOrderItems}>📦 {token.orderItems.length} items</span>
                          <span className={styles.queueOrderAmount}>₹{token.totalAmount}</span>
                        </div>
                      )}
                      <div className={styles.queueOrderTime}>🕐 {token.orderTime}</div>
                    </div>

                    <div className={styles.queueCardActions}>
                      <button
                        className={styles.queueActionBtn}
                        onClick={() => handleSkipToken(token.queueId, token.tokenNumber)}
                        title="Remove from queue"
                      >
                        ❌ Remove
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* ── Bottom Section: conditional on shop type ──────────────────────── */}
        {isQueueOnly ? (
          // ✅ Queue-only: Token Confirmation Panel
          <div className={styles.tokenConfirmSection}>
            <div className={styles.tokenConfirmHeader}>
              <div className={styles.tokenConfirmHeaderLeft}>
                <span className={styles.tokenConfirmIcon}>🎫</span>
                <div>
                  <h2 className={styles.tokenConfirmTitle}>Token Confirmation</h2>
                  <p className={styles.tokenConfirmSubtitle}>
                    Select the customer's token number to begin their service
                  </p>
                </div>
              </div>
              <div className={styles.tokenConfirmBadge}>
                Manual Control
              </div>
            </div>

            <div className={styles.tokenConfirmBody}>
              <div className={styles.tokenSelectGroup}>
                <label className={styles.tokenSelectLabel}>
                  Select Token Number
                </label>
                <div className={styles.tokenSelectRow}>
                  <select
                    className={styles.tokenSelect}
                    value={selectedTokenId}
                    onChange={(e) => setSelectedTokenId(e.target.value)}
                    disabled={!!activeToken || queueList.length === 0}
                  >
                    <option value="">
                      {queueList.length === 0
                        ? '— No customers in queue —'
                        : '— Select a token —'}
                    </option>
                    {queueList.map((token) => (
                      <option key={token.id} value={token.id}>
                        {token.tokenNumber} — {token.customerName}
                      </option>
                    ))}
                  </select>

                  <button
                    className={styles.tokenConfirmBtn}
                    onClick={handleConfirmToken}
                    disabled={!selectedTokenId || !!activeToken || isConfirmingToken}
                  >
                    {isConfirmingToken ? (
                      <>⏳ Confirming...</>
                    ) : (
                      <>✓ Confirm Token</>
                    )}
                  </button>
                </div>

                {activeToken && (
                  <p className={styles.tokenConfirmHint}>
                    ⚠️ Mark <strong>{activeToken.tokenNumber}</strong> as served before confirming the next token.
                  </p>
                )}

                {!activeToken && queueList.length === 0 && (
                  <p className={styles.tokenConfirmHint}>
                    Waiting for customers to join the queue.
                  </p>
                )}

                {!activeToken && queueList.length > 0 && !selectedTokenId && (
                  <p className={styles.tokenConfirmHint}>
                    👆 Choose a token from the dropdown, then click Confirm Token to start serving.
                  </p>
                )}
              </div>

              {/* Quick reference: next in line */}
              {queueList.length > 0 && (
                <div className={styles.nextInLinePreview}>
                  <div className={styles.nextInLineLabel}>Next in Line</div>
                  <div className={styles.nextInLineCard}>
                    <span className={styles.nextInLineToken}>{queueList[0].tokenNumber}</span>
                    <span className={styles.nextInLineName}>{queueList[0].customerName}</span>
                    <span className={styles.nextInLineTime}>Waiting {queueList[0].waitTime} min</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          // Product shop: original Live Queue info section
          <div className={styles.quickInfo}>
            <div className={styles.infoCard}>
              <div className={styles.infoIcon}>💡</div>
              <div className={styles.infoContent}>
                <div className={styles.infoTitle}>Live Queue System Active</div>
                <ul className={styles.infoList}>
                  <li>Updates automatically when customers join or leave</li>
                  <li>Real-time position tracking for all customers</li>
                  <li>Auto-call next feature for faster service</li>
                  <li>Automatic time-based transitions when service time is up</li>
                  <li>Live connection indicator shows system status</li>
                </ul>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}