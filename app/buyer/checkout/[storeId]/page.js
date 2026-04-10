'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  Trash2, Plus, Minus, Clock, Tag, CreditCard,
  Smartphone, Wallet, AlertCircle, ShoppingCart, Package, Bell,
  Home, Menu, X, MapPin, Loader2, Users
} from 'lucide-react';
import toast from 'react-hot-toast';
import QRPaymentModal from '@/app/components/QRPaymentModal';
import { createOrder, completePaymentAndGenerateToken } from '@/lib/api/orders';
import { fetchStoreById } from '@/lib/api/stores';
import {
  getCartItemsGroupedByStore, updateCartItemQuantity,
  removeFromCart, clearStoreCart
} from '@/lib/api/cart';
import { hasProductsFeature } from '@/lib/categoryConfig';
import { supabase } from '@/lib/supabase/client';
import '../CartCheckout.css';
import ProductImage from '@/app/components/ProductImage';
import { formatProductDisplayInfo, formatPrice } from '@/lib/utils/productHelpers';

// ─────────────────────────────────────────────────────────────────────────────
// StoreAvatar
// ─────────────────────────────────────────────────────────────────────────────
function StoreAvatar({ logoUrl, storeName }) {
  const [imgError, setImgError] = useState(false);

  if (logoUrl && !imgError) {
    return (
      <div className="checkout-store-avatar">
        <img
          src={logoUrl}
          alt={`${storeName} logo`}
          className="checkout-store-avatar-img"
          onError={() => setImgError(true)}
        />
      </div>
    );
  }

  return (
    <div className="checkout-store-avatar checkout-store-avatar-fallback">
      🏪
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────
export default function StoreCheckoutPage() {
  const router = useRouter();
  const params = useParams();
  const storeId = params.storeId;

  const [cartItems, setCartItems] = useState([]);
  const [promoCode, setPromoCode] = useState('');
  const [appliedPromo, setAppliedPromo] = useState(null);
  const [selectedPayment, setSelectedPayment] = useState('upi');
  const [showQRModal, setShowQRModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [storeData, setStoreData] = useState(null);
  const [queueInfo, setQueueInfo] = useState({ queueSize: 0, avgWaitTime: 5 });
  const [currentUser, setCurrentUser] = useState(null);
  const [isQueueOnlyMode, setIsQueueOnlyMode] = useState(false);
  const [pendingOrder, setPendingOrder] = useState(null);

  const paymentMethods = [
    { id: 'upi',    name: 'UPI',              icon: <Smartphone className="w-5 h-5" />, popular: true  },
    { id: 'card',   name: 'Credit/Debit Card', icon: <CreditCard  className="w-5 h-5" />, popular: false },
    { id: 'wallet', name: 'Digital Wallet',    icon: <Wallet      className="w-5 h-5" />, popular: false },
  ];

  const navItems = [
    { icon: Home,         label: 'Home',         path: '/buyer',               active: false },
    { icon: ShoppingCart, label: 'Cart',          path: '/buyer/cart',          active: false },
    { icon: Package,      label: 'Orders',        path: '/buyer/orders',        active: false },
    { icon: Bell,         label: 'Notifications', path: '/buyer/notifications', active: false },
  ];

  useEffect(() => { loadCheckoutData(); }, [storeId]);

  // ── Data loading ──────────────────────────────────────────────────────────
  const loadCheckoutData = async () => {
    setLoading(true);
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw new Error(userError.message || 'Authentication error');
      if (!user) { toast.error('Please login to continue'); router.push('/auth/signin'); return; }
      setCurrentUser(user);

      const { data: store, error: storeError } = await fetchStoreById(storeId);
      if (storeError) throw new Error(typeof storeError === 'string' ? storeError : 'Failed to load store');
      if (!store) { toast.error('Store not found'); router.push('/buyer/cart'); return; }
      setStoreData(store);

      const storeHasProducts = hasProductsFeature(store.store_type);
      setIsQueueOnlyMode(!storeHasProducts);

      try {
        const { data: queueData, error: queueError } = await supabase
          .from('queue')
          .select('id, wait_time_minutes, status')
          .eq('store_id', storeId)
          .in('status', ['waiting', 'in_service']);

        if (!queueError && queueData) {
          const queueSize = queueData.length;
          const avgWaitTime = queueData.length > 0
            ? Math.round(queueData.reduce((s, q) => s + (q.wait_time_minutes || 5), 0) / queueData.length)
            : store.avg_service_time || 5;
          setQueueInfo({ queueSize, avgWaitTime });
        }
      } catch {
        setQueueInfo({ queueSize: 0, avgWaitTime: store.avg_service_time || 5 });
      }

      if (storeHasProducts) {
        const { data: cartData, error: cartError } = await getCartItemsGroupedByStore(user.id);
        if (cartError) throw new Error(typeof cartError === 'string' ? cartError : 'Failed to load cart');
        const storeCart = cartData.stores.find(s => s.storeId === storeId);
        if (!storeCart || storeCart.items.length === 0) {
          toast.error('No items in cart for this store');
          router.push('/buyer/cart');
          return;
        }
        setCartItems(storeCart.items);
      } else {
        setCartItems([]);
      }
    } catch (error) {
      console.error('Error loading checkout:', error);
      toast.error(error?.message || 'Failed to load checkout data');
      router.push('/buyer/cart');
    } finally {
      setLoading(false);
    }
  };

  // ── Cart helpers ──────────────────────────────────────────────────────────
  const updateQuantity = async (cartItemId, delta) => {
    const item = cartItems.find(i => i.cartItemId === cartItemId);
    if (!item) return;
    const newQty = item.quantity + delta;
    if (newQty < 1) { toast.error('Quantity cannot be less than 1'); return; }
    if (newQty > item.stock) { toast.error(`Only ${item.stock} items available`); return; }
    try {
      const { error } = await updateCartItemQuantity(cartItemId, newQty);
      if (error) throw new Error(typeof error === 'string' ? error : 'Failed to update quantity');
      await loadCheckoutData();
    } catch (error) {
      toast.error(error?.message || 'Failed to update quantity');
    }
  };

  const removeItem = async (cartItemId) => {
    try {
      const { error } = await removeFromCart(cartItemId);
      if (error) throw new Error(typeof error === 'string' ? error : 'Failed to remove item');
      toast.success('Item removed');
      await loadCheckoutData();
    } catch (error) {
      toast.error(error?.message || 'Failed to remove item');
    }
  };

  const applyPromo = () => {
    if (isQueueOnlyMode) { toast.error('Promo codes not available for queue-only services'); return; }
    const code = promoCode.toUpperCase().trim();
    if (code === 'FIRST10') {
      setAppliedPromo({ code: 'FIRST10', discount: 10, type: 'percentage' });
      toast.success('🎉 Promo code applied! 10% off');
    } else if (code === 'SAVE50') {
      setAppliedPromo({ code: 'SAVE50', discount: 50, type: 'fixed' });
      toast.success('🎉 Promo code applied! ₹50 off');
    } else {
      setAppliedPromo(null);
      toast.error('Invalid promo code');
    }
  };

  // ── Pricing ───────────────────────────────────────────────────────────────
  const subtotal = isQueueOnlyMode ? 0 : cartItems.reduce((s, i) => s + i.price * i.quantity, 0);
  const discount = appliedPromo && !isQueueOnlyMode
    ? appliedPromo.type === 'percentage'
      ? (subtotal * appliedPromo.discount) / 100
      : appliedPromo.discount
    : 0;
  const tax   = isQueueOnlyMode ? 0 : (subtotal - discount) * 0.05;
  const total = isQueueOnlyMode ? 0 : subtotal - discount + tax;

  // ── ✅ Fully atomic queue entry — single DB function call ─────────────────
  //
  //  PREREQUISITE: Run fix_queue_constraint.sql in Supabase SQL Editor first.
  //  The function acquires an advisory lock, finds the next free sequence,
  //  and inserts the row — all inside ONE transaction. No race conditions.
  //
  const createQueueEntryAtomically = async () => {
    const tokenPrefix = storeData.store_type.substring(0, 3).toUpperCase();

    console.log('🎫 Calling create_queue_entry_atomic RPC...');

    const { data, error } = await supabase.rpc('create_queue_entry_atomic', {
      p_store_id:          storeId,
      p_customer_id:       currentUser.id,
      p_token_prefix:      tokenPrefix,
      p_wait_time_minutes: queueInfo.avgWaitTime,
      p_customer_name:     currentUser.user_metadata?.full_name || currentUser.email || '',
      p_customer_phone:    currentUser.user_metadata?.phone || '',
    });

    if (error) {
      console.error('❌ create_queue_entry_atomic RPC error:', error);
      throw new Error(error.message || 'Failed to join queue. Please try again.');
    }

    console.log('✅ RPC returned:', data);

    // SETOF returns an array
    const queueEntry = Array.isArray(data) ? data[0] : data;
    if (!queueEntry) {
      throw new Error('No queue entry returned from server. Please try again.');
    }

    return queueEntry;
  };

  // ── Checkout / payment flow ───────────────────────────────────────────────
  const handleProceedToPayment = async () => {
    if (!currentUser)  { toast.error('Please login to continue'); router.push('/auth/signin'); return; }
    if (!storeData)    { toast.error('Store data not loaded'); return; }
    if (!storeData.is_open) { toast.error('Store is currently closed'); return; }
    if (!isQueueOnlyMode && cartItems.length === 0) { toast.error('Your cart is empty'); return; }

    setIsProcessing(true);
    try {
      if (isQueueOnlyMode) {
        const queueEntry = await createQueueEntryAtomically();
        toast.success('🎫 Successfully joined queue!');
        setTimeout(() => router.push(`/buyer/queue/${queueEntry.id}`), 500);
      } else {
        const orderItems = cartItems.map(item => {
          const size     = item.metadata?.selectedSize || item.selectedSize || null;
          const imageUrl = item.image_url || item.product?.image_url || item.metadata?.image_url || null;
          return {
            productId:    item.productId,
            name:         item.name,
            price:        parseFloat(item.price),
            quantity:     parseInt(item.quantity),
            category:     item.category || 'General',
            image:        item.image || '📦',
            image_url:    imageUrl,
            selectedSize: size,
            size,
            metadata:     { selectedSize: size, image_url: imageUrl, ...(item.metadata || {}) },
          };
        });

        const { data, error } = await createOrder({
          storeId,
          customerId:    currentUser.id,
          items:         orderItems,
          paymentMethod: selectedPayment.toUpperCase(),
          subtotal:      parseFloat(subtotal.toFixed(2)),
          tax:           parseFloat(tax.toFixed(2)),
          discount:      parseFloat(discount.toFixed(2)),
          total:         parseFloat(total.toFixed(2)),
          customerNotes: '',
        });
        if (error) throw new Error(typeof error === 'string' ? error : 'Failed to create order');

        setPendingOrder({
  orderId:       data.order.id,
  transactionId: data.transaction.transaction_id,
  orderNumber:   data.orderNumber,
  storeName:     storeData.store_name,
  totalAmount:   total,
  items:         orderItems,
  storeUpiId:    storeData?.metadata?.upi_id || null,  // ← ADD THIS LINE
});
        setShowQRModal(true);
      }
    } catch (error) {
      console.error('Error processing checkout:', error);
      toast.error(error?.message || 'Failed to process. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePaymentSuccess = async (gatewayTxnId) => {
    if (!pendingOrder) { toast.error('Order data not found'); return; }
    setIsProcessing(true);
    try {
      const formattedItems = pendingOrder.items.map(item => ({
        productId:    item.productId,
        name:         item.name,
        price:        parseFloat(item.price),
        quantity:     parseInt(item.quantity),
        category:     item.category || 'General',
        image:        item.image || '📦',
        image_url:    item.image_url,
        selectedSize: item.selectedSize,
        size:         item.size,
        metadata:     item.metadata || {},
      }));

      const { data, error } = await completePaymentAndGenerateToken({
        orderId:              pendingOrder.orderId,
        transactionId:        pendingOrder.transactionId,
        gatewayTransactionId: gatewayTxnId,
        storeId,
        customerId:           currentUser.id,
        items:                formattedItems,
        totalAmount:          parseFloat(pendingOrder.totalAmount.toFixed(2)),
      });
      if (error) throw new Error(typeof error === 'string' ? error : 'Payment completion failed');

      await clearStoreCart(currentUser.id, storeId);
      toast.success('Order placed successfully! 🎉');
      setShowQRModal(false);
      setTimeout(() => router.push(`/buyer/order-confirmation/${data.order.id}`), 500);
    } catch (error) {
      console.error('Error completing payment:', error);
      toast.error(error?.message || 'Payment failed. Please try again.');
      setShowQRModal(false);
    } finally {
      setIsProcessing(false);
    }
  };

  // ── Loading state ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="cart-checkout-container">
        <nav className="buyer-nav-bar">
          <div className="buyer-nav-content">
            <div className="buyer-nav-left">
              <div
                className="buyer-nav-logo-container"
                onClick={() => router.push('/')}
                style={{ cursor: 'pointer' }}
              >
                <img src="/noq-logo_1.svg" alt="NoQ" className="buyer-nav-logo-img" />
              </div>
            </div>
          </div>
        </nav>
        <div className="buyer-home-loading-state">
          <Loader2 className="buyer-home-loading-spinner" />
          <p>Loading checkout...</p>
        </div>
      </div>
    );
  }

  if (!storeData) return null;
  const logoUrl = storeData.logo_url || null;

  // ── Main render ───────────────────────────────────────────────────────────
  return (
    <>
      <div className="cart-checkout-container">

        {/* ── Navbar ── */}
        <nav className="buyer-nav-bar">
          <div className="buyer-nav-content">

            <div className="buyer-nav-left">
              <div
                className="buyer-nav-logo-container"
                onClick={() => router.push('/')}
                style={{ cursor: 'pointer' }}
              >
                <img src="/noq-logo_1.svg" alt="NoQ" className="buyer-nav-logo-img" />
              </div>
            </div>

            <div className="buyer-nav-center">
              {navItems.map(({ icon: Icon, label, path, active }) => (
                <button
                  key={path}
                  onClick={() => router.push(path)}
                  className={`buyer-nav-item ${active ? 'active' : ''}`}
                >
                  <div className="buyer-nav-item-icon"><Icon className="w-5 h-5" /></div>
                  <span className="buyer-nav-item-label">{label}</span>
                </button>
              ))}
            </div>

            <div className="buyer-nav-right">
              <button className="buyer-nav-location-btn">
                <MapPin className="w-4 h-4" />
                <span className="buyer-nav-location-text">Ghaziabad</span>
              </button>
              <button
                className="buyer-nav-mobile-toggle"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>

          {mobileMenuOpen && (
            <div className="buyer-mobile-menu">
              {navItems.map(({ icon: Icon, label, path, active }) => (
                <button
                  key={path}
                  onClick={() => { router.push(path); setMobileMenuOpen(false); }}
                  className={`buyer-mobile-menu-item ${active ? 'active' : ''}`}
                >
                  <Icon className="w-5 h-5" /><span>{label}</span>
                </button>
              ))}
            </div>
          )}
        </nav>

        {/* ── Content ── */}
        <div className="cart-checkout-main-content">
          <div className="cart-checkout-grid">

            {/* ────────── LEFT COLUMN ────────── */}
            <div className="cart-checkout-left-column">

              {/* Store info */}
              <div className="cart-checkout-store-info-card">
                <div className="cart-checkout-store-info-content">
                  <div>
                    <h2 className="cart-checkout-store-name">{storeData.store_name}</h2>
                    <div className="cart-checkout-store-meta">
                      <span className="cart-checkout-wait-info">
                        <Clock className="w-4 h-4" />
                        Wait: {queueInfo.avgWaitTime} min
                      </span>
                      <span className="cart-checkout-queue-info">
                        {queueInfo.queueSize} in queue
                      </span>
                      {isQueueOnlyMode && (
                        <span style={{
                          padding: '0.375rem 0.875rem',
                          background: '#fef3c7',
                          color: '#92400e',
                          borderRadius: '0.5rem',
                          fontSize: '0.875rem',
                          fontWeight: '600',
                        }}>
                          <Users className="w-4 h-4" style={{ display: 'inline', marginRight: '0.25rem' }} />
                          Queue-Only Service
                        </span>
                      )}
                    </div>
                  </div>
                  <StoreAvatar logoUrl={logoUrl} storeName={storeData.store_name} />
                </div>
              </div>

              {/* Product store: cart items + promo */}
              {!isQueueOnlyMode ? (
                <>
                  <div className="cart-checkout-items-card">
                    <h2 className="cart-checkout-section-title">
                      Your Items ({cartItems.length})
                    </h2>
                    <div className="cart-checkout-items-list">
                      {cartItems.map(item => {
                        const d = formatProductDisplayInfo(item);
                        return (
                          <div key={item.cartItemId} className="cart-checkout-item">
                            <div className="cart-checkout-item-image">
                              <ProductImage
                                src={d.imageUrl} fallback={d.emoji}
                                alt={d.name} category={d.category} size="small"
                              />
                            </div>
                            <div className="cart-checkout-item-info">
                              <h3 className="cart-checkout-item-name">{d.displayName}</h3>
                              <p className="cart-checkout-item-details">{d.category}</p>
                              <p className="cart-checkout-item-price">{formatPrice(item.price)}</p>
                            </div>
                            <div className="cart-checkout-quantity-controls">
                              <button
                                onClick={() => updateQuantity(item.cartItemId, -1)}
                                className="cart-checkout-qty-btn"
                              >
                                <Minus className="w-4 h-4" />
                              </button>
                              <span className="cart-checkout-qty-display">{item.quantity}</span>
                              <button
                                onClick={() => updateQuantity(item.cartItemId, 1)}
                                className="cart-checkout-qty-btn"
                              >
                                <Plus className="w-4 h-4" />
                              </button>
                            </div>
                            <div className="cart-checkout-item-total">
                              <p className="cart-checkout-item-total-price">
                                {formatPrice(item.price * item.quantity)}
                              </p>
                            </div>
                            <button
                              onClick={() => removeItem(item.cartItemId)}
                              className="cart-checkout-remove-btn"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="cart-checkout-promo-card">
                    <h2 className="cart-checkout-promo-title">
                      <Tag className="w-5 h-5" /> Apply Promo Code
                    </h2>
                    <div className="cart-checkout-promo-input-group">
                      <input
                        type="text"
                        placeholder="Enter promo code"
                        value={promoCode}
                        onChange={e => setPromoCode(e.target.value.toUpperCase())}
                        className="cart-checkout-promo-input"
                      />
                      <button onClick={applyPromo} className="cart-checkout-promo-btn">
                        Apply
                      </button>
                    </div>
                    {appliedPromo && (
                      <div className="cart-checkout-promo-success">
                        <span className="cart-checkout-promo-success-text">
                          🎉 {appliedPromo.code} applied! Save ₹{discount.toFixed(2)}
                        </span>
                        <button
                          onClick={() => setAppliedPromo(null)}
                          className="cart-checkout-promo-remove"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                    <p className="cart-checkout-promo-hint">
                      Try:{' '}
                      <span className="cart-checkout-promo-code">FIRST10</span> or{' '}
                      <span className="cart-checkout-promo-code">SAVE50</span>
                    </p>
                  </div>
                </>
              ) : (
                /* Queue-only join panel */
                <div className="cart-checkout-items-card">
                  <h2 className="cart-checkout-section-title">
                    <Users className="w-6 h-6" style={{ display: 'inline', marginRight: '0.5rem' }} />
                    Join Queue
                  </h2>
                  <div style={{
                    padding: '2rem',
                    background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
                    borderRadius: '1rem',
                    textAlign: 'center',
                  }}>
                    <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🎫</div>
                    <h3 style={{
                      fontSize: '1.5rem', fontWeight: '700',
                      marginBottom: '0.5rem', color: '#1a1a1a',
                    }}>
                      No Payment Required
                    </h3>
                    <p style={{ color: '#4b5563', lineHeight: '1.6', marginBottom: '1.5rem' }}>
                      Simply join the queue to receive your token number.
                      You'll be notified when it's your turn.
                    </p>
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(2, 1fr)',
                      gap: '1rem',
                      marginTop: '1.5rem',
                    }}>
                      <div style={{ padding: '1rem', background: 'white', borderRadius: '0.75rem' }}>
                        <Users className="w-6 h-6" style={{ color: '#3b82f6', margin: '0 auto 0.5rem' }} />
                        <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>People Ahead</p>
                        <p style={{ fontSize: '1.5rem', fontWeight: '700' }}>{queueInfo.queueSize}</p>
                      </div>
                      <div style={{ padding: '1rem', background: 'white', borderRadius: '0.75rem' }}>
                        <Clock className="w-6 h-6" style={{ color: '#f59e0b', margin: '0 auto 0.5rem' }} />
                        <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>Est. Wait</p>
                        <p style={{ fontSize: '1.5rem', fontWeight: '700' }}>{queueInfo.avgWaitTime} min</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ────────── RIGHT COLUMN ────────── */}
            <div className="cart-checkout-right-column">
              <div className="cart-checkout-summary-card">
                <h2 className="cart-checkout-summary-title">
                  {isQueueOnlyMode ? 'Queue Summary' : 'Order Summary'}
                </h2>

                {!isQueueOnlyMode ? (
                  <>
                    <div className="cart-checkout-summary-details">
                      <div className="cart-checkout-summary-row">
                        <span>Subtotal</span><span>₹{subtotal.toFixed(2)}</span>
                      </div>
                      {appliedPromo && (
                        <div className="cart-checkout-summary-row discount">
                          <span>Discount ({appliedPromo.code})</span>
                          <span>-₹{discount.toFixed(2)}</span>
                        </div>
                      )}
                      <div className="cart-checkout-summary-row">
                        <span>Tax (5%)</span><span>₹{tax.toFixed(2)}</span>
                      </div>
                      <div className="cart-checkout-summary-divider" />
                      <div className="cart-checkout-summary-total">
                        <span>Total</span><span>₹{total.toFixed(2)}</span>
                      </div>
                    </div>

                    <div className="cart-checkout-payment-methods">
                      <h3 className="cart-checkout-payment-title">Payment Method</h3>
                      <div className="cart-checkout-payment-options">
                        {paymentMethods.map(method => (
                          <button
                            key={method.id}
                            onClick={() => setSelectedPayment(method.id)}
                            className={`cart-checkout-payment-option ${selectedPayment === method.id ? 'active' : ''}`}
                          >
                            <div className="cart-checkout-payment-option-content">
                              {method.icon}
                              <span className="cart-checkout-payment-name">{method.name}</span>
                            </div>
                            {method.popular && (
                              <span className="cart-checkout-payment-badge">Popular</span>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="cart-checkout-notice">
                      <div className="cart-checkout-notice-content">
                        <AlertCircle className="cart-checkout-notice-icon" />
                        <div className="cart-checkout-notice-text">
                          <p className="cart-checkout-notice-title">Demo Mode</p>
                          <p className="cart-checkout-notice-desc">
                            This is a dummy payment for demonstration purposes.
                          </p>
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="cart-checkout-summary-details">
                      <div className="cart-checkout-summary-row">
                        <span>Service Type</span><span>Queue-Only</span>
                      </div>
                      <div className="cart-checkout-summary-row">
                        <span>People in Queue</span><span>{queueInfo.queueSize}</span>
                      </div>
                      <div className="cart-checkout-summary-row">
                        <span>Est. Wait Time</span><span>{queueInfo.avgWaitTime} minutes</span>
                      </div>
                      <div className="cart-checkout-summary-divider" />
                      <div className="cart-checkout-summary-total">
                        <span>Payment</span>
                        <span style={{ color: '#10b981' }}>FREE</span>
                      </div>
                    </div>

                    <div
                      className="cart-checkout-notice"
                      style={{ background: '#ecfdf5', borderColor: '#a7f3d0' }}
                    >
                      <div className="cart-checkout-notice-content">
                        <Users
                          className="cart-checkout-notice-icon"
                          style={{ color: '#059669' }}
                        />
                        <div className="cart-checkout-notice-text">
                          <p className="cart-checkout-notice-title" style={{ color: '#047857' }}>
                            No Payment Required
                          </p>
                          <p className="cart-checkout-notice-desc" style={{ color: '#065f46' }}>
                            You'll receive a token number instantly after joining the queue.
                          </p>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                <div className="cart-checkout-queue-preview">
                  <p className="cart-checkout-queue-preview-label">
                    {isQueueOnlyMode ? 'After joining:' : 'After payment:'}
                  </p>
                  <div className="cart-checkout-queue-preview-content">
                    <div className="cart-checkout-token-number">🎫</div>
                    <div>
                      <p className="cart-checkout-token-text">You'll receive a queue token</p>
                      <p className="cart-checkout-token-wait">
                        Est. wait: {queueInfo.avgWaitTime} min
                      </p>
                    </div>
                  </div>
                </div>

                <button
                  disabled={isProcessing}
                  onClick={handleProceedToPayment}
                  className={`cart-checkout-confirm-btn ${isProcessing ? 'disabled' : ''}`}
                >
                  {isProcessing
                    ? 'Processing...'
                    : isQueueOnlyMode
                      ? 'Join Queue (Free) →'
                      : 'Proceed to Payment →'}
                </button>

                <p className="cart-checkout-terms">
                  {isQueueOnlyMode
                    ? 'By joining, you agree to our Terms & Conditions'
                    : 'By proceeding, you agree to our Terms & Conditions'}
                </p>
              </div>
            </div>

          </div>
        </div>
      </div>

      {showQRModal && pendingOrder && !isQueueOnlyMode && (
        <QRPaymentModal
          isOpen={showQRModal}
          onClose={() => { setShowQRModal(false); setPendingOrder(null); }}
          orderData={pendingOrder}
          onPaymentSuccess={handlePaymentSuccess}
        />
      )}
    </>
  );
}