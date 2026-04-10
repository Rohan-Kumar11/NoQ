// app/buyer/cart/page.js
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  ShoppingCart, Plus, Minus, Trash2, MapPin,
  Home, ArrowRight, Loader2
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import {
  getCartItemsGroupedByStore,
  updateCartItemQuantity,
  removeFromCart,
  clearStoreCart
} from '@/lib/api/cart';
import ProductImage from '@/app/components/ProductImage';
import { formatPrice, formatItemTotal } from '@/lib/utils/productHelpers';
import toast from 'react-hot-toast';
import BuyerNavbar from '@/app/components/BuyerNavbar';
import './Cart.css';

// ─────────────────────────────────────────────────────────────────────────────
// StoreAvatar
// ─────────────────────────────────────────────────────────────────────────────
function StoreAvatar({ logoUrl, storeName }) {
  const [imgError, setImgError] = useState(false);

  if (logoUrl && !imgError) {
    return (
      <div className="cart-store-avatar">
        <img
          src={logoUrl}
          alt={`${storeName} logo`}
          className="cart-store-avatar-img"
          onError={() => setImgError(true)}
        />
      </div>
    );
  }

  return (
    <div className="cart-store-avatar cart-store-avatar-fallback">🏪</div>
  );
}

export default function CartPage() {
  const router = useRouter();

  const [currentUser, setCurrentUser]       = useState(null);
  const [cartData, setCartData]             = useState(null);
  const [loading, setLoading]               = useState(true);
  const [processingItems, setProcessingItems] = useState(new Set());
  const [storeLogos, setStoreLogos]         = useState({});

  // ── init user ─────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setCurrentUser(user);
    })();
  }, []);

  // ── load cart ─────────────────────────────────────────────────────────────
  useEffect(() => { loadCartData(); }, []);

  // ── fetch store logos after cart loads ────────────────────────────────────
  useEffect(() => {
    if (!cartData?.stores?.length) return;
    const storeIds = cartData.stores.map(s => s.storeId);
    supabase
      .from('stores')
      .select('id, logo_url')
      .in('id', storeIds)
      .then(({ data, error }) => {
        if (!error && data) {
          const map = {};
          data.forEach(row => { if (row.logo_url) map[row.id] = row.logo_url; });
          setStoreLogos(map);
        }
      });
  }, [cartData]);

  const loadCartData = async () => {
    setLoading(true);
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) {
        toast.error('Please login to view your cart');
        router.push('/auth/signin');
        return;
      }
      setCurrentUser(user);
      const { data, error } = await getCartItemsGroupedByStore(user.id);
      if (error) {
        console.error('Cart load error:', error);
        toast.error('Failed to load cart');
      } else {
        setCartData(data);
      }
    } catch (error) {
      console.error('Error loading cart:', error);
      toast.error('Failed to load cart data');
    } finally {
      setLoading(false);
    }
  };

  const updateQuantity = async (cartItemId, currentQuantity, delta, maxStock) => {
    const newQuantity = currentQuantity + delta;
    if (newQuantity < 1)        { toast.error('Quantity cannot be less than 1'); return; }
    if (newQuantity > maxStock) { toast.error(`Only ${maxStock} items available in stock`); return; }
    setProcessingItems(prev => new Set(prev).add(cartItemId));
    try {
      const { error } = await updateCartItemQuantity(cartItemId, newQuantity);
      if (error) throw new Error(error);
      await loadCartData();
    } catch (error) {
      console.error('Error updating quantity:', error);
      toast.error('Failed to update quantity');
    } finally {
      setProcessingItems(prev => { const s = new Set(prev); s.delete(cartItemId); return s; });
    }
  };

  const removeItem = async (cartItemId, productName) => {
    if (!confirm(`Remove "${productName}" from cart?`)) return;
    setProcessingItems(prev => new Set(prev).add(cartItemId));
    try {
      const { error } = await removeFromCart(cartItemId);
      if (error) throw new Error(error);
      toast.success('Item removed from cart');
      await loadCartData();
    } catch (error) {
      console.error('Error removing item:', error);
      toast.error('Failed to remove item');
    } finally {
      setProcessingItems(prev => { const s = new Set(prev); s.delete(cartItemId); return s; });
    }
  };

  const handleClearStoreCart = async (storeId, storeName) => {
    if (!confirm(`Remove all items from ${storeName}?`)) return;
    try {
      const { error } = await clearStoreCart(currentUser.id, storeId);
      if (error) throw new Error(error);
      toast.success(`Cleared ${storeName} cart`);
      await loadCartData();
    } catch (error) {
      console.error('Error clearing store cart:', error);
      toast.error('Failed to clear cart');
    }
  };

  const proceedToCheckout = (storeGroup) => {
    if (!storeGroup.isOpen)        { toast.error('This store is currently closed'); return; }
    if (!storeGroup.items.length)  { toast.error('No items to checkout'); return; }
    router.push(`/buyer/checkout/${storeGroup.storeId}`);
  };

  const calculateStoreTotal = (items) =>
    items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const calculateCartTotal = () =>
    cartData?.stores?.reduce((total, store) => total + calculateStoreTotal(store.items), 0) || 0;

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="buyer-home-container">
        <BuyerNavbar />
        <div className="buyer-home-loading-state">
          <Loader2 className="buyer-home-loading-spinner" />
          <p>Loading your cart...</p>
        </div>
      </div>
    );
  }

  // ── Empty cart ────────────────────────────────────────────────────────────
  if (!cartData?.stores?.length) {
    return (
      <div className="buyer-home-container">
        <BuyerNavbar />
        <div className="cart-empty-container">
          <div className="cart-empty-content">
            <div className="cart-empty-icon">🛒</div>
            <h1 className="cart-empty-title">Your Cart is Empty</h1>
            <p className="cart-empty-description">
              Looks like you haven't added anything to your cart yet.
              Start exploring stores and add your favorite items!
            </p>
            <button onClick={() => router.push('/buyer')} className="cart-empty-cta">
              <Home className="w-5 h-5" />
              Browse Stores
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Main cart ─────────────────────────────────────────────────────────────
  return (
    <div className="buyer-home-container">
      <BuyerNavbar />

      <div className="buyer-home-main-content">
        <div className="buyer-home-hero-section">
          <h1 className="buyer-home-hero-title">
            Your <span className="buyer-home-hero-title-gradient">Shopping Cart</span>
          </h1>
          <p className="buyer-home-hero-subtitle">
            {cartData.totalItems} {cartData.totalItems === 1 ? 'item' : 'items'} from{' '}
            {cartData.stores.length} {cartData.stores.length === 1 ? 'store' : 'stores'}
          </p>
        </div>

        <div className="cart-stores-container">
          {cartData.stores.map((storeGroup) => {
            const storeTotal = calculateStoreTotal(storeGroup.items);
            const logoUrl = storeGroup.logo_url || storeLogos[storeGroup.storeId] || null;

            return (
              <div key={storeGroup.storeId} className="cart-store-section">
                <div className="cart-store-header">
                  <div className="cart-store-info">
                    <StoreAvatar logoUrl={logoUrl} storeName={storeGroup.storeName} />
                    <div>
                      <h2 className="cart-store-name">{storeGroup.storeName}</h2>
                      <div className="cart-store-meta">
                        <span className="cart-store-type">{storeGroup.storeType}</span>
                        <span>•</span>
                        <span className={`cart-store-status ${storeGroup.isOpen ? 'open' : 'closed'}`}>
                          {storeGroup.isOpen ? '🟢 Open' : '🔴 Closed'}
                        </span>
                        {storeGroup.storeAddress && (
                          <>
                            <span>•</span>
                            <span className="cart-store-address">
                              <MapPin className="w-4 h-4" />
                              {storeGroup.storeCity}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleClearStoreCart(storeGroup.storeId, storeGroup.storeName)}
                    className="cart-store-clear-btn"
                  >
                    Clear Store Cart
                  </button>
                </div>

                <div className="cart-items-list">
                  {storeGroup.items.map((item) => {
                    const isProcessing  = processingItems.has(item.cartItemId);
                    const imageUrl      = item.image_url || item.product?.image_url || item.product_metadata?.image_url || item.metadata?.image_url || null;
                    const emoji         = item.image || item.product?.image || '📦';
                    const productName   = item.name || item.product_name;
                    const productCategory = item.category || item.product_category;
                    const size          = item.metadata?.selectedSize || item.selectedSize || null;
                    const displayName   = size ? `${productName} (${size})` : productName;

                    return (
                      <div key={item.cartItemId} className={`cart-item-card ${isProcessing ? 'processing' : ''}`}>
                        <div className="cart-item-image-wrapper">
                          <ProductImage src={imageUrl} fallback={emoji} alt={productName} category={productCategory} size="medium" />
                        </div>

                        <div className="cart-item-info">
                          <h3 className="cart-item-name">{displayName}</h3>
                          <p className="cart-item-category">{productCategory}</p>
                          <p className="cart-item-price">{formatPrice(item.price)}</p>
                          {item.stock <= 10 && item.stock > 0 && (
                            <p className="cart-item-stock-warning">Only {item.stock} left!</p>
                          )}
                          {item.stock === 0 && (
                            <p className="cart-item-out-of-stock">Out of stock</p>
                          )}
                        </div>

                        <div className="cart-item-quantity">
                          <button
                            onClick={() => updateQuantity(item.cartItemId, item.quantity, -1, item.stock)}
                            className="cart-qty-btn"
                            disabled={isProcessing || item.quantity <= 1}
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                          <span className="cart-qty-display">{item.quantity}</span>
                          <button
                            onClick={() => updateQuantity(item.cartItemId, item.quantity, 1, item.stock)}
                            className="cart-qty-btn"
                            disabled={isProcessing || item.quantity >= item.stock}
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="cart-item-total">
                          <p className="cart-item-total-price">{formatItemTotal(item.price, item.quantity)}</p>
                        </div>

                        <button
                          onClick={() => removeItem(item.cartItemId, displayName)}
                          className="cart-item-remove"
                          disabled={isProcessing}
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    );
                  })}
                </div>

                <div className="cart-store-summary">
                  <div className="cart-store-summary-row">
                    <span>Subtotal ({storeGroup.items.length} {storeGroup.items.length === 1 ? 'item' : 'items'})</span>
                    <span className="cart-store-summary-amount">{formatPrice(storeTotal)}</span>
                  </div>
                  <button
                    onClick={() => proceedToCheckout(storeGroup)}
                    className={`cart-store-checkout-btn ${!storeGroup.isOpen ? 'disabled' : ''}`}
                    disabled={!storeGroup.isOpen}
                  >
                    {storeGroup.isOpen
                      ? <> Checkout from {storeGroup.storeName} <ArrowRight className="w-5 h-5" /> </>
                      : 'Store Closed'
                    }
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="cart-overall-summary">
          <div className="cart-overall-summary-content">
            <h3 className="cart-overall-summary-title">Cart Total</h3>
            <div className="cart-overall-summary-row">
              <span>Total Items</span>
              <span>{cartData.totalItems}</span>
            </div>
            <div className="cart-overall-summary-row">
              <span>Total Stores</span>
              <span>{cartData.stores.length}</span>
            </div>
            <div className="cart-overall-summary-divider" />
            <div className="cart-overall-summary-total">
              <span>Grand Total</span>
              <span>{formatPrice(calculateCartTotal())}</span>
            </div>
            <p className="cart-overall-summary-note">
              💡 You'll checkout from each store separately to ensure smooth order processing
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}