// app/buyer/orders/[id]/page.jsx - FIXED with Size Variants & Product Images
'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Download, Package, Calendar, MapPin, Clock, CheckCircle, Printer, Tag, TrendingDown } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import ProductImage from '@/app/components/ProductImage';
import './OrderDetails.css';

export default function OrderDetailsPage({ params }) {
  const router = useRouter();
  const { id: orderId } = use(params);

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (orderId) {
      loadOrderDetails();
    }
  }, [orderId]);

// ✅ FIXED HELPER: Get product image URL
const getProductImageUrl = (item) => {
  if (item.image_url) return item.image_url;
  if (item.product?.image_url) return item.product.image_url;
  if (item.metadata?.image_url) return item.metadata.image_url;
  if (item.product_metadata?.image_url) return item.product_metadata.image_url;
  return null;
};

// ✅ FIXED HELPER: Get product size
const getProductSize = (item) => {
  if (item.selectedSize) return item.selectedSize;
  if (item.size) return item.size;
  if (item.metadata?.selectedSize) return item.metadata.selectedSize;
  if (item.metadata?.size) return item.metadata.size;
  
  // ✅ Extract from variants
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
  return null;
};

// ✅ Get category emoji
const getCategoryEmoji = (category) => {
  const categoryEmojis = {
    'Desserts': '🍰',
    'Coffee': '☕',
    'Snacks': '🍿',
    'Smoothies': '🥤',
    'Sandwiches': '🥪',
    'Bakery': '🍞',
    'Beverages': '🥤',
    'Dairy': '🥛',
    'Fruits': '🍌',
    'Vegetables': '🥕',
    'Meat': '🥩',
    'Seafood': '🐟',
    'Frozen': '🧊',
    'Grains': '🌾'
  };
  return categoryEmojis[category] || '📦';
};

  const loadOrderDetails = async () => {
    setLoading(true);
    try {
      // ✅ Fetch order with related data
      const { data: orderData, error: fetchError } = await supabase
        .from('orders')
        .select(`
          *,
          stores:store_id (
            id,
            store_name,
            logo_url,
            address,
            city,
            phone
          ),
          queue:queue_id (
            id,
            token_number,
            status
          )
        `)
        .eq('id', orderId)
        .single();

      if (fetchError) throw new Error(fetchError.message);

      // ✅ Enrich order items with product images and metadata
      if (orderData.items && Array.isArray(orderData.items)) {
        const enrichedItems = await Promise.all(
          orderData.items.map(async (item) => {
            // If image_url already exists, use it
            if (getProductImageUrl(item)) {
              return item;
            }

            // Otherwise, fetch from products table
            if (item.productId || item.product_id) {
              try {
                const { data: productData } = await supabase
                  .from('products')
                  .select('image_url, metadata, image')
                  .eq('id', item.productId || item.product_id)
                  .single();

                if (productData) {
                  return {
                    ...item,
                    image_url: productData.image_url,
                    image: item.image || productData.image,
                    metadata: {
                      ...(item.metadata || {}),
                      ...(productData.metadata || {})
                    }
                  };
                }
              } catch (err) {
                console.warn('Failed to fetch product details:', err);
              }
            }

            return item;
          })
        );

        orderData.items = enrichedItems;
      }

      console.log('✅ Order loaded with enriched items:', orderData);
      setOrder(orderData);
    } catch (err) {
      console.error('Error loading order:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = () => {
    window.print();
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString('en-IN', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusColor = (status) => {
    const colors = {
      'pending': '#f59e0b',
      'confirmed': '#3b82f6',
      'preparing': '#8b5cf6',
      'ready': '#10b981',
      'completed': '#059669',
      'cancelled': '#ef4444'
    };
    return colors[status] || '#6b7280';
  };

  // ✅ Calculate savings percentage
  const calculateSavings = (mrp, price) => {
    if (!mrp || mrp <= price) return null;
    const savings = ((mrp - price) / mrp) * 100;
    return savings.toFixed(0);
  };

  // ✅ Calculate total savings
  const calculateTotalSavings = () => {
    if (!order?.items) return 0;
    
    return order.items.reduce((total, item) => {
      const mrp = item.metadata?.mrp;
      if (mrp && mrp > item.price) {
        return total + ((mrp - item.price) * item.quantity);
      }
      return total;
    }, 0);
  };

  const totalSavings = order ? calculateTotalSavings() : 0;

  if (loading) {
    return (
      <div className="order-details-container">
        <div className="order-details-loading">
          <div className="order-details-spinner"></div>
          <p>Loading invoice...</p>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="order-details-container">
        <div className="order-details-error">
          <h2>Order Not Found</h2>
          <p>{error || 'Unable to load order details'}</p>
          <button 
            onClick={() => router.push('/buyer/orders')}
            className="order-details-btn-primary"
          >
            Back to Orders
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="order-details-container">
      {/* Header - Don't print */}
      <div className="order-details-header no-print">
        <button 
          onClick={() => router.push('/buyer/orders')}
          className="order-details-back-btn"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to Orders
        </button>
        <div className="order-details-actions">
          <button onClick={handlePrint} className="order-details-btn-secondary">
            <Printer className="w-5 h-5" />
            Print
          </button>
          <button onClick={handleDownload} className="order-details-btn-primary">
            <Download className="w-5 h-5" />
            Download
          </button>
        </div>
      </div>

      {/* Invoice Content */}
      <div className="order-details-invoice">
        {/* Invoice Header */}
        <div className="invoice-header">
          <div className="invoice-logo">
            <h1>NoQ</h1>
            <p>Skip the wait</p>
          </div>
          <div className="invoice-title">
            <h2>INVOICE</h2>
            <p className="invoice-number">#{order.order_number}</p>
          </div>
        </div>

        {/* Status Badge */}
        <div className="invoice-status-section">
          <div 
            className="invoice-status-badge"
            style={{ 
              background: `${getStatusColor(order.order_status)}15`,
              color: getStatusColor(order.order_status),
              borderColor: getStatusColor(order.order_status)
            }}
          >
            <CheckCircle className="w-5 h-5" />
            <span>{order.order_status.toUpperCase()}</span>
          </div>
          
          {/* ✅ Savings Badge */}
          {totalSavings > 0 && (
            <div 
              className="invoice-savings-badge"
              style={{ 
                background: '#dcfce715',
                color: '#16a34a',
                borderColor: '#16a34a'
              }}
            >
              <TrendingDown className="w-5 h-5" />
              <span>You saved ₹{totalSavings.toFixed(2)}</span>
            </div>
          )}
        </div>

        {/* Order Info Grid */}
        <div className="invoice-info-grid">
          <div className="invoice-info-section">
            <h3>Order Information</h3>
            <div className="invoice-info-row">
              <span className="invoice-info-label">Order Date:</span>
              <span className="invoice-info-value">
                {formatDate(order.ordered_at || order.created_at)}
              </span>
            </div>
            <div className="invoice-info-row">
              <span className="invoice-info-label">Order Number:</span>
              <span className="invoice-info-value">{order.order_number}</span>
            </div>
            <div className="invoice-info-row">
              <span className="invoice-info-label">Payment Method:</span>
              <span className="invoice-info-value">{order.payment_method}</span>
            </div>
            <div className="invoice-info-row">
              <span className="invoice-info-label">Payment Status:</span>
              <span className="invoice-info-value">{order.payment_status}</span>
            </div>
            {order.queue?.token_number && (
              <div className="invoice-info-row">
                <span className="invoice-info-label">Token Number:</span>
                <span className="invoice-info-value" style={{ 
                  fontFamily: 'monospace',
                  fontWeight: '700',
                  color: '#667eea'
                }}>
                  {order.queue.token_number}
                </span>
              </div>
            )}
          </div>

          <div className="invoice-info-section">
            <h3>Store Information</h3>
            <div className="invoice-store-details">
              <p className="invoice-store-name">{order.stores?.store_name}</p>
              <p className="invoice-store-address">
                <MapPin className="w-4 h-4" />
                {order.stores?.address}
              </p>
              <p className="invoice-store-city">{order.stores?.city}</p>
              {order.stores?.phone && (
                <p className="invoice-store-phone">
                  📞 {order.stores.phone}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Items Table - ENHANCED */}
        <div className="invoice-items-section">
          <h3>Order Items</h3>
          <table className="invoice-items-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Details</th>
                <th>MRP</th>
                <th>Price</th>
                <th>Qty</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {order.items?.map((item, idx) => {
                const mrp = item.metadata?.mrp;
                const savingsPercent = calculateSavings(mrp, item.price);
                const itemTags = item.metadata?.tags || [];
                const itemSize = getProductSize(item);
                const imageUrl = getProductImageUrl(item);
                
                return (
                  <tr key={idx}>
                    <td>
                      <div className="invoice-item-name">
                        {/* ✅ PRODUCT IMAGE */}
                        <div style={{ 
                          width: '50px', 
                          height: '50px',
                          flexShrink: 0,
                          marginRight: '0.75rem'
                        }}>
                          <ProductImage
                            src={imageUrl}
                            fallback={item.image || getCategoryEmoji(item.category)}
                            alt={item.name}
                            category={item.category}
                            size="medium"
                          />
                        </div>
                        
                        <div>
                          <div className="invoice-item-title">{item.name}</div>
                          <div className="invoice-item-category">{item.category || 'General'}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="invoice-item-details">
                        {/* ✅ SIZE - PROMINENTLY DISPLAYED */}
                        {itemSize && (
                          <div className="invoice-item-size-badge">
                            📏 Size: <strong>{itemSize}</strong>
                          </div>
                        )}
                        
                        {/* Brand */}
                        {item.metadata?.brand && (
                          <div className="invoice-item-brand">
                            🏷️ {item.metadata.brand}
                          </div>
                        )}
                        
                        {/* Weight/Volume */}
                        {item.metadata?.weight && (
                          <div className="invoice-item-weight">
                            ⚖️ {item.metadata.weight}
                          </div>
                        )}
                        
                        {/* Tags */}
                        {itemTags.length > 0 && (
                          <div className="invoice-item-tags">
                            {itemTags.slice(0, 2).map((tag, i) => (
                              <span key={i} className="invoice-item-tag">
                                <Tag className="w-3 h-3" />
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                    <td>
                      {mrp ? (
                        <div className="invoice-item-mrp">
                          ₹{mrp.toFixed(2)}
                        </div>
                      ) : (
                        <span style={{ color: '#9ca3af' }}>-</span>
                      )}
                    </td>
                    <td>
                      <div className="invoice-item-price-container">
                        <div className="invoice-item-price">₹{item.price.toFixed(2)}</div>
                        {savingsPercent && (
                          <div className="invoice-item-discount">
                            {savingsPercent}% OFF
                          </div>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="invoice-item-qty">{item.quantity}</div>
                    </td>
                    <td>
                      <div className="invoice-item-total-container">
                        <div className="invoice-item-total-price">
                          ₹{(item.price * item.quantity).toFixed(2)}
                        </div>
                        {mrp && mrp > item.price && (
                          <div className="invoice-item-total-savings">
                            Saved ₹{((mrp - item.price) * item.quantity).toFixed(2)}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Totals Section */}
        <div className="invoice-totals-section">
          <div className="invoice-totals">
            <div className="invoice-total-row">
              <span>Subtotal:</span>
              <span>₹{order.subtotal?.toFixed(2)}</span>
            </div>
            
            {/* Total savings */}
            {totalSavings > 0 && (
              <div className="invoice-total-row savings">
                <span>
                  <TrendingDown className="w-4 h-4" style={{ display: 'inline', marginRight: '0.5rem' }} />
                  Total Savings:
                </span>
                <span>₹{totalSavings.toFixed(2)}</span>
              </div>
            )}
            
            {order.discount > 0 && (
              <div className="invoice-total-row discount">
                <span>Discount:</span>
                <span>-₹{order.discount?.toFixed(2)}</span>
              </div>
            )}
            <div className="invoice-total-row">
              <span>Tax:</span>
              <span>₹{order.tax?.toFixed(2)}</span>
            </div>
            <div className="invoice-total-row grand-total">
              <span>Grand Total:</span>
              <span>₹{order.total_amount?.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Timeline Section */}
        {(order.confirmed_at || order.completed_at || order.cancelled_at) && (
          <div className="invoice-timeline-section">
            <h3>Order Timeline</h3>
            <div className="invoice-timeline">
              <div className="timeline-item">
                <Clock className="w-4 h-4" />
                <div>
                  <p className="timeline-label">Order Placed</p>
                  <p className="timeline-date">{formatDate(order.ordered_at || order.created_at)}</p>
                </div>
              </div>
              {order.confirmed_at && (
                <div className="timeline-item">
                  <CheckCircle className="w-4 h-4" />
                  <div>
                    <p className="timeline-label">Order Confirmed</p>
                    <p className="timeline-date">{formatDate(order.confirmed_at)}</p>
                  </div>
                </div>
              )}
              {order.completed_at && (
                <div className="timeline-item">
                  <Package className="w-4 h-4" />
                  <div>
                    <p className="timeline-label">Order Completed</p>
                    <p className="timeline-date">{formatDate(order.completed_at)}</p>
                  </div>
                </div>
              )}
              {order.cancelled_at && (
                <div className="timeline-item cancelled">
                  <div>
                    <p className="timeline-label">Order Cancelled</p>
                    <p className="timeline-date">{formatDate(order.cancelled_at)}</p>
                    {order.cancellation_reason && (
                      <p className="timeline-reason">{order.cancellation_reason}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Notes Section */}
        {(order.customer_notes || order.store_notes) && (
          <div className="invoice-notes-section">
            <h3>Notes</h3>
            {order.customer_notes && (
              <div className="invoice-note">
                <p className="note-label">Customer Notes:</p>
                <p className="note-text">{order.customer_notes}</p>
              </div>
            )}
            {order.store_notes && (
              <div className="invoice-note">
                <p className="note-label">Store Notes:</p>
                <p className="note-text">{order.store_notes}</p>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="invoice-footer">
          <p>Thank you for your order!</p>
          <p className="invoice-footer-small">
            This is a computer-generated invoice. For any queries, please contact the store.
          </p>
          {totalSavings > 0 && (
            <div className="invoice-footer-savings">
              🎉 You saved a total of ₹{totalSavings.toFixed(2)} on this order!
            </div>
          )}
        </div>
      </div>
    </div>
  );
}