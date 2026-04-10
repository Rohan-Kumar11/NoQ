// app/buyer/order-confirmation/[id]/page.jsx - WITH AUTO RELOAD
'use client';

import { useState, useEffect, useRef, use } from 'react';
import { CheckCircle, Clock, MapPin, Package, Download, ArrowRight, Loader2, Lock, Timer, AlertCircle, XCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { getOrderById } from '@/lib/api/orders';
import { supabase } from '@/lib/supabase/client';
import StoreRating from '@/app/components/StoreRating';
import toast from 'react-hot-toast';
import './OrderConfirmation.css';
import ProductImage from '@/app/components/ProductImage';
import { formatProductDisplayInfo, formatPrice } from '@/lib/utils/productHelpers';
import {
  getCombinedStatusMessage,
  getPaymentStatusMessage,
  getPaymentStatusColor,
  getPaymentStatusClass,
  shouldShowOTP,
  isPendingSellerAction,
  getRefundMessage,
  getOrderStatusColor
} from '@/lib/utils/statusHelpers';

// How often to poll as a fallback (ms)
const POLL_INTERVAL = 15000;

export default function OrderConfirmation({ params }) {
  const router = useRouter();
  const { id: orderId } = use(params);

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [hasRated, setHasRated] = useState(false);

  // Timer state
  const [countdown, setCountdown] = useState({ minutes: 0, seconds: 0, total: 0 });

  // Refs so intervals/channels can always see latest order
  const orderRef = useRef(null);
  const pollTimerRef = useRef(null);
  const channelRef = useRef(null);

  // ── Get current user ──────────────────────────────────────────────────────
  useEffect(() => {
    const getCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setCurrentUser(user);
    };
    getCurrentUser();
  }, []);

  // ── Load order (silent = no full-page spinner) ────────────────────────────
  const loadOrderDetails = async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await getOrderById(orderId);
      if (fetchError) throw new Error(fetchError);

      console.log('📦 Order loaded:', {
        orderId: data.id,
        orderStatus: data.order_status,
        queueStatus: data.queue?.status,
        waitTime: data.queue?.wait_time_minutes,
        serviceStarted: data.queue?.service_started_at,
      });

      setOrder(data);
      orderRef.current = data;
    } catch (err) {
      console.error('Error loading order:', err);
      if (!silent) setError(err.message);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (orderId) loadOrderDetails(false);
  }, [orderId]);

  // ── Realtime subscriptions (re-created whenever order is first loaded) ────
  useEffect(() => {
    if (!orderId) return;

    // Remove any previous channel
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const channel = supabase
      .channel(`order-confirmation-${orderId}-${Date.now()}`)
      // ── Orders table ────────────────────────────────────────────────────
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `id=eq.${orderId}`,
        },
        (payload) => {
          console.log('🔄 Order realtime update:', payload.new);
          handleOrderUpdate(payload.new);
        }
      )
      // ── Queue table (filter added only after we know queue_id) ──────────
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'queue',
        },
        (payload) => {
          // Only act on updates relevant to our order's queue entry
          const currentQueueId = orderRef.current?.queue_id;
          if (currentQueueId && payload.new.id === currentQueueId) {
            console.log('🔄 Queue realtime update:', payload.new);
            handleQueueUpdate(payload.new);
          }
        }
      )
      // ── Active queue table ───────────────────────────────────────────────
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'active_queue',
        },
        (payload) => {
          const currentQueueId = orderRef.current?.queue_id;
          if (currentQueueId && payload.new.id === currentQueueId) {
            console.log('🔄 Active queue realtime update:', payload.new);
            loadOrderDetails(true); // silent refresh
          }
        }
      )
      .subscribe((status) => {
        console.log('📡 Realtime subscription status:', status);
      });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [orderId]);

  // ── Polling fallback every 15 s (stops when order is terminal) ───────────
  useEffect(() => {
    if (!orderId) return;

    const isTerminal = (status) =>
      status === 'completed' || status === 'cancelled';

    const startPolling = () => {
      pollTimerRef.current = setInterval(async () => {
        const currentStatus = orderRef.current?.order_status;
        if (isTerminal(currentStatus)) {
          clearInterval(pollTimerRef.current);
          return;
        }
        console.log('⏱ Poll: refreshing order silently');
        await loadOrderDetails(true);
      }, POLL_INTERVAL);
    };

    startPolling();

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [orderId]);

  // ── Countdown timer ───────────────────────────────────────────────────────
  useEffect(() => {
    if (order?.queue?.status === 'in_service' && order?.queue?.wait_time_minutes) {
      const interval = setInterval(() => {
        const now = new Date();
        const startTime = new Date(order.queue.service_started_at);
        const endTime = new Date(startTime.getTime() + order.queue.wait_time_minutes * 60000);
        const remaining = Math.max(0, endTime - now);

        setCountdown({
          minutes: Math.floor(remaining / 60000),
          seconds: Math.floor((remaining % 60000) / 1000),
          total: remaining,
        });

        if (remaining === 0) clearInterval(interval);
      }, 1000);

      return () => clearInterval(interval);
    } else {
      setCountdown({ minutes: 0, seconds: 0, total: 0 });
    }
  }, [order?.queue?.status, order?.queue?.service_started_at, order?.queue?.wait_time_minutes]);

  // ── Event handlers ────────────────────────────────────────────────────────
  const handleOrderUpdate = (updatedOrder) => {
    const newStatus = updatedOrder.order_status;
    const newPaymentStatus = updatedOrder.payment_status;

    if (newStatus === 'preparing') {
      toast.success('🎉 Order Accepted! Being prepared...', { duration: 5000 });
    } else if (newStatus === 'ready') {
      toast.success('✅ Your order is ready for pickup!', { duration: 10000, icon: '🎉' });
      playNotificationSound();
    } else if (newStatus === 'completed') {
      toast.success('Thank you! Order completed.', { duration: 5000 });
    } else if (newStatus === 'cancelled') {
      if (newPaymentStatus === 'refund_pending') {
        toast.error('Order was cancelled. Your payment will be refunded soon.', { duration: 8000 });
      } else {
        toast.error('Order was cancelled.', { duration: 5000 });
      }
    }

    loadOrderDetails(true); // silent refresh
  };

  const handleQueueUpdate = (updatedQueue) => {
    console.log('Queue update received:', updatedQueue);
    if (updatedQueue.wait_time_minutes != null) {
      toast.success(`Updated wait time: ${updatedQueue.wait_time_minutes} min`, {
        duration: 3000,
        icon: '⏱️',
      });
    }
    loadOrderDetails(true);
  };

  const playNotificationSound = () => {
    try {
      const audio = new Audio('/notification.mp3');
      audio.play().catch((err) => console.log('Audio play failed:', err));
    } catch (e) {
      console.log('Notification sound unavailable');
    }
  };

  const copyOTP = () => {
    if (order?.completion_otp) {
      navigator.clipboard.writeText(order.completion_otp);
      toast.success('Code copied to clipboard!');
    }
  };

  const handleRatingChange = (newRating) => {
    console.log('Rating changed to:', newRating);
    setHasRated(true);
    loadOrderDetails(true);
  };

  // ── Derived state ─────────────────────────────────────────────────────────
  const showRatingSection =
    order?.order_status === 'ready' &&
    order?.payment_status === 'paid' &&
    currentUser;

  const showCountdownTimer =
    order?.queue?.status === 'in_service' && countdown.total > 0;

  // ── Render guards ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="order-confirmation-container">
        <div className="order-confirmation-loading">
          <Loader2 className="order-confirmation-loading-spinner" />
          <p>Loading order details...</p>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="order-confirmation-container">
        <div className="order-confirmation-error">
          <h2>Order Not Found</h2>
          <p>{error || 'Unable to load order details'}</p>
          <button
            onClick={() => router.push('/buyer')}
            className="order-confirmation-btn-primary"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  const statusInfo = getCombinedStatusMessage(order.order_status, order.payment_status);
  const showPendingState = isPendingSellerAction(order.order_status);
  const displayOTP = shouldShowOTP(order.order_status, order.payment_status);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="order-confirmation-container">
      {/* Top Navigation Bar */}
      <div className="order-confirmation-header">
        <button
          onClick={() => router.push('/buyer')}
          className="order-confirmation-btn-back"
        >
          <ArrowRight className="w-5 h-5" style={{ transform: 'rotate(180deg)' }} />
          Back to Home
        </button>

        {order?.queue_id && ['confirmed', 'preparing', 'ready'].includes(order?.order_status) && (
          <button
            onClick={() => router.push(`/buyer/queue/${order.queue_id}`)}
            className="order-confirmation-btn-queue"
          >
            View Queue
            <ArrowRight className="w-5 h-5" />
          </button>
        )}
      </div>

      <div className="order-confirmation-content">
        {/* Success Header */}
        <div className="order-confirmation-success-header">
          <div className="order-confirmation-success-icon">
            {order.order_status === 'cancelled' ? (
              <XCircle className="w-16 h-16" style={{ color: '#ef4444' }} />
            ) : (
              <CheckCircle className="w-16 h-16" />
            )}
          </div>
          <h1 className="order-confirmation-title">
            {order.order_status === 'cancelled' ? 'Order Cancelled' : 'Payment Confirmed!'}
          </h1>
          <p className="order-confirmation-subtitle">
            {order.order_status === 'cancelled'
              ? getRefundMessage(order.payment_status)
              : "Your payment was successful and you're now in the queue"}
          </p>
        </div>

        {/* Live Status Indicator */}
        {order.order_status !== 'completed' && order.order_status !== 'cancelled' && (
          <div className="liveStatusBar">
            <div className="liveIndicator">
              <div className="liveDot"></div>
              <span className="liveText">Live Tracking</span>
            </div>
            <div className="liveInfo">Updates automatically</div>
          </div>
        )}

        {/* Pending State */}
        {showPendingState && (
          <div className="pending-seller-state">
            <div className="pending-seller-icon">
              <Loader2 className="w-12 h-12 pending-spinner" />
            </div>
            <h2 className="pending-seller-title">Waiting for Shop Confirmation</h2>
            <p className="pending-seller-message">
              Your payment is successful! The shop will confirm your order shortly.
            </p>
            <div className="pending-seller-info">
              <div className="pending-info-item">
                <CheckCircle className="w-5 h-5" style={{ color: '#10b981' }} />
                <span>Payment Confirmed</span>
              </div>
              <div className="pending-info-item">
                <Clock className="w-5 h-5" style={{ color: '#f59e0b' }} />
                <span>Awaiting Shop Response</span>
              </div>
            </div>
          </div>
        )}

        {/* Payment Status */}
        <div className="payment-status-card">
          <div className="payment-status-header">
            <h3>Payment Status</h3>
          </div>
          <div
            className={`payment-status-badge ${getPaymentStatusClass(order.payment_status)}`}
            style={{
              backgroundColor: `${getPaymentStatusColor(order.payment_status)}15`,
              borderColor: getPaymentStatusColor(order.payment_status),
              color: getPaymentStatusColor(order.payment_status),
            }}
          >
            <span className="payment-status-icon">
              {order.payment_status === 'paid' && '✓'}
              {order.payment_status === 'pending' && '⏳'}
              {order.payment_status === 'failed' && '✕'}
              {order.payment_status === 'refund_pending' && '↺'}
              {order.payment_status === 'refunded' && '✓'}
            </span>
            <span className="payment-status-text">
              {getPaymentStatusMessage(order.payment_status)}
            </span>
          </div>
          {order.payment_status === 'refund_pending' && (
            <p className="payment-status-note">
              💡 This is a demo payment for the hackathon. In production, your payment would be
              refunded within 5-7 business days.
            </p>
          )}
        </div>

        {/* Countdown Timer */}
        {showCountdownTimer && (
          <div className="countdown-card">
            <div className="countdown-header">
              <Timer className="w-6 h-6" />
              <h3>Ready In</h3>
            </div>
            <div className="countdown-display">
              <div className="countdown-time">
                <div className="countdown-unit">
                  <span className="countdown-value">{countdown.minutes}</span>
                  <span className="countdown-label">min</span>
                </div>
                <span className="countdown-separator">:</span>
                <div className="countdown-unit">
                  <span className="countdown-value">
                    {countdown.seconds.toString().padStart(2, '0')}
                  </span>
                  <span className="countdown-label">sec</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Store Rating */}
        {showRatingSection && (
          <div className="order-confirmation-rating-card">
            <div className="order-confirmation-rating-header">
              <div className="order-confirmation-rating-icon">🎉</div>
              <div className="order-confirmation-rating-title-section">
                <h2>Your Order is Ready!</h2>
                <p>How was your experience? Rate the store</p>
              </div>
            </div>

            <div className="order-confirmation-rating-content">
              <div className="order-confirmation-store-info-rating">
                <h3>{order.stores?.store_name}</h3>
                <p>{order.stores?.address}, {order.stores?.city}</p>
              </div>

              <div className="order-confirmation-rating-widget">
                <StoreRating
                  storeId={order.store_id}
                  storeName={order.stores?.store_name}
                  currentUserId={currentUser?.id}
                  averageRating={parseFloat(order.stores?.average_rating) || 0}
                  totalRatings={order.stores?.total_ratings || 0}
                  size="large"
                  interactive={true}
                  showCount={true}
                  onRatingChange={handleRatingChange}
                />
              </div>

              {hasRated && (
                <div className="order-confirmation-rating-thank-you">
                  <CheckCircle className="w-5 h-5" style={{ color: '#10b981' }} />
                  <span>Thank you for rating! Your feedback helps others.</span>
                </div>
              )}

              <div className="order-confirmation-rating-reminder">
                <Lock className="w-5 h-5" />
                <p>
                  <strong>Don't forget:</strong> Share your completion code{' '}
                  <strong>{order.completion_otp}</strong> with the shopkeeper when collecting your
                  order.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* OTP Card */}
        {displayOTP && order.completion_otp && !showRatingSection && (
          <div className="order-confirmation-otp-card">
            <div className="order-confirmation-otp-header">
              <Lock className="w-6 h-6" />
              <h2>Your Completion Code</h2>
            </div>
            <div className="order-confirmation-otp-display">
              <div className="order-confirmation-otp-code">{order.completion_otp}</div>
              <button onClick={copyOTP} className="order-confirmation-otp-copy-btn">
                📋 Copy Code
              </button>
            </div>
            <div className="order-confirmation-otp-instructions">
              <p>
                <strong>⚠️ IMPORTANT:</strong> Share this code with the shopkeeper when collecting
                your order.
              </p>
              <p>
                This ensures your order is correctly marked as completed and stock is properly
                managed.
              </p>
            </div>
          </div>
        )}

        {/* Status Badge */}
        <div className="order-confirmation-status-card">
          <div
            className="order-confirmation-status-badge-new"
            style={{
              backgroundColor: statusInfo.color,
              boxShadow: `0 4px 15px ${statusInfo.color}40`,
            }}
          >
            <div className="status-badge-icon">
              {order.order_status === 'confirmed' && <Clock className="w-6 h-6" />}
              {order.order_status === 'preparing' && '👨‍🍳'}
              {order.order_status === 'ready' && '🎉'}
              {order.order_status === 'completed' && <CheckCircle className="w-6 h-6" />}
              {order.order_status === 'cancelled' && <XCircle className="w-6 h-6" />}
            </div>
            <div className="status-badge-content">
              <h3>{statusInfo.title}</h3>
              <p>{statusInfo.message}</p>
            </div>
          </div>
        </div>

        {/* Queue Token */}
        {order.queue && order.order_status !== 'cancelled' && (
          <div className="order-confirmation-token-card">
            <div className="order-confirmation-token-header">
              <h2>Your Queue Token</h2>
              <span
                className="order-confirmation-token-status"
                style={{
                  backgroundColor:
                    order.queue?.status === 'completed'
                      ? '#059669'
                      : order.queue?.status === 'ready'
                      ? '#10b981'
                      : order.queue?.status === 'in_service'
                      ? '#8b5cf6'
                      : '#3b82f6',
                }}
              >
                {order.queue?.status?.toUpperCase() || 'ACTIVE'}
              </span>
            </div>

            <div className="order-confirmation-token-display">
              <div className="order-confirmation-token-number-box">
                <span className="order-confirmation-token-number">
                  {order.queue?.token_number || 'N/A'}
                </span>
              </div>
              <div className="order-confirmation-token-info">
                <h3>{order.stores?.store_name}</h3>
                <div className="order-confirmation-token-meta">
                  <span className="order-confirmation-meta-item">
                    <Clock className="w-4 h-4" />
                    Est. wait: {order.queue?.wait_time_minutes || 0} min
                  </span>
                  <span className="order-confirmation-meta-item">
                    <MapPin className="w-4 h-4" />
                    {order.stores?.city}
                  </span>
                </div>
              </div>
            </div>

            <div className="order-confirmation-token-notice">
              {order.order_status === 'ready' ? (
                <p className="order-confirmation-ready-notice">
                  🎉 Your order is ready! Please proceed to the counter and share your completion
                  code: <strong>{order.completion_otp}</strong>
                </p>
              ) : (
                <p>
                  Please arrive at the store before your estimated time. You'll receive
                  notifications when it's your turn.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Order Details */}
        <div className="order-confirmation-details-card">
          <h2 className="order-confirmation-section-title">Order Details</h2>

          <div className="order-confirmation-detail-row">
            <span className="order-confirmation-detail-label">Order Number</span>
            <span className="order-confirmation-detail-value">{order.order_number}</span>
          </div>

          <div className="order-confirmation-detail-row">
            <span className="order-confirmation-detail-label">Order Date</span>
            <span className="order-confirmation-detail-value">
              {new Date(order.ordered_at).toLocaleString()}
            </span>
          </div>

          <div className="order-confirmation-detail-row">
            <span className="order-confirmation-detail-label">Payment Method</span>
            <span className="order-confirmation-detail-value">
              {order.payment_method?.toUpperCase()}
            </span>
          </div>

          {/* Items */}
          <div className="order-confirmation-items-section">
            <h3 className="order-confirmation-items-title">
              <Package className="w-5 h-5" />
              Items ({order.items?.length || 0})
            </h3>
            <div className="order-confirmation-items-list">
              {order.items?.map((item, idx) => {
                const displayInfo = formatProductDisplayInfo(item);
                return (
                  <div key={idx} className="order-confirmation-item">
                    <div className="order-confirmation-item-image-wrapper">
                      <ProductImage
                        src={displayInfo.imageUrl}
                        fallback={displayInfo.emoji}
                        alt={displayInfo.name}
                        category={displayInfo.category}
                        size="small"
                      />
                    </div>
                    <div className="order-confirmation-item-info">
                      <span className="order-confirmation-item-name">
                        {displayInfo.displayName}
                      </span>
                      <span className="order-confirmation-item-qty">× {item.quantity}</span>
                    </div>
                    <span className="order-confirmation-item-price">
                      {formatPrice(item.price * item.quantity)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Price Breakdown */}
          <div className="order-confirmation-price-breakdown">
            <div className="order-confirmation-price-row">
              <span>Subtotal</span>
              <span>₹{order.subtotal?.toFixed(2)}</span>
            </div>
            {order.discount > 0 && (
              <div className="order-confirmation-price-row discount">
                <span>Discount</span>
                <span>-₹{order.discount?.toFixed(2)}</span>
              </div>
            )}
            <div className="order-confirmation-price-row">
              <span>Tax</span>
              <span>₹{order.tax?.toFixed(2)}</span>
            </div>
            <div className="order-confirmation-price-divider"></div>
            <div className="order-confirmation-price-total">
              <span>Total {order.payment_status === 'paid' ? 'Paid' : ''}</span>
              <span>₹{order.total_amount?.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Store Info */}
        <div className="order-confirmation-store-card">
          <h2 className="order-confirmation-section-title">Store Information</h2>
          <div className="order-confirmation-store-details">
            <h3>{order.stores?.store_name}</h3>
            <p className="order-confirmation-store-address">
              <MapPin className="w-4 h-4" />
              {order.stores?.address}, {order.stores?.city}
            </p>
            {order.stores?.phone && (
              <p className="order-confirmation-store-phone">📞 {order.stores.phone}</p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="order-confirmation-actions">
          <button
            onClick={() => router.push('/buyer/orders')}
            className="order-confirmation-btn-secondary"
          >
            View All Orders
          </button>

          <button
            onClick={() => window.print()}
            className="order-confirmation-btn-outline"
          >
            <Download className="w-5 h-5" />
            Download Receipt
          </button>
        </div>
      </div>
    </div>
  );
}