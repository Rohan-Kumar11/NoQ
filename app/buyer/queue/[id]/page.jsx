// app/buyer/queue/[id]/page.jsx - WITH POSITION-BASED WAIT COUNTDOWN
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { 
  ArrowLeft, RefreshCw, Users, Store, MapPin,
  Package, CheckCircle, AlertCircle, Clock
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import toast from 'react-hot-toast';
import './queue.css';

// Queue-only store types that do NOT have a preparation countdown
const QUEUE_ONLY_STORE_TYPES = [
  'clinic', 'salon', 'saloon', 'spa', 'barbershop', 'barber',
  'parlour', 'parlor', 'lab', 'diagnostic', 'hospital',
  'veterinary', 'vet', 'dentist', 'bank', 'government',
];

const isQueueOnlyStore = (storeType) => {
  if (!storeType) return false;
  return QUEUE_ONLY_STORE_TYPES.includes(storeType.toLowerCase().replace(/[-_\s]/g, ''));
};

// ── SVG circular progress ring ────────────────────────────────────────────────
function ProgressRing({ percent, size = 120, stroke = 8, color = '#667eea' }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (Math.min(100, Math.max(0, percent)) / 100) * circ;

  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke="#e8e5e0" strokeWidth={stroke}
      />
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 1s linear' }}
      />
    </svg>
  );
}

export default function BuyerQueueView() {
  const router = useRouter();
  const pathname = usePathname();
  const queueId = pathname?.split('/').pop();

  // Core state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [queueData, setQueueData] = useState(null);
  const [storeData, setStoreData] = useState(null);
  const [orderData, setOrderData] = useState(null);
  const [myPosition, setMyPosition] = useState(0);
  const [peopleAhead, setPeopleAhead] = useState(0);
  const [estimatedWait, setEstimatedWait] = useState(0);
  const [currentServingToken, setCurrentServingToken] = useState(null);



  // ── NEW: position-based wait countdown (waiting status) ──────────────────
  // totalWaitSeconds = myPosition * avgServiceTime * 60
  // We calculate how many seconds have elapsed since the customer joined
  // (using issued_at), then subtract from total to get remaining.
  const [waitCountdown, setWaitCountdown] = useState({
    minutes: 0,
    seconds: 0,
    totalSeconds: 0,
    remainingSeconds: 0,
    percent: 0,        // 0–100 (how much has elapsed, for the ring)
    isUrgent: false,
  });
  const waitTimerRef = useRef(null);

  // ── Reminder state ────────────────────────────────────────────────────────
  const [reminderMinutes, setReminderMinutes] = useState('');  // user input
  const [reminderSet, setReminderSet] = useState(false);       // reminder is active
  const [reminderFired, setReminderFired] = useState(false);   // already fired
  const reminderTargetRef = useRef(null);                      // target remainingSeconds to fire at

  // ── Helpers ───────────────────────────────────────────────────────────────
  const startWaitCountdown = useCallback((position, avgServiceTimeMinutes, issuedAt) => {
    // Clear any existing interval
    if (waitTimerRef.current) clearInterval(waitTimerRef.current);

    const totalSeconds = position * avgServiceTimeMinutes * 60;
    if (totalSeconds <= 0) {
      setWaitCountdown({ minutes: 0, seconds: 0, totalSeconds: 0, remainingSeconds: 0, percent: 100, isUrgent: false });
      return;
    }

    const joinedAt = issuedAt ? new Date(issuedAt) : new Date();

    const tick = () => {
      const now = new Date();
      const elapsedSeconds = Math.floor((now - joinedAt) / 1000);
      const remaining = Math.max(0, totalSeconds - elapsedSeconds);
      const elapsed = totalSeconds - remaining;
      const percentElapsed = (elapsed / totalSeconds) * 100;

      setWaitCountdown({
        minutes: Math.floor(remaining / 60),
        seconds: remaining % 60,
        totalSeconds,
        remainingSeconds: remaining,
        percent: percentElapsed,
        isUrgent: remaining > 0 && remaining <= 120, // last 2 minutes
      });

      if (remaining === 0) {
        clearInterval(waitTimerRef.current);
      }
    };

    tick(); // run immediately
    waitTimerRef.current = setInterval(tick, 1000);
  }, [reminderFired]);

  const handleSetReminder = useCallback(() => {
    const mins = parseFloat(reminderMinutes);
    if (!mins || mins <= 0) {
      toast.error('Please enter a valid number of minutes');
      return;
    }
    const targetSeconds = Math.round(mins * 60);
    if (targetSeconds >= waitCountdown.remainingSeconds) {
      toast.error(`Reminder must be less than the remaining wait (${Math.ceil(waitCountdown.remainingSeconds / 60)} min)`);
      return;
    }
    reminderTargetRef.current = targetSeconds;
    setReminderSet(true);
    setReminderFired(false);
    toast.success(`🔔 Reminder set! We'll alert you when ~${mins} min remain.`, { duration: 4000 });
  }, [reminderMinutes, waitCountdown.remainingSeconds]);

  const handleCancelReminder = useCallback(() => {
    reminderTargetRef.current = null;
    setReminderSet(false);
    setReminderFired(false);
    setReminderMinutes('');
    toast('Reminder cancelled', { icon: '🔕', duration: 2000 });
  }, []);

  const playReminderSound = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(660, ctx.currentTime + 0.15);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.3);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.6);
    } catch {}
  };

  const stopWaitCountdown = useCallback(() => {
    if (waitTimerRef.current) {
      clearInterval(waitTimerRef.current);
      waitTimerRef.current = null;
    }
    setWaitCountdown({ minutes: 0, seconds: 0, totalSeconds: 0, remainingSeconds: 0, percent: 0, isUrgent: false });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (waitTimerRef.current) clearInterval(waitTimerRef.current);
    };
  }, []);

  // ── Recalculate position ──────────────────────────────────────────────────
  const calculatePosition = useCallback(async (currentQueue) => {
    try {
      if (currentQueue.status === 'ready' || currentQueue.status === 'completed') {
        setMyPosition(0);
        setPeopleAhead(0);
        setEstimatedWait(0);
        setCurrentServingToken(null);
        stopWaitCountdown();
        return;
      }

      if (!currentQueue.queue_position) {
        setMyPosition(0);
        setPeopleAhead(0);
        setEstimatedWait(0);
        setCurrentServingToken(null);
        stopWaitCountdown();
        return;
      }

      const { data: allActive, error } = await supabase
        .from('queue')
        .select('id, token_number, queue_position, status, wait_time_minutes, service_started_at')
        .eq('store_id', currentQueue.store_id)
        .in('status', ['waiting', 'in_service'])
        .not('queue_position', 'is', null)
        .order('queue_position', { ascending: true });

      if (error) throw error;

      const myPos = currentQueue.queue_position;
      const avgServiceTime = currentQueue.stores?.avg_service_time || 5;
      const ahead = Math.max(0, myPos - 1);

      setMyPosition(myPos);
      setPeopleAhead(ahead);

      // Calculate legacy estimatedWait (kept for display in stat card)
      let finalWait = 0;
      if (ahead > 0) {
        const actualPeopleAhead = allActive?.filter(c =>
          c.queue_position < myPos && c.id !== currentQueue.id
        ) || [];

        if (actualPeopleAhead.length > 0) {
          let totalWaitMinutes = 0;
          const now = new Date();

          actualPeopleAhead.forEach((customer) => {
            if (customer.status === 'in_service') {
              const prepTime = customer.wait_time_minutes || avgServiceTime;
              const startTime = new Date(customer.service_started_at);
              const elapsedMinutes = (now - startTime) / 60000;
              const remaining = Math.max(0, prepTime - elapsedMinutes);
              totalWaitMinutes += remaining;
            } else {
              totalWaitMinutes += customer.wait_time_minutes || avgServiceTime;
            }
          });

          finalWait = Math.max(1, Math.round(totalWaitMinutes));
        } else {
          finalWait = ahead * avgServiceTime;
        }
      }

      setEstimatedWait(finalWait);

      const serving = allActive?.find(c => c.status === 'in_service');
      setCurrentServingToken(serving?.token_number || null);

      // ── Start wait countdown for 'waiting' and 'in_service' status ──────
      if ((currentQueue.status === 'waiting' || currentQueue.status === 'in_service') && myPos > 0) {
        startWaitCountdown(myPos, avgServiceTime, currentQueue.issued_at);
      } else {
        stopWaitCountdown();
      }

    } catch (err) {
      console.error('💥 Position calculation error:', err);
      setMyPosition(0);
      setPeopleAhead(0);
      setEstimatedWait(0);
      stopWaitCountdown();
    }
  }, [startWaitCountdown, stopWaitCountdown]);

  // ── Load data ─────────────────────────────────────────────────────────────
  const loadQueueData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: queue, error: queueError } = await supabase
        .from('queue')
        .select(`
          *,
          stores (
            id, store_name, store_type, address, city, phone, logo_url, avg_service_time
          )
        `)
        .eq('id', queueId)
        .single();

      if (queueError) throw new Error(`Database error: ${queueError.message}`);
      if (!queue) throw new Error('Queue not found');
      if (!queue.stores) throw new Error('Store not found');

      setQueueData(queue);
      setStoreData(queue.stores);

      const { data: order } = await supabase
        .from('orders')
        .select('*')
        .eq('queue_id', queueId)
        .maybeSingle();

      if (order) setOrderData(order);

      await calculatePosition(queue);

    } catch (err) {
      console.error('💥 Loading error:', err);
      setError(err.message);
      toast.error(err.message);
      setTimeout(() => router.push('/buyer/orders'), 3000);
    } finally {
      setLoading(false);
    }
  }, [queueId, calculatePosition, router]);

  useEffect(() => {
    if (!queueId || queueId === 'queue' || queueId === '[id]') {
      setError('Invalid queue ID'); setLoading(false); return;
    }
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(queueId)) {
      setError('Invalid queue ID format'); setLoading(false); return;
    }
    loadQueueData();
  }, [queueId, loadQueueData]);

  // ── Realtime subscription ─────────────────────────────────────────────────
  useEffect(() => {
    if (!queueData?.store_id) return;

    const channel = supabase
      .channel(`buyer-queue-${queueData.store_id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'queue',
        filter: `store_id=eq.${queueData.store_id}`
      }, async (payload) => {
        const isMyEntry = payload.new?.id === queueId || payload.old?.id === queueId;

        if (isMyEntry && payload.eventType === 'UPDATE') {
          const newStatus = payload.new.status;
          const oldStatus = payload.old?.status;

          setQueueData(prev => ({ ...prev, ...payload.new }));

          if (newStatus === 'in_service' && oldStatus !== 'in_service') {
            toast.success('🎉 Your order is being prepared!', { duration: 5000 });
            playNotificationSound();
          } else if (newStatus === 'ready' && oldStatus !== 'ready') {
            toast.success('✅ Your order is ready for pickup!', { duration: 8000 });
            playNotificationSound();
          } else if (newStatus === 'completed') {
            toast.success('✅ Order completed!', { duration: 5000 });
            setTimeout(() => router.push('/buyer/orders'), 3000);
          }
        }

        const { data: updatedQueue } = await supabase
          .from('queue')
          .select('*, stores(*)')
          .eq('id', queueId)
          .single();

        if (updatedQueue) {
          setQueueData(updatedQueue);
          await calculatePosition(updatedQueue);
        }
      })
      .subscribe();

    return () => { channel.unsubscribe(); };
  }, [queueData?.store_id, queueId, calculatePosition, router]);



  // ── Helpers ───────────────────────────────────────────────────────────────
  const playNotificationSound = () => {
    try {
      const audio = new Audio('/notification.mp3');
      audio.play().catch(() => {});
    } catch {}
  };

  const handleDirections = () => {
    if (storeData?.latitude && storeData?.longitude) {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${storeData.latitude},${storeData.longitude}`, '_blank');
    } else if (storeData?.address) {
      window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(storeData.address + ', ' + storeData.city)}`, '_blank');
    } else {
      toast.error('Location not available');
    }
  };

  const getStatusColor = () => {
    if (!queueData) return '#6b7280';
    return { waiting: '#f59e0b', in_service: '#8b5cf6', ready: '#10b981', completed: '#059669' }[queueData.status] || '#6b7280';
  };

  const getStatusMessage = () => {
    if (!queueData) return '';
    switch (queueData.status) {
      case 'waiting':
        if (peopleAhead === 0) return "You're next! Please be ready.";
        if (peopleAhead === 1) return '1 person ahead of you';
        return `${peopleAhead} people ahead of you`;
      case 'in_service':
        return isQueueOnlyStore(storeData?.store_type)
          ? "It's your turn! Please proceed. 🎉"
          : 'Your order is being prepared now! 🎉';
      case 'ready': return 'Your order is ready for pickup! 🎊';
      case 'completed': return 'Order completed. Thank you! ✅';
      default: return 'Processing...';
    }
  };

  // Show position-based wait countdown for both 'waiting' and 'in_service'
  const showWaitCountdown =
    (queueData?.status === 'waiting' || queueData?.status === 'in_service') &&
    waitCountdown.totalSeconds > 0;

  const avgServiceTime = storeData?.avg_service_time || 5;

  // ── Render guards ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="queue-view-container">
        <div className="queue-view-loading">
          <RefreshCw className="queue-view-spinner" />
          <p>Loading your queue status...</p>
        </div>
      </div>
    );
  }

  if (error || !queueData || !storeData) {
    return (
      <div className="queue-view-container">
        <div className="queue-view-error">
          <AlertCircle style={{ width: '3rem', height: '3rem', color: '#ef4444', marginBottom: '1rem' }} />
          <h2>Unable to Load Queue</h2>
          <p>{error || 'Queue not found'}</p>
          <button onClick={() => router.push('/buyer/orders')} className="queue-view-btn-primary" style={{ marginTop: '1.5rem' }}>
            Back to Orders
          </button>
        </div>
      </div>
    );
  }

  if (queueData.status === 'completed') {
    return (
      <div className="queue-view-container">
        <div className="queue-view-error">
          <CheckCircle style={{ width: '4rem', height: '4rem', color: '#10b981', marginBottom: '1rem' }} />
          <h2>Order Completed!</h2>
          <p>Thank you for your order at {storeData.store_name}</p>
          <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.5rem' }}>
            Token: {queueData.token_number}
          </p>
          <button onClick={() => router.push('/buyer/orders')} className="queue-view-btn-primary" style={{ marginTop: '1.5rem' }}>
            View My Orders
          </button>
        </div>
      </div>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────
  return (
    <div className="queue-view-container">
      <div className="queue-view-header">
        <button onClick={() => router.push('/buyer/orders')} className="queue-view-back-btn">
          <ArrowLeft className="w-5 h-5" />Back
        </button>
        <button onClick={loadQueueData} className="queue-view-refresh-btn">
          <RefreshCw className="w-5 h-5" />Refresh
        </button>
      </div>

      <div className="queue-view-content">
        <div className="queue-view-title-section">
          <h1 className="queue-view-title">
            Your <span className="queue-view-title-gradient">Queue Status</span>
          </h1>
          <p className="queue-view-subtitle">Live tracking for {storeData.store_name}</p>
        </div>

        <div className="queue-live-status">
          <div className="queue-live-indicator">
            <div className="queue-live-dot"></div>
            <span className="queue-live-text">Live Updates</span>
          </div>
          <div className="queue-live-info">Refreshes automatically</div>
        </div>

        <div className="buyer-queue-grid">
          <div className="buyer-queue-left">

            {/* ── Position card ── */}
            <motion.div
              className="buyer-position-card"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              style={{ borderColor: getStatusColor() }}
            >
              <div className="position-icon">
                {queueData.status === 'in_service' ? '⚡' :
                 queueData.status === 'ready' ? '✅' :
                 myPosition === 1 ? '🥇' :
                 myPosition === 2 ? '🥈' :
                 myPosition === 3 ? '🥉' : '🎫'}
              </div>
              <div className="position-number-section">
                <p className="position-label">
                  {queueData.status === 'in_service' ? 'Currently' :
                   queueData.status === 'ready' ? 'Status' : 'You are'}
                </p>
                <div className="position-number" style={{ color: getStatusColor() }}>
                  {queueData.status === 'in_service' ? 'BEING SERVED' :
                   queueData.status === 'ready' ? 'READY' :
                   myPosition > 0 ? `#${myPosition}` : 'Ready Soon'}
                </div>
                <p className="position-sublabel">
                  {queueData.status === 'in_service'
                    ? (isQueueOnlyStore(storeData?.store_type) ? 'please proceed' : 'preparing your order')
                    : queueData.status === 'ready' ? 'for pickup'
                    : 'in the queue'}
                </p>
              </div>
              <div className="status-message" style={{ background: `${getStatusColor()}15`, color: getStatusColor() }}>
                <Users className="w-5 h-5" />
                <span>{getStatusMessage()}</span>
              </div>
            </motion.div>

            {/* ── NEW: Position-based wait countdown (waiting only) ── */}
            {showWaitCountdown && (
              <motion.div
                className={`wait-countdown-card${waitCountdown.isUrgent ? ' wait-countdown-urgent' : ''}`}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
              >
                {/* Header */}
                <div className="wait-countdown-header">
                  <Clock className="w-5 h-5" style={{ color: waitCountdown.isUrgent ? '#ef4444' : '#667eea' }} />
                  <h3 className="wait-countdown-title">Estimated Wait</h3>
                  {waitCountdown.isUrgent && (
                    <span className="wait-countdown-urgent-badge">Almost your turn!</span>
                  )}
                </div>

                {/* Ring + timer */}
                <div className="wait-countdown-body">
                  <div className="wait-countdown-ring-wrap">
                    <ProgressRing
                      percent={waitCountdown.percent}
                      size={148}
                      stroke={10}
                      color={waitCountdown.isUrgent ? '#ef4444' : '#667eea'}
                    />
                    <div className="wait-countdown-ring-inner">
                      <span className="wait-countdown-mm">
                        {String(waitCountdown.minutes).padStart(2, '0')}
                      </span>
                      <span className="wait-countdown-colon">:</span>
                      <span className="wait-countdown-ss">
                        {String(waitCountdown.seconds).padStart(2, '0')}
                      </span>
                    </div>
                  </div>

                  {/* Breakdown */}
                  <div className="wait-countdown-breakdown">
                    <div className="wait-breakdown-row">
                      <span className="wait-breakdown-label">Your position</span>
                      <span className="wait-breakdown-value">#{myPosition}</span>
                    </div>
                    <div className="wait-breakdown-row">
                      <span className="wait-breakdown-label">Avg. service time</span>
                      <span className="wait-breakdown-value">{avgServiceTime} min</span>
                    </div>
                    <div className="wait-breakdown-row">
                      <span className="wait-breakdown-label">People ahead</span>
                      <span className="wait-breakdown-value">{peopleAhead}</span>
                    </div>
                    <div className="wait-breakdown-divider" />
                    <div className="wait-breakdown-row wait-breakdown-total">
                      <span className="wait-breakdown-label">Total estimated</span>
                      <span className="wait-breakdown-value">
                        {Math.ceil(waitCountdown.remainingSeconds / 60)} min left
                      </span>
                    </div>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="wait-countdown-bar-wrap">
                  <div
                    className="wait-countdown-bar-fill"
                    style={{
                      width: `${waitCountdown.percent}%`,
                      background: waitCountdown.isUrgent
                        ? 'linear-gradient(90deg, #ef4444, #f97316)'
                        : 'linear-gradient(90deg, #667eea, #764ba2)',
                    }}
                  />
                </div>
                <p className="wait-countdown-hint">
                  ⏱ Based on {myPosition} {myPosition === 1 ? 'person' : 'people'} × {avgServiceTime} min avg service
                </p>

                {/* ── Reminder section ── */}
                <div className="reminder-section">
                  <div className="reminder-section-header">
                    <span className="reminder-section-icon">🔔</span>
                    <span className="reminder-section-title">Set a Reminder</span>
                    {reminderSet && (
                      <span className="reminder-active-badge">Active</span>
                    )}
                  </div>

                  {!reminderSet ? (
                    <div className="reminder-input-row">
                      <input
                        type="number"
                        className="reminder-input"
                        placeholder="e.g. 5"
                        min="1"
                        max={Math.floor(waitCountdown.remainingSeconds / 60)}
                        value={reminderMinutes}
                        onChange={(e) => setReminderMinutes(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSetReminder()}
                      />
                      <span className="reminder-input-unit">min before</span>
                      <button
                        className="reminder-set-btn"
                        onClick={handleSetReminder}
                        disabled={!reminderMinutes}
                      >
                        Set
                      </button>
                    </div>
                  ) : (
                    <div className="reminder-active-row">
                      <span className="reminder-active-text">
                        🔔 Alert when ~{reminderMinutes} min remain
                      </span>
                      <button
                        className="reminder-cancel-btn"
                        onClick={handleCancelReminder}
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                  <p className="reminder-hint">
                    Get a notification to head to the store on time
                  </p>
                </div>
              </motion.div>
            )}

            {/* ── People ahead stat ── */}
            <div className="buyer-stats-grid-queue">
              <div className="buyer-stat-card-queue">
                <Users className="stat-icon blue" />
                <div className="stat-content">
                  <p className="stat-label">People Ahead</p>
                  <p className="stat-value">{peopleAhead}</p>
                </div>
              </div>
            </div>
          </div>

          {/* ── RIGHT COLUMN ── */}
          <div className="buyer-queue-right">
            <motion.div className="token-display-card" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <div className="token-header">
                <Package className="w-6 h-6" style={{ color: getStatusColor() }} />
                <h2>Token Number</h2>
              </div>
              <div
                className="token-number-display"
                style={{
                  background: `linear-gradient(135deg, ${getStatusColor()}15, ${getStatusColor()}25)`,
                  borderColor: getStatusColor()
                }}
              >
                <span style={{ color: getStatusColor() }}>{queueData.token_number}</span>
              </div>
              {currentServingToken && queueData.status === 'waiting' && (
                <div className="current-serving">
                  <p>Now serving: <strong>{currentServingToken}</strong></p>
                </div>
              )}
            </motion.div>

            <motion.div className="order-details-card" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <h3 className="section-title">Order Details</h3>
              <div className="detail-row">
                <span className="detail-label">Order #</span>
                <span className="detail-value">{orderData?.order_number || 'N/A'}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Total</span>
                <span className="detail-value">₹{queueData.total_amount?.toFixed(2)}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Items</span>
                <span className="detail-value">{queueData.order_items?.length || 0}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Time</span>
                <span className="detail-value">
                  {new Date(queueData.issued_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              {queueData.order_items && queueData.order_items.length > 0 && (
                <div className="order-items-section">
                  <h4>Items</h4>
                  {queueData.order_items.map((item, idx) => (
                    <div key={idx} className="order-item">
                      <span>{item.name}</span>
                      <span>x{item.quantity}</span>
                      <span>₹{(item.price * item.quantity).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>

            <motion.div className="store-info-card" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <div className="store-header">
                <Store className="w-6 h-6" />
                <h3>Store</h3>
              </div>
              <div className="store-details">
                <div className="store-logo">
                  {storeData.logo_url
                    ? <img src={storeData.logo_url} alt={storeData.store_name} />
                    : '🏪'}
                </div>
                <div className="store-info">
                  <h4>{storeData.store_name}</h4>
                  <p>{storeData.address}</p>
                  <p>{storeData.city}</p>
                </div>
              </div>
            </motion.div>

            <div className="action-buttons">
              <button onClick={handleDirections} className="action-btn primary">
                <MapPin className="w-5 h-5" />Directions
              </button>
              {queueData.status === 'ready' && orderData?.id && (
                <button
                  onClick={() => router.push(`/buyer/order-confirmation/${orderData.id}`)}
                  className="action-btn success"
                >
                  <CheckCircle className="w-5 h-5" />View Order
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="help-section">
          <p>💡 You'll get notified when ready</p>
          <p>📱 Keep this page open for live updates</p>
        </div>
      </div>
    </div>
  );
}