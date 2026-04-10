// app/buyer/orders/page.js
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  Package,
  Clock,
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronUp,
  MapPin,
  Calendar,
  ShoppingBag,
  RefreshCw,
  FileText,
  Loader2,
  AlertCircle,
  ArrowRight,
} from 'lucide-react';
import { fetchCustomerOrders, cancelOrder } from '../../../lib/api/orders';
import { supabase } from '../../../lib/supabase/client';
import ProductImage from '../../components/ProductImage';
import BuyerNavbar from '../../components/BuyerNavbar'; // ← import the shared navbar
import '../BuyerHome.css';
import './OrderHistory.css';

export default function OrderHistoryPage() {
  const router = useRouter();

  // State Management
  const [orders, setOrders] = useState([]);
  const [filteredOrders, setFilteredOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [expandedOrders, setExpandedOrders] = useState(new Set());
  const [currentUser, setCurrentUser] = useState(null);
  const [cancellingOrder, setCancellingOrder] = useState(null);

  // Get current user
  useEffect(() => {
    const getCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setCurrentUser(user);
    };
    getCurrentUser();
  }, []);

  // Helper functions
  const getProductImageUrl = (item) => {
    if (item.image_url) return item.image_url;
    if (item.product?.image_url) return item.product.image_url;
    if (item.metadata?.image_url) return item.metadata.image_url;
    if (item.product_metadata?.image_url) return item.product_metadata.image_url;
    return null;
  };

  const getProductSize = (item) => {
    if (item.selectedSize) return item.selectedSize;
    if (item.size) return item.size;
    if (item.metadata?.selectedSize) return item.metadata.selectedSize;
    if (item.metadata?.size) return item.metadata.size;

    if (item.metadata?.variants && Array.isArray(item.metadata.variants)) {
      if (item.metadata.variants.length === 1) {
        return item.metadata.variants[0].size;
      }
      const matchingVariant = item.metadata.variants.find(v =>
        parseFloat(v.price) === parseFloat(item.price)
      );
      if (matchingVariant?.size) return matchingVariant.size;
    }

    if (item.product?.metadata?.selectedSize) return item.product.metadata.selectedSize;
    if (item.product?.metadata?.size) return item.product.metadata.size;

    return null;
  };

  const formatProductName = (item) => {
    const name = item.name || item.product_name || 'Product';
    const size = getProductSize(item);
    return size ? `${name} (${size})` : name;
  };

  const getCategoryEmoji = (category) => {
    const categoryEmojis = {
      'Desserts': '🍰', 'Coffee': '☕', 'Snacks': '🍿',
      'Smoothies': '🥤', 'Sandwiches': '🥪', 'Bakery': '🍞',
      'Beverages': '🥤', 'Dairy': '🥛', 'Fruits': '🍌',
      'Vegetables': '🥕', 'Meat': '🥩', 'Seafood': '🐟',
      'Frozen': '🧊', 'Grains': '🌾'
    };
    return categoryEmojis[category] || '📦';
  };

  const formatPrice = (price) => {
    const numPrice = parseFloat(price);
    if (isNaN(numPrice)) return '₹0.00';
    return `₹${numPrice.toFixed(2)}`;
  };

  // Load orders when user is available
  useEffect(() => {
    if (currentUser) loadOrders();
  }, [currentUser]);

  // Apply filters
  useEffect(() => {
    applyFilters();
  }, [orders, searchQuery, activeFilter]);

  // Real-time subscriptions
  useEffect(() => {
    if (!currentUser) return;

    const ordersSubscription = supabase
      .channel('order-updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `customer_id=eq.${currentUser.id}` },
        (payload) => handleOrderUpdate(payload)
      )
      .subscribe();

    const queueSubscription = supabase
      .channel('queue-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'queue' }, () => loadOrders())
      .subscribe();

    return () => {
      ordersSubscription.unsubscribe();
      queueSubscription.unsubscribe();
    };
  }, [currentUser]);

  const handleOrderUpdate = (payload) => {
    const { eventType, new: newRecord, old: oldRecord } = payload;
    if (eventType === 'INSERT') {
      loadOrders();
    } else if (eventType === 'UPDATE') {
      setOrders(prev => prev.map(o => o.id === newRecord.id ? { ...o, ...newRecord } : o));
    } else if (eventType === 'DELETE') {
      setOrders(prev => prev.filter(o => o.id !== oldRecord.id));
    }
  };

  const loadOrders = async () => {
    if (!currentUser) return;
    setLoading(true);
    setError(null);

    try {
      const { data: ordersData, error: fetchError } = await supabase
        .from('orders')
        .select(`
          *,
          stores:store_id (id, store_name, logo_url, address, city, phone),
          queue:queue_id (id, token_number, status, wait_time_minutes)
        `)
        .eq('customer_id', currentUser.id)
        .order('created_at', { ascending: false })
        .limit(100);

      if (fetchError) throw new Error(fetchError.message);

      const enrichedOrders = await Promise.all(
        (ordersData || []).map(async (order) => {
          if (!order.items || !Array.isArray(order.items)) return order;

          const enrichedItems = await Promise.all(
            order.items.map(async (item) => {
              if (getProductImageUrl(item)) return item;
              if (item.productId || item.product_id) {
                try {
                  const { data: productData } = await supabase
                    .from('products')
                    .select('image_url, metadata')
                    .eq('id', item.productId || item.product_id)
                    .single();
                  if (productData) {
                    return {
                      ...item,
                      image_url: productData.image_url,
                      metadata: { ...(item.metadata || {}), ...(productData.metadata || {}) }
                    };
                  }
                } catch (err) {
                  console.warn('Failed to fetch product details:', err);
                }
              }
              return item;
            })
          );

          return { ...order, items: enrichedItems };
        })
      );

      setOrders(enrichedOrders);
    } catch (err) {
      console.error('Error loading orders:', err);
      setError(err.message || 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = useCallback(() => {
    let filtered = [...orders];

    if (activeFilter !== 'all') {
      filtered = filtered.filter(order => {
        if (activeFilter === 'active') return ['pending', 'confirmed', 'preparing', 'ready'].includes(order.order_status);
        if (activeFilter === 'completed') return order.order_status === 'completed';
        if (activeFilter === 'cancelled') return order.order_status === 'cancelled';
        return order.order_status === activeFilter;
      });
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(order =>
        order.order_number?.toLowerCase().includes(query) ||
        order.stores?.store_name?.toLowerCase().includes(query) ||
        order.items?.some(item => item.name?.toLowerCase().includes(query))
      );
    }

    setFilteredOrders(filtered);
  }, [orders, searchQuery, activeFilter]);

  const toggleOrderExpanded = (orderId) => {
    setExpandedOrders(prev => {
      const next = new Set(prev);
      next.has(orderId) ? next.delete(orderId) : next.add(orderId);
      return next;
    });
  };

  const handleCancelOrder = async (orderId, orderNumber) => {
    if (!confirm(`Cancel order ${orderNumber}? This action cannot be undone.`)) return;
    setCancellingOrder(orderId);
    try {
      const { data, error: cancelError } = await cancelOrder(orderId, 'Cancelled by customer');
      if (cancelError) throw new Error(cancelError);
      await loadOrders();
      alert('Order cancelled successfully. Refund will be processed soon.');
    } catch (err) {
      console.error('Error cancelling order:', err);
      alert(err.message || 'Failed to cancel order');
    } finally {
      setCancellingOrder(null);
    }
  };

  const handleReorder = (order) => {
    const reorderData = {
      storeId: order.store_id,
      items: order.items.map(item => ({
        productId: item.productId || item.product_id,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        category: item.category,
        image: item.image,
        image_url: getProductImageUrl(item),
        selectedSize: getProductSize(item)
      }))
    };
    localStorage.setItem('reorder_data', JSON.stringify(reorderData));
    router.push(`/buyer/store/${order.store_id}`);
  };

  const handleViewInvoice = (orderId) => router.push(`/buyer/orders/${orderId}`);

  const handleProceedToConfirmation = (orderId) => {
    if (orderId) router.push(`/buyer/order-confirmation/${orderId}`);
  };

  const orderStats = {
    total: orders.length,
    active: orders.filter(o => ['pending', 'confirmed', 'preparing', 'ready'].includes(o.order_status)).length,
    completed: orders.filter(o => o.order_status === 'completed').length,
    cancelled: orders.filter(o => o.order_status === 'cancelled').length,
    totalSpent: orders
      .filter(o => o.payment_status === 'paid')
      .reduce((sum, o) => sum + (parseFloat(o.total_amount) || 0), 0)
  };

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'pending': case 'confirmed': case 'preparing': case 'ready': return 'status-active';
      case 'completed': return 'status-completed';
      case 'cancelled': return 'status-cancelled';
      default: return 'status-active';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'pending': case 'confirmed': return <Clock className="w-4 h-4" />;
      case 'preparing': case 'ready': return <Package className="w-4 h-4" />;
      case 'completed': return <CheckCircle className="w-4 h-4" />;
      case 'cancelled': return <XCircle className="w-4 h-4" />;
      default: return <Clock className="w-4 h-4" />;
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor(Math.abs(now - date) / (1000 * 60 * 60 * 24));
    const timeStr = date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    if (diffDays === 0) return `Today at ${timeStr}`;
    if (diffDays === 1) return `Yesterday at ${timeStr}`;
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  // ── Loading state ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="buyer-home-container">
        <BuyerNavbar />
        <div className="buyer-home-loading-state">
          <Loader2 className="buyer-home-loading-spinner" />
          <p>Loading your orders...</p>
        </div>
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="buyer-home-container">
        <BuyerNavbar />
        <div className="buyer-home-main-content">
          <div className="order-history-empty-state">
            <AlertCircle className="order-history-empty-icon" />
            <h2 className="order-history-empty-title">Something went wrong</h2>
            <p className="order-history-empty-text">{error}</p>
            <button
              onClick={loadOrders}
              className="order-history-action-btn primary"
              style={{ marginTop: '1.5rem' }}
            >
              <RefreshCw className="w-4 h-4" /> Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────
  return (
    <div className="buyer-home-container">
      <BuyerNavbar />

      <div className="buyer-home-main-content">
        <div className="buyer-home-hero-section">
          <h1 className="buyer-home-hero-title">
            Your <span className="buyer-home-hero-title-gradient">Orders</span>
          </h1>
          <p className="buyer-home-hero-subtitle">
            Track your orders and view purchase history
          </p>
        </div>

        {orders.length > 0 && (
          <div className="order-history-summary-cards">
            <div className="order-history-summary-card blue">
              <p className="order-history-summary-label">Total Orders</p>
              <p className="order-history-summary-value">{orderStats.total}</p>
            </div>
            <div className="order-history-summary-card green">
              <p className="order-history-summary-label">Completed</p>
              <p className="order-history-summary-value">{orderStats.completed}</p>
            </div>
            <div className="order-history-summary-card amber">
              <p className="order-history-summary-label">Total Spent</p>
              <p className="order-history-summary-value">₹{orderStats.totalSpent.toFixed(0)}</p>
            </div>
          </div>
        )}

        {orders.length > 0 && (
          <div className="order-history-search-section">
            <div className="order-history-search-wrapper">
              <Search className="order-history-search-icon" />
              <input
                type="text"
                placeholder="Search by order number, store, or items..."
                className="order-history-search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="order-history-filter-tabs">
              {[
                { key: 'all',       label: 'All Orders', count: orderStats.total,     icon: null },
                { key: 'active',    label: 'Active',     count: orderStats.active,    icon: <Clock className="w-4 h-4" /> },
                { key: 'completed', label: 'Completed',  count: orderStats.completed, icon: <CheckCircle className="w-4 h-4" /> },
                { key: 'cancelled', label: 'Cancelled',  count: orderStats.cancelled, icon: <XCircle className="w-4 h-4" /> },
              ].map(({ key, label, count, icon }) => (
                <button
                  key={key}
                  className={`order-history-filter-tab ${activeFilter === key ? 'active' : ''}`}
                  onClick={() => setActiveFilter(key)}
                >
                  {icon}
                  {label}
                  <span className={`order-history-filter-count ${activeFilter === key ? 'active' : ''}`}>
                    {count}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {filteredOrders.length === 0 ? (
          <div className="order-history-empty-state">
            <ShoppingBag className="order-history-empty-icon" />
            <h2 className="order-history-empty-title">
              {searchQuery || activeFilter !== 'all' ? 'No orders found' : 'No orders yet'}
            </h2>
            <p className="order-history-empty-text">
              {searchQuery || activeFilter !== 'all'
                ? 'Try adjusting your search or filter'
                : 'Start ordering from your favorite stores'}
            </p>
            {!searchQuery && activeFilter === 'all' && (
              <button
                onClick={() => router.push('/buyer')}
                className="order-history-action-btn primary"
                style={{ marginTop: '1.5rem' }}
              >
                Browse Stores
              </button>
            )}
          </div>
        ) : (
          <div className="order-history-orders-list">
            {filteredOrders.map((order) => {
              const isExpanded = expandedOrders.has(order.id);
              const canCancel = ['pending', 'confirmed'].includes(order.order_status);
              const isOngoing = ['pending', 'confirmed', 'preparing', 'ready'].includes(order.order_status);
              const totalItems = order.items?.reduce((sum, item) => sum + item.quantity, 0) || 0;

              return (
                <div key={order.id} className="order-history-order-card">
                  <div className="order-history-order-content">
                    <div className="order-history-order-icon">
                      {order.stores?.logo_url ? (
                        <img
                          src={order.stores.logo_url}
                          alt={order.stores.store_name}
                          style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '1rem' }}
                        />
                      ) : '🏪'}
                    </div>

                    <div className="order-history-order-body">
                      <div className="order-history-order-header">
                        <div>
                          <h3 className="order-history-order-store">
                            {order.stores?.store_name || 'Store'}
                          </h3>
                          <div className="order-history-order-meta">
                            <span className="order-history-order-id">#{order.order_number}</span>
                            <span>•</span>
                            <span className="order-history-order-date-info">
                              <Calendar className="w-3.5 h-3.5" />
                              {formatDate(order.ordered_at || order.created_at)}
                            </span>
                          </div>
                        </div>

                        <div className={`order-history-status-badge ${getStatusBadgeClass(order.order_status)}`}>
                          {getStatusIcon(order.order_status)}
                          <span className="order-history-status-text">{order.order_status}</span>
                        </div>
                      </div>

                      {/* Items — collapsed view */}
                      {!isExpanded && (
                        <div className="order-history-order-items-section">
                          <p className="order-history-items-label">
                            Order Items ({totalItems} {totalItems === 1 ? 'item' : 'items'})
                          </p>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                            {order.items?.map((item, idx) => {
                              const imageUrl = getProductImageUrl(item);
                              return (
                                <div key={idx} style={{
                                  display: 'flex', alignItems: 'center', gap: '0.75rem',
                                  padding: '0.5rem', background: '#f9fafb', borderRadius: '0.5rem'
                                }}>
                                  <ProductImage
                                    src={imageUrl}
                                    fallback={item.image || getCategoryEmoji(item.category)}
                                    alt={item.name}
                                    category={item.category}
                                    size="small"
                                  />
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <p style={{
                                      fontWeight: '500', color: '#1f2937', fontSize: '0.875rem',
                                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0
                                    }}>
                                      {formatProductName(item)}
                                    </p>
                                    <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: 0 }}>
                                      Qty: {item.quantity} × {formatPrice(item.price)}
                                    </p>
                                  </div>
                                  <p style={{ fontWeight: '600', color: '#1f2937', whiteSpace: 'nowrap', fontSize: '0.875rem', margin: 0 }}>
                                    {formatPrice(item.price * item.quantity)}
                                  </p>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Items — expanded view */}
                      {isExpanded && (
                        <>
                          <div className="order-history-order-items-section">
                            <p className="order-history-items-label">
                              Order Items ({totalItems} {totalItems === 1 ? 'item' : 'items'})
                            </p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.75rem' }}>
                              {order.items?.map((item, idx) => {
                                const imageUrl = getProductImageUrl(item);
                                return (
                                  <div key={idx} style={{
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    padding: '0.75rem', background: '#f9fafb', borderRadius: '0.5rem'
                                  }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                      <ProductImage
                                        src={imageUrl}
                                        fallback={item.image || getCategoryEmoji(item.category)}
                                        alt={item.name}
                                        category={item.category}
                                        size="medium"
                                      />
                                      <div>
                                        <p style={{ fontWeight: '500', color: '#1f2937' }}>{formatProductName(item)}</p>
                                        <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                                          Qty: {item.quantity} × {formatPrice(item.price)}
                                        </p>
                                      </div>
                                    </div>
                                    <p style={{ fontWeight: '600', color: '#1f2937' }}>
                                      {formatPrice(item.price * item.quantity)}
                                    </p>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          <div className="order-history-order-details-grid">
                            <div>
                              <p className="order-history-detail-label">Store Location</p>
                              <p className="order-history-detail-value">{order.stores?.city || 'N/A'}</p>
                            </div>
                            <div>
                              <p className="order-history-detail-label">Payment Method</p>
                              <p className="order-history-detail-value">{order.payment_method || 'N/A'}</p>
                            </div>
                            <div>
                              <p className="order-history-detail-label">Payment Status</p>
                              <p className="order-history-detail-value">{order.payment_status || 'N/A'}</p>
                            </div>
                            {order.queue?.token_number && (
                              <div>
                                <p className="order-history-detail-label">Token Number</p>
                                <p className="order-history-detail-value" style={{
                                  fontFamily: 'monospace', fontWeight: '700', color: '#667eea'
                                }}>
                                  {order.queue.token_number}
                                </p>
                              </div>
                            )}
                          </div>

                          {/* Price breakdown */}
                          <div style={{ background: '#f9fafb', padding: '1rem', borderRadius: '0.75rem', marginTop: '0.5rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.875rem', color: '#6b7280' }}>
                              <span>Subtotal</span><span>₹{order.subtotal?.toFixed(2)}</span>
                            </div>
                            {order.discount > 0 && (
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.875rem', color: '#10b981' }}>
                                <span>Discount</span><span>-₹{order.discount?.toFixed(2)}</span>
                              </div>
                            )}
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem', fontSize: '0.875rem', color: '#6b7280' }}>
                              <span>Tax</span><span>₹{order.tax?.toFixed(2)}</span>
                            </div>
                            <div style={{
                              borderTop: '1px solid #e5e7eb', paddingTop: '0.75rem',
                              display: 'flex', justifyContent: 'space-between',
                              fontWeight: '700', fontSize: '1.125rem', color: '#1f2937'
                            }}>
                              <span>Total Amount</span><span>₹{order.total_amount?.toFixed(2)}</span>
                            </div>
                          </div>

                          {order.stores?.address && (
                            <div style={{
                              display: 'flex', alignItems: 'flex-start', gap: '0.5rem',
                              padding: '0.75rem', background: '#f9fafb', borderRadius: '0.5rem', marginTop: '0.5rem'
                            }}>
                              <MapPin className="w-4 h-4" style={{ color: '#667eea', flexShrink: 0, marginTop: '0.125rem' }} />
                              <div>
                                <p style={{ fontWeight: '500', fontSize: '0.875rem', color: '#1f2937' }}>
                                  {order.stores.store_name}
                                </p>
                                <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                                  {order.stores.address}, {order.stores.city}
                                </p>
                                {order.stores.phone && (
                                  <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>📞 {order.stores.phone}</p>
                                )}
                              </div>
                            </div>
                          )}
                        </>
                      )}

                      {/* Action buttons */}
                      <div className="order-history-order-actions">
                        <button
                          onClick={() => toggleOrderExpanded(order.id)}
                          className="order-history-action-btn secondary"
                        >
                          {isExpanded
                            ? <><ChevronUp className="w-4 h-4" /> Show Less</>
                            : <><ChevronDown className="w-4 h-4" /> View Details</>}
                        </button>

                        <button
                          onClick={() => handleViewInvoice(order.id)}
                          className="order-history-action-btn secondary"
                        >
                          <FileText className="w-4 h-4" /> Invoice
                        </button>

                        {isOngoing && (
                          <button
                            onClick={() => handleProceedToConfirmation(order.id)}
                            className="order-history-action-btn primary"
                            style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white' }}
                          >
                            <ArrowRight className="w-4 h-4" /> Order Confirmation
                          </button>
                        )}

                        {order.order_status === 'completed' && (
                          <button
                            onClick={() => handleReorder(order)}
                            className="order-history-action-btn primary"
                          >
                            <RefreshCw className="w-4 h-4" /> Reorder
                          </button>
                        )}

                        {canCancel && (
                          <button
                            onClick={() => handleCancelOrder(order.id, order.order_number)}
                            className="order-history-action-btn secondary"
                            disabled={cancellingOrder === order.id}
                            style={{
                              color: '#dc2626',
                              borderColor: cancellingOrder === order.id ? '#d1d5db' : '#fee2e2',
                              background: cancellingOrder === order.id ? '#f9fafb' : '#fef2f2'
                            }}
                          >
                            {cancellingOrder === order.id
                              ? <><Loader2 className="w-4 h-4" style={{ animation: 'spin 1s linear infinite' }} /> Cancelling...</>
                              : <><XCircle className="w-4 h-4" /> Cancel Order</>}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}