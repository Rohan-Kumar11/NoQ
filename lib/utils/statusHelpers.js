// lib/utils/statusHelpers.js - Centralized status mapping

/**
 * Get user-friendly payment status message
 */
export function getPaymentStatusMessage(paymentStatus) {
  const messages = {
    'pending': 'Payment Pending',
    'paid': 'Payment Successful',
    'failed': 'Payment Failed',
    'refund_pending': 'Refund Processing',
    'refunded': 'Refunded'
  };
  
  return messages[paymentStatus] || paymentStatus;
}

/**
 * Get payment status badge color
 */
export function getPaymentStatusColor(paymentStatus) {
  const colors = {
    'pending': '#f59e0b',      // Orange
    'paid': '#10b981',         // Green
    'failed': '#ef4444',       // Red
    'refund_pending': '#f59e0b', // Orange
    'refunded': '#10b981'      // Green
  };
  
  return colors[paymentStatus] || '#6b7280';
}

/**
 * Get payment status CSS class
 */
export function getPaymentStatusClass(paymentStatus) {
  const classes = {
    'pending': 'payment-pending',
    'paid': 'payment-success',
    'failed': 'payment-failed',
    'refund_pending': 'payment-refund-pending',
    'refunded': 'payment-refunded'
  };
  
  return classes[paymentStatus] || 'payment-unknown';
}

/**
 * Get user-friendly order status message
 */
export function getOrderStatusMessage(orderStatus) {
  const messages = {
    'pending': 'Awaiting Confirmation',  // ✅ UPDATED
    'confirmed': 'Confirmed',
    'preparing': 'Being Prepared',
    'ready': 'Ready for Pickup',
    'completed': 'Completed',
    'cancelled': 'Cancelled'
  };
  
  return messages[orderStatus] || orderStatus;
}

/**
 * Get order status emoji
 */
export function getOrderStatusEmoji(orderStatus) {
  const emojis = {
    'pending': '⏳',
    'confirmed': '✅',  // ✅ UPDATED
    'preparing': '👨‍🍳',
    'ready': '🎉',
    'completed': '✅',
    'cancelled': '❌'
  };
  
  return emojis[orderStatus] || '📦';
}

/**
 * Get order status color
 */
export function getOrderStatusColor(orderStatus) {
  const colors = {
    'pending': '#f59e0b',    // Orange - waiting for seller
    'confirmed': '#3b82f6',  // Blue - seller confirmed
    'preparing': '#8b5cf6',  // Purple - being made
    'ready': '#10b981',      // Green - ready
    'completed': '#059669',  // Dark green
    'cancelled': '#ef4444'   // Red
  };
  
  return colors[orderStatus] || '#6b7280';
}

/**
 * Get combined order and payment status message
 * This is what should be shown to users
 */
export function getCombinedStatusMessage(orderStatus, paymentStatus) {
  // Cancelled order with refund
  if (orderStatus === 'cancelled') {
    if (paymentStatus === 'refund_pending') {
      return {
        title: 'Order Cancelled',
        message: 'Your order has been cancelled. Your payment will be refunded soon.',
        type: 'warning',
        color: '#f59e0b'
      };
    }
    if (paymentStatus === 'refunded') {
      return {
        title: 'Order Cancelled',
        message: 'Your order was cancelled and payment has been refunded.',
        type: 'info',
        color: '#6b7280'
      };
    }
    if (paymentStatus === 'failed') {
      return {
        title: 'Order Cancelled',
        message: 'Your order was cancelled. No payment was processed.',
        type: 'info',
        color: '#6b7280'
      };
    }
  }
  
  // ✅ NEW: Pending order - payment successful but waiting for seller acceptance
  if (orderStatus === 'pending' && paymentStatus === 'paid') {
    return {
      title: '⏳ Payment Successful - Awaiting Shop Confirmation',
      message: 'Your payment is confirmed! The shop will review and accept your order shortly.',
      type: 'pending',
      color: '#f59e0b'
    };
  }
  
  // Pending payment
  if (orderStatus === 'pending') {
    return {
      title: 'Payment Processing',
      message: 'Please complete your payment to confirm the order.',
      type: 'pending',
      color: '#f59e0b'
    };
  }
  
  // ✅ UPDATED: Confirmed - order accepted by seller
  if (orderStatus === 'confirmed') {
    return {
      title: '✅ Order Confirmed',
      message: 'The shop has accepted your order and will start preparing it soon!',
      type: 'success',
      color: '#3b82f6'
    };
  }
  
  // Preparing
  if (orderStatus === 'preparing') {
    return {
      title: '👨‍🍳 Order Being Prepared',
      message: 'The shop is preparing your order. You\'ll be notified when it\'s ready!',
      type: 'success',
      color: '#8b5cf6'
    };
  }
  
  // Ready for pickup
  if (orderStatus === 'ready') {
    return {
      title: '🎉 Order Ready!',
      message: 'Your order is ready for pickup. Please come to the counter!',
      type: 'success',
      color: '#10b981'
    };
  }
  
  // Completed
  if (orderStatus === 'completed') {
    return {
      title: '✅ Order Completed',
      message: 'Thank you for your order! Hope to see you again!',
      type: 'success',
      color: '#059669'
    };
  }
  
  return {
    title: getOrderStatusMessage(orderStatus),
    message: '',
    type: 'info',
    color: '#6b7280'
  };
}

/**
 * Check if order should show countdown timer
 * ✅ UPDATED: Only show for preparing, not pending or confirmed
 */
export function shouldShowCountdown(orderStatus) {
  return orderStatus === 'preparing';
}

/**
 * Check if order should show OTP/completion code
 * ✅ UPDATED: Don't show OTP for pending orders
 */
export function shouldShowOTP(orderStatus, paymentStatus) {
  // Show OTP only if order is active and payment is successful
  return (
    paymentStatus === 'paid' && 
    !['pending', 'completed', 'cancelled'].includes(orderStatus)
  );
}

/**
 * Check if order is in pending state (waiting for seller)
 * ✅ UPDATED: Pending means waiting for seller acceptance
 */
export function isPendingSellerAction(orderStatus) {
  return orderStatus === 'pending';
}

/**
 * Get notification icon based on type
 */
export function getNotificationIcon(type) {
  if (!type) return '🔔';
  
  const typeStr = type.toLowerCase();
  
  // Map notification types to icons
  const iconMap = {
    'order_pending': '⏳',        // ✅ NEW
    'order_accepted': '✅',
    'order_confirmed': '✅',      // ✅ NEW
    'order_ready': '🎉',
    'order_completed': '✅',
    'order_cancelled': '❌',
    'token_generated': '🎫',
    'time_update': '⏱️',
    'order': '📦',
    'payment': '💳',
    'queue': '⏰',
    'promotion': '🎁',
    'store': '🏪'
  };
  
  // Check exact match first
  if (iconMap[type]) return iconMap[type];
  
  // Check partial match
  for (const [key, icon] of Object.entries(iconMap)) {
    if (typeStr.includes(key.replace('_', ''))) return icon;
  }
  
  return '🔔';
}

/**
 * Format refund message based on payment status
 */
export function getRefundMessage(paymentStatus) {
  if (paymentStatus === 'refund_pending') {
    return 'Your payment will be refunded soon. This is a demo payment, so no actual refund is processed.';
  }
  if (paymentStatus === 'refunded') {
    return 'Your payment has been refunded (demo).';
  }
  if (paymentStatus === 'failed') {
    return 'No payment was processed for this order.';
  }
  return '';
}