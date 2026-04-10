'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, RefreshCw, Users, Store, MapPin,
  Timer, CheckCircle, AlertCircle, Clock, Scissors,
  Stethoscope, Phone, Calendar
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import toast from 'react-hot-toast';
import './queue-appointment.css';

// Detect store type icon
function StoreIcon({ storeType, className }) {
  if (storeType === 'clinic' || storeType === 'hospital') {
    return <Stethoscope className={className} />;
  }
  return <Scissors className={className} />;
}

export default function AppointmentQueueView() {
  const router = useRouter();
  const pathname = usePathname();
  const queueId = pathname?.split('/').pop();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [queueData, setQueueData] = useState(null);
  const [storeData, setStoreData] = useState(null);
  const [myPosition, setMyPosition] = useState(0);
  const [peopleAhead, setPeopleAhead] = useState(0);
  const [estimatedWait, setEstimatedWait] = useState(0);
  const [currentServingToken, setCurrentServingToken] = useState(null);
  const [countdown, setCountdown] = useState({ minutes: 0, seconds: 0, total: 0 });

  // ─── Position Calculation ──────────────────────────────────────────────────
  const calculatePosition = useCallback(async (currentQueue) => {
    try {
      if (currentQueue.status === 'ready' || currentQueue.status === 'completed') {
        setMyPosition(0);
        setPeopleAhead(0);
        setEstimatedWait(0);
        setCurrentServingToken(null);
        return;
      }

      if (!currentQueue.queue_position) {
        setMyPosition(0);
        setPeopleAhead(0);
        setEstimatedWait(0);
        setCurrentServingToken(null);
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
      const avgServiceTime = currentQueue.stores?.avg_service_time || 15;
      const ahead = Math.max(0, myPos - 1);

      setMyPosition(myPos);
      setPeopleAhead(ahead);

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

    } catch (err) {
      console.error('Position calculation error:', err);
      setMyPosition(0);
      setPeopleAhead(0);
      setEstimatedWait(0);
    }
  }, []);

  // ─── Load Data ────────────────────────────────────────────────────────────
  const loadQueueData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: queue, error: queueError } = await supabase
        .from('queue')
        .select(`
          *,
          stores (
            id,
            store_name,
            store_type,
            address,
            city,
            phone,
            logo_url,
            avg_service_time
          )
        `)
        .eq('id', queueId)
        .single();

      if (queueError) throw new Error(`Database error: ${queueError.message}`);
      if (!queue) throw new Error('Queue entry not found');
      if (!queue.stores) throw new Error('Store not found');

      setQueueData(queue);
      setStoreData(queue.stores);
      await calculatePosition(queue);

    } catch (err) {
      setError(err.message);
      toast.error(err.message);
      setTimeout(() => router.push('/buyer/orders'), 3000);
    } finally {
      setLoading(false);
    }
  }, [queueId, calculatePosition, router]);

  useEffect(() => {
    if (!queueId || queueId === 'queue' || queueId === '[id]') {
      setError('Invalid queue ID');
      setLoading(false);
      return;
    }
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(queueId)) {
      setError('Invalid queue ID format');
      setLoading(false);
      return;
    }
    loadQueueData();
  }, [queueId, loadQueueData]);

  // ─── Real-time Subscription ───────────────────────────────────────────────
  useEffect(() => {
    if (!queueData?.store_id) return;

    const channel = supabase
      .channel(`appt-queue-${queueData.store_id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'queue',
          filter: `store_id=eq.${queueData.store_id}`
        },
        async (payload) => {
          const isMyEntry = payload.new?.id === queueId || payload.old?.id === queueId;

          if (isMyEntry && payload.eventType === 'UPDATE') {
            const newStatus = payload.new.status;
            const oldStatus = payload.old?.status;

            setQueueData(prev => ({ ...prev, ...payload.new }));

            if (newStatus === 'in_service' && oldStatus !== 'in_service') {
              toast.success("🎉 It's your turn! Please proceed.", { duration: 6000 });
              playNotificationSound();
            } else if (newStatus === 'completed') {
              toast.success('✅ Visit completed. Thank you!', { duration: 5000 });
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
        }
      )
      .subscribe();

    return () => channel.unsubscribe();
  }, [queueData?.store_id, queueId, calculatePosition, router]);

  // ─── Countdown for in_service ─────────────────────────────────────────────
  useEffect(() => {
    if (queueData?.status === 'in_service' && queueData?.wait_time_minutes) {
      const interval = setInterval(() => {
        const now = new Date();
        const startTime = new Date(queueData.service_started_at);
        const endTime = new Date(startTime.getTime() + queueData.wait_time_minutes * 60000);
        const remaining = Math.max(0, endTime - now);

        setCountdown({
          minutes: Math.floor(remaining / 60000),
          seconds: Math.floor((remaining % 60000) / 1000),
          total: remaining
        });

        if (remaining === 0) clearInterval(interval);
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [queueData?.status, queueData?.service_started_at, queueData?.wait_time_minutes]);

  const playNotificationSound = () => {
    try {
      const audio = new Audio('/notification.mp3');
      audio.play().catch(() => {});
    } catch (e) {}
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

  // ─── Status Helpers ────────────────────────────────────────────────────────
  const getStatusColor = () => {
    if (!queueData) return '#6b7280';
    const colors = {
      waiting: '#f59e0b',
      in_service: '#8b5cf6',
      ready: '#10b981',
      completed: '#059669'
    };
    return colors[queueData.status] || '#6b7280';
  };

  const getStatusMessage = () => {
    if (!queueData) return '';
    switch (queueData.status) {
      case 'waiting':
        if (peopleAhead === 0) return "You're next! Please be ready.";
        if (peopleAhead === 1) return '1 person ahead of you';
        return `${peopleAhead} people ahead of you`;
      case 'in_service': return "It's your turn now! 🎉";
      case 'completed': return 'Visit completed. Thank you! ✅';
      default: return 'Processing...';
    }
  };

  const getStatusLabel = () => {
    switch (queueData?.status) {
      case 'waiting': return 'WAITING';
      case 'in_service': return 'IN SESSION';
      case 'completed': return 'DONE';
      default: return '—';
    }
  };

  const isClinic = storeData?.store_type === 'clinic' || storeData?.store_type === 'hospital';

  const formatWait = (mins) => {
    if (!mins || mins === 0) return '—';
    if (mins < 60) return `~${mins} min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `~${h}h ${m}m` : `~${h}h`;
  };

  // ─── Loading / Error States ────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="appt-container">
        <div className="appt-loading">
          <div className="appt-loading-ring" />
          <p>Loading your queue status...</p>
        </div>
      </div>
    );
  }

  if (error || !queueData || !storeData) {
    return (
      <div className="appt-container">
        <div className="appt-error-state">
          <AlertCircle />
          <h2>Unable to Load Queue</h2>
          <p>{error || 'Queue not found'}</p>
          <button onClick={() => router.push('/buyer/orders')} className="appt-btn-primary">
            Back to Orders
          </button>
        </div>
      </div>
    );
  }

  if (queueData.status === 'completed') {
    return (
      <div className="appt-container">
        <div className="appt-completed-state">
          <div className="appt-completed-icon">✅</div>
          <h2>Visit Completed!</h2>
          <p>Thank you for visiting <strong>{storeData.store_name}</strong></p>
          <p className="appt-token-sub">Token: {queueData.token_number}</p>
          <button onClick={() => router.push('/buyer/orders')} className="appt-btn-primary">
            View History
          </button>
        </div>
      </div>
    );
  }

  // ─── Main UI ───────────────────────────────────────────────────────────────
  return (
    <div className="appt-container">

      {/* Header */}
      <div className="appt-header">
        <button onClick={() => router.push('/buyer/orders')} className="appt-back-btn">
          <ArrowLeft size={18} /> Back
        </button>
        <button onClick={loadQueueData} className="appt-refresh-btn">
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      <div className="appt-content">

        {/* Title */}
        <div className="appt-title-block">
          <div className="appt-store-badge">
            <StoreIcon storeType={storeData.store_type} className="appt-store-badge-icon" />
            <span>{storeData.store_name}</span>
          </div>
          <h1 className="appt-title">
            {isClinic ? 'Your Appointment' : 'Your Queue Slot'}
          </h1>
          <div className="appt-live-pill">
            <span className="appt-live-dot" />
            Live Updates
          </div>
        </div>

        {/* Main Grid */}
        <div className="appt-grid">

          {/* LEFT — Position card */}
          <div className="appt-left">

            <motion.div
              className="appt-position-card"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              style={{ '--status-color': getStatusColor() }}
            >
              {/* Token big display */}
              <div className="appt-token-hero">
                <span className="appt-token-label">Your Token</span>
                <span className="appt-token-value" style={{ color: getStatusColor() }}>
                  {queueData.token_number}
                </span>
                <span className="appt-status-badge" style={{ background: `${getStatusColor()}20`, color: getStatusColor() }}>
                  {getStatusLabel()}
                </span>
              </div>

              {/* Position number */}
              {queueData.status === 'waiting' && (
                <div className="appt-pos-block">
                  <div className="appt-pos-number" style={{ color: getStatusColor() }}>
                    {myPosition > 0 ? `#${myPosition}` : '—'}
                  </div>
                  <div className="appt-pos-label">position in queue</div>
                </div>
              )}

              {queueData.status === 'in_service' && (
                <div className="appt-serving-block">
                  <div className="appt-serving-pulse" style={{ background: getStatusColor() }} />
                  <span style={{ color: getStatusColor() }}>Currently being served</span>
                </div>
              )}

              {/* Status message */}
              <div className="appt-status-msg" style={{ borderColor: `${getStatusColor()}40` }}>
                <Users size={16} style={{ color: getStatusColor() }} />
                <span>{getStatusMessage()}</span>
              </div>
            </motion.div>

            {/* Stats row */}
            <div className="appt-stats-row">
              <div className="appt-stat">
                <Users size={18} className="appt-stat-icon blue" />
                <div>
                  <p className="appt-stat-label">Ahead of you</p>
                  <p className="appt-stat-value">{peopleAhead}</p>
                </div>
              </div>
              <div className="appt-stat">
                <Clock size={18} className="appt-stat-icon amber" />
                <div>
                  <p className="appt-stat-label">Est. wait</p>
                  <p className="appt-stat-value">{formatWait(estimatedWait)}</p>
                </div>
              </div>
            </div>

            {/* Countdown (in_service) */}
            <AnimatePresence>
              {queueData.status === 'in_service' && countdown.total > 0 && (
                <motion.div
                  className="appt-countdown"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <Timer size={18} />
                  <span className="appt-countdown-label">Session ends in</span>
                  <span className="appt-countdown-time">
                    {countdown.minutes}:{countdown.seconds.toString().padStart(2, '0')}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Currently serving */}
            {currentServingToken && queueData.status === 'waiting' && (
              <div className="appt-now-serving">
                <span className="appt-now-serving-label">Now serving</span>
                <span className="appt-now-serving-token">{currentServingToken}</span>
              </div>
            )}

          </div>

          {/* RIGHT — Details */}
          <div className="appt-right">

            {/* Appointment details */}
            <motion.div
              className="appt-details-card"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <h3 className="appt-card-title">
                <Calendar size={16} />
                {isClinic ? 'Appointment Details' : 'Booking Details'}
              </h3>

              <div className="appt-detail-row">
                <span className="appt-detail-label">Token</span>
                <span className="appt-detail-value">{queueData.token_number}</span>
              </div>

              {queueData.service_type && (
                <div className="appt-detail-row">
                  <span className="appt-detail-label">{isClinic ? 'Visit type' : 'Service'}</span>
                  <span className="appt-detail-value">{queueData.service_type}</span>
                </div>
              )}

              {queueData.customer_name && (
                <div className="appt-detail-row">
                  <span className="appt-detail-label">Name</span>
                  <span className="appt-detail-value">{queueData.customer_name}</span>
                </div>
              )}

              <div className="appt-detail-row">
                <span className="appt-detail-label">Joined at</span>
                <span className="appt-detail-value">
                  {new Date(queueData.issued_at).toLocaleTimeString('en-IN', {
                    hour: '2-digit', minute: '2-digit'
                  })}
                </span>
              </div>

              {queueData.wait_time_minutes > 0 && (
                <div className="appt-detail-row">
                  <span className="appt-detail-label">Slot duration</span>
                  <span className="appt-detail-value">{queueData.wait_time_minutes} min</span>
                </div>
              )}

              {queueData.patient_notes && (
                <div className="appt-notes-row">
                  <span className="appt-detail-label">Notes</span>
                  <p className="appt-notes-text">{queueData.patient_notes}</p>
                </div>
              )}
            </motion.div>

            {/* Store info */}
            <motion.div
              className="appt-store-card"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <h3 className="appt-card-title">
                <Store size={16} />
                {isClinic ? 'Clinic Info' : 'Salon Info'}
              </h3>
              <div className="appt-store-row">
                <div className="appt-store-logo">
                  {storeData.logo_url
                    ? <img src={storeData.logo_url} alt={storeData.store_name} />
                    : <StoreIcon storeType={storeData.store_type} className="appt-store-logo-icon" />
                  }
                </div>
                <div>
                  <p className="appt-store-name">{storeData.store_name}</p>
                  <p className="appt-store-address">{storeData.address}</p>
                  <p className="appt-store-city">{storeData.city}</p>
                  {storeData.phone && (
                    <a href={`tel:${storeData.phone}`} className="appt-store-phone">
                      <Phone size={13} /> {storeData.phone}
                    </a>
                  )}
                </div>
              </div>
            </motion.div>

            {/* Actions */}
            <div className="appt-actions">
              <button onClick={handleDirections} className="appt-btn-primary">
                <MapPin size={16} /> Directions
              </button>
              {storeData.phone && (
                <a href={`tel:${storeData.phone}`} className="appt-btn-secondary">
                  <Phone size={16} /> Call
                </a>
              )}
            </div>

          </div>
        </div>

        {/* Footer hint */}
        <div className="appt-footer-hint">
          <span>💡 Keep this page open for live updates</span>
          <span>🔔 You'll be notified when it's your turn</span>
        </div>

      </div>
    </div>
  );
}