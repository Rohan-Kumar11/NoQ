'use client';

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { ShoppingCart, Plus, Minus, ChevronLeft, Loader2, X, ChevronRight, Calendar } from 'lucide-react';
import { useRouter, useParams } from 'next/navigation';
import { fetchStoreById, trackStoreVisit } from '@/lib/api/stores';
import { fetchStoreProducts } from '@/lib/api/products';
import {
  addToCart as addToCartAPI,
  updateCartItemQuantity,
  removeFromCart as removeFromCartAPI,
  getCartItemsGroupedByStore,
} from '@/lib/api/cart';

import { getQueueStats } from '@/lib/api/queue';
import { getServiceMode, getStoreServices } from '@/lib/api/appointments';
import { supabase } from '@/lib/supabase/client';
import { getCategoryConfig } from '@/lib/categoryConfig';
import toast from 'react-hot-toast';
import ProductImage from '../../../components/ProductImage';
import './StoreProducts.css';
import './StoreProducts.mobile.css';

// ─────────────────────────────────────────────────────────────────────────────
// UI helpers
// ─────────────────────────────────────────────────────────────────────────────

function RealtimePill({ status }) {
  const cfg = {
    connecting: { dot: '#f59e0b', label: 'Connecting…' },
    live:       { dot: '#10b981', label: '● Live'       },
    polling:    { dot: '#3b82f6', label: '↻ Updating'   },
    error:      { dot: '#ef4444', label: 'Reconnecting' },
  }[status] ?? { dot: '#f59e0b', label: 'Connecting…' };

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
      fontSize: '0.75rem', fontWeight: 700, color: cfg.dot,
      background: `${cfg.dot}18`, border: `1px solid ${cfg.dot}40`,
      borderRadius: '999px', padding: '0.2rem 0.6rem',
    }}>
      <span style={{
        width: 7, height: 7, borderRadius: '50%', background: cfg.dot,
        boxShadow: status === 'live' ? `0 0 5px ${cfg.dot}` : 'none',
      }} />
      {cfg.label}
    </span>
  );
}

function LiveStatCard({ icon, value, label, color }) {
  const [flash, setFlash] = useState(false);
  const prev = useRef(value);

  useEffect(() => {
    if (String(prev.current) !== String(value)) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 700);
      prev.current = value;
      return () => clearTimeout(t);
    }
  }, [value]);

  return (
    <div
      className="store-products-stat-card"
      style={{
        borderTop: `4px solid ${color}`,
        position: 'relative',
        background: flash ? `${color}14` : '',
        transition: 'background 0.5s ease',
      }}
    >
      <span style={{
        position: 'absolute', top: 8, right: 10,
        width: 7, height: 7, borderRadius: '50%',
        background: '#10b981', boxShadow: '0 0 6px #10b981',
        animation: 'livePulse 2s infinite',
      }} />
      <div className="store-products-stat-icon" style={{ background: `${color}15`, color }}>
        {icon}
      </div>
      <div
        className="store-products-stat-value"
        style={{
          transition: 'transform 0.25s ease, color 0.25s ease',
          transform: flash ? 'scale(1.18)' : 'scale(1)',
          color: flash ? color : '',
        }}
      >
        {value}
      </div>
      <div className="store-products-stat-label">{label}</div>
    </div>
  );
}

// ── Appointment CTA Banner ───────────────────────────────────
function AppointmentBanner({ storeId, config, services }) {
  const router = useRouter();
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '1rem',
      background: `linear-gradient(135deg, ${config.color}15, ${config.color}08)`,
      border: `1.5px solid ${config.color}30`,
      borderRadius: '16px',
      padding: '1rem 1.25rem',
      margin: '0 0 1rem 0',
      flexWrap: 'wrap',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: 0 }}>
        <div style={{
          width: 44, height: 44, borderRadius: '12px',
          background: `${config.color}20`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Calendar size={22} color={config.color} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--color-text-primary)' }}>
            Book an Appointment
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', marginTop: 2 }}>
            {services?.length > 0
              ? `${services.length} service${services.length > 1 ? 's' : ''} available — choose a time slot that works for you`
              : 'Choose a time slot that works for you'}
          </div>
        </div>
      </div>
      <button
        onClick={() => router.push(`/buyer/appointments/${storeId}`)}
        style={{
          padding: '0.6rem 1.25rem',
          background: config.gradient || config.color,
          color: '#fff',
          border: 'none',
          borderRadius: '10px',
          fontSize: '0.88rem',
          fontWeight: 700,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '0.4rem',
          whiteSpace: 'nowrap',
          flexShrink: 0,
          fontFamily: 'inherit',
          transition: 'opacity 0.15s',
        }}
        onMouseEnter={e => e.currentTarget.style.opacity = '0.88'}
        onMouseLeave={e => e.currentTarget.style.opacity = '1'}
      >
        <Calendar size={16} />
        Book Now
      </button>
    </div>
  );
}

// ── Services list (for labs / no-products mode) ──────────────
function ServicesList({ services, config, storeId }) {
  const router = useRouter();
  if (!services || services.length === 0) return null;

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem',
      }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--color-text-primary)' }}>
          🧪 Available Tests &amp; Services
        </h2>
        <button
          onClick={() => router.push(`/buyer/appointments/${storeId}`)}
          style={{
            padding: '0.45rem 1rem',
            background: config.gradient || config.color,
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            fontSize: '0.82rem',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.35rem',
            fontFamily: 'inherit',
          }}
        >
          <Calendar size={14} />
          Book Appointment
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        {services.map(svc => (
          <div
            key={svc.id}
            style={{
              background: 'var(--color-background-primary)',
              border: `1px solid var(--color-border-tertiary)`,
              borderRadius: '12px',
              padding: '0.9rem 1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
              cursor: 'pointer',
              transition: 'box-shadow 0.15s, border-color 0.15s',
            }}
            onClick={() => router.push(`/buyer/appointments/${storeId}?service=${svc.id}`)}
            onMouseEnter={e => {
              e.currentTarget.style.boxShadow = `0 2px 12px ${config.color}20`;
              e.currentTarget.style.borderColor = `${config.color}40`;
            }}
            onMouseLeave={e => {
              e.currentTarget.style.boxShadow = '';
              e.currentTarget.style.borderColor = '';
            }}
          >
            <div style={{
              width: 40, height: 40, borderRadius: '10px',
              background: `${config.color}15`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.2rem', flexShrink: 0,
            }}>
              🧪
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--color-text-primary)' }}>
                {svc.name}
              </div>
              {svc.description && (
                <div style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', marginTop: 2 }}>
                  {svc.description}
                </div>
              )}
              {svc.duration_minutes && (
                <div style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', marginTop: 2 }}>
                  ⏱ {svc.duration_minutes} min
                </div>
              )}
            </div>
            {svc.price && (
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontWeight: 700, fontSize: '1rem', color: config.color }}>
                  ₹{svc.price}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────
export default function StoreProducts() {
  const router  = useRouter();
  const params  = useParams();
  const storeId = params.id;

  const [store, setStore]                     = useState(null);
  const [config, setConfig]                   = useState(null);
  const [loading, setLoading]                 = useState(true);
  const [realtimeStatus, setRealtimeStatus]   = useState('connecting');

  const [products, setProducts]               = useState([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [searchQuery, setSearchQuery]         = useState('');
  const [selectedSizes, setSelectedSizes]     = useState({});

  const [currentGalleryIndex, setCurrentGalleryIndex] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying]             = useState(true);
  const [showGalleryModal, setShowGalleryModal]       = useState(false);

  const [cart, setCart]               = useState([]);
  const [cartItemMap, setCartItemMap] = useState({});
  const [currentUser, setCurrentUser] = useState(null);

  const [totalInQueue, setTotalInQueue] = useState(0);

  // ── Service mode ──────────────────────────────────────────────
  const [serviceMode, setServiceMode] = useState(null);
  const [storeServices, setStoreServices] = useState([]);

  const visitTracked = useRef(false);

  const avgWaitTime = useMemo(() => {
    if (!store) return 0;
    return store.avg_service_time ?? store.estimated_service_time ?? 15;
  }, [store]);

  // Derived from service mode
  const showProducts     = !serviceMode || serviceMode.has_products !== false;
  const showAppointment  = serviceMode?.appointment_enabled === true;
  const showQueue        = !serviceMode || serviceMode.queue_enabled !== false;

  const refreshQueueStats = useCallback(async (sid) => {
    const id = sid ?? storeId;
    if (!id) return;
    try {
      const { data: stats, error } = await getQueueStats(id);
      if (error) { console.error('getQueueStats error:', error); return; }
      if (stats?.totalInQueue != null) setTotalInQueue(stats.totalInQueue);
    } catch (err) {
      console.error('refreshQueueStats threw:', err);
    }
  }, [storeId]);

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (storeId) loadUserAndStore();
  }, [storeId]);

  useEffect(() => {
    if (storeId) loadProducts();
  }, [storeId]);

  useEffect(() => {
    if (currentUser && storeId) loadExistingCart();
  }, [currentUser, storeId]);

  useEffect(() => {
    const imgs = store?.metadata?.gallery || [];
    if (!isAutoPlaying || imgs.length <= 1) return;
    const id = setInterval(() => {
      setCurrentGalleryIndex(p => (p === imgs.length - 1 ? 0 : p + 1));
    }, 3000);
    return () => clearInterval(id);
  }, [isAutoPlaying, store, currentGalleryIndex]);

  // ── REALTIME: queue ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!storeId) return;
    let pollInterval = null;
    const startPolling = () => {
      if (pollInterval) return;
      setRealtimeStatus('polling');
      pollInterval = setInterval(() => refreshQueueStats(), 30_000);
    };
    const stopPolling = () => {
      if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
    };
    const qCh = supabase
      .channel(`buyer-queue-${storeId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'queue', filter: `store_id=eq.${storeId}` },
        () => refreshQueueStats()
      )
      .subscribe(s => {
        if (s === 'SUBSCRIBED') { setRealtimeStatus('live'); stopPolling(); }
        if (s === 'TIMED_OUT' || s === 'CHANNEL_ERROR') { startPolling(); refreshQueueStats(); }
        if (s === 'CLOSED') setRealtimeStatus('connecting');
      });
    return () => { stopPolling(); supabase.removeChannel(qCh); };
  }, [storeId, refreshQueueStats]);

  // ── REALTIME: products ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!storeId) return;
    const ch = supabase
      .channel(`buyer-products-${storeId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'products', filter: `store_id=eq.${storeId}` },
        ({ eventType, new: newRow, old: oldRow }) => {
          setProducts(prev => {
            switch (eventType) {
              case 'INSERT':
                if (newRow.is_active && newRow.status === 'available') {
                  toast.success(`🆕 "${newRow.name}" is now available!`, { duration: 3000 });
                  return [newRow, ...prev];
                }
                return prev;
              case 'UPDATE':
                if (!newRow.is_active) {
                  toast(`"${newRow.name}" is no longer available`, { duration: 3000, style: { background: '#fee2e2', color: '#991b1b' } });
                  return prev.filter(p => p.id !== newRow.id);
                }
                if (newRow.status === 'unavailable' && oldRow?.status !== 'unavailable') {
                  toast(`❌ "${newRow.name}" is now unavailable`, { duration: 3000, style: { background: '#fee2e2', color: '#991b1b' } });
                  return prev.map(p => p.id === newRow.id ? { ...p, ...newRow } : p);
                }
                if (newRow.status === 'available' && oldRow?.status === 'unavailable') {
                  toast.success(`✅ "${newRow.name}" is available again!`, { duration: 3000 });
                  if (!prev.find(p => p.id === newRow.id) && newRow.is_active) {
                    return [newRow, ...prev];
                  }
                }
                if (oldRow && newRow.stock !== oldRow.stock) {
                  if (newRow.stock === 0) {
                    toast(`⚠️ "${newRow.name}" just sold out!`, { duration: 4000, style: { background: '#fef3c7', color: '#92400e' } });
                  } else if (newRow.stock <= 5 && newRow.stock > 0 && oldRow.stock > 5) {
                    toast(`🔥 Only ${newRow.stock} left for "${newRow.name}"!`, { duration: 3000, style: { background: '#fff7ed', color: '#c2410c' } });
                  }
                }
                return prev.map(p => p.id === newRow.id ? { ...p, ...newRow } : p);
              case 'DELETE':
                toast(`"${oldRow.name}" has been removed`, { duration: 3000, style: { background: '#fee2e2', color: '#991b1b' } });
                return prev.filter(p => p.id !== oldRow.id);
              default: return prev;
            }
          });
        }
      )
      .subscribe(s => {
        if (s === 'SUBSCRIBED') setRealtimeStatus(prev => prev === 'polling' ? 'polling' : 'live');
        if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') setRealtimeStatus('error');
      });
    return () => supabase.removeChannel(ch);
  }, [storeId]);

  // ── Data loaders ───────────────────────────────────────────────────────────
  const loadUserAndStore = async () => {
    setLoading(true);
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) { toast.error('Please login to continue'); router.push('/auth/signin'); return; }
      setCurrentUser(user);
      if (!storeId) return;

      const [storeRes, serviceModeRes, servicesRes] = await Promise.all([
        fetchStoreById(storeId),
        getServiceMode(storeId),
        getStoreServices(storeId),
      ]);

      if (storeRes.data) {
        setStore(storeRes.data);
        let normalizedType = (storeRes.data.store_type || 'retail').toLowerCase().trim();
        if (normalizedType === 'cafe') normalizedType = 'café';
        setConfig(getCategoryConfig(normalizedType));
      }

      if (serviceModeRes?.data) setServiceMode(serviceModeRes.data);
      if (servicesRes?.data)    setStoreServices(servicesRes.data);

      if (!visitTracked.current) {
        visitTracked.current = true;
        trackStoreVisit(storeId, user?.id ?? null);
      }

      await refreshQueueStats(storeId);
    } catch (err) {
      console.error('loadUserAndStore error:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadProducts = async () => {
    setProductsLoading(true);
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('store_id', storeId)
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      if (!error) setProducts(data || []);
      else console.error('loadProducts error:', error);
    } catch (err) {
      console.error('loadProducts error:', err);
    } finally {
      setProductsLoading(false);
    }
  };

  const loadExistingCart = async () => {
    try {
      const { data, error } = await getCartItemsGroupedByStore(currentUser.id);
      if (error) { console.error('Cart load error:', error); return; }
      const storeCart = data?.stores?.find(s => s.storeId === storeId);
      if (storeCart?.items) {
        const itemMap = {};
        const cartItems = [];
        storeCart.items.forEach(item => {
          const size = item.metadata?.selectedSize ?? item.selectedSize ?? item.product_metadata?.selectedSize ?? null;
          const key  = size ? `${item.product_id}-${size}` : item.product_id;
          const cid  = item.cartItemId ?? item.id;
          itemMap[key] = cid;
          cartItems.push({
            id: item.product_id,
            name: item.name ?? item.product_name,
            price: item.price ?? item.product_price,
            image: item.image ?? item.product_image,
            image_url: item.image_url,
            category: item.category ?? item.product_category,
            quantity: item.quantity,
            selectedSize: size,
            cartItemId: cid,
          });
        });
        setCartItemMap(itemMap);
        setCart(cartItems);
      } else {
        setCartItemMap({});
        setCart([]);
      }
    } catch (err) {
      console.error('loadExistingCart error:', err);
    }
  };

  // ── Product helpers ────────────────────────────────────────────────────────
  const getProductVariants = p =>
    p.metadata?.hasVariants && p.metadata?.variants ? p.metadata.variants : null;

  const getProductPrice = p => {
    const v = getProductVariants(p);
    if (!v) return p.price;
    const sel = selectedSizes[p.id];
    return sel ? (v.find(x => x.size === sel)?.price ?? p.price) : null;
  };

  const getProductStock = p => {
    const v = getProductVariants(p);
    if (!v) return p.stock;
    const sel = selectedSizes[p.id];
    return sel ? (v.find(x => x.size === sel)?.stock ?? 0) : null;
  };

  const getQuantityInCart = (pid, size = null) =>
    cart.filter(i => size ? i.id === pid && i.selectedSize === size : i.id === pid)
        .reduce((s, i) => s + i.quantity, 0);

  // ── Cart actions ───────────────────────────────────────────────────────────
  const addToCart = async product => {
    if (!currentUser) { toast.error('Please login to add items to cart'); router.push('/auth/signin'); return; }
    const variants = getProductVariants(product);
    if (variants && !selectedSizes[product.id]) { toast.error('Please select a size first'); return; }

    const selectedSize = selectedSizes[product.id];
    const price = getProductPrice(product);
    const stock = getProductStock(product);

    if ((stock ?? 0) === 0 || product.status !== 'available') { toast.error('Product is not available'); return; }

    const cartKey  = selectedSize ? `${product.id}-${selectedSize}` : product.id;
    const existId  = cartItemMap[cartKey];
    const existing = cart.find(i => variants
      ? i.id === product.id && i.selectedSize === selectedSize
      : i.id === product.id);

    try {
      if (existing && existId) {
        const qty = Math.min(existing.quantity + 1, stock);
        const { error } = await updateCartItemQuantity(existId, qty);
        if (error) throw new Error(error);
        setCart(cart.map(i =>
          (variants ? i.id === product.id && i.selectedSize === selectedSize : i.id === product.id)
            ? { ...i, quantity: qty } : i));
        toast.success(`Updated ${product.name}${selectedSize ? ` (${selectedSize})` : ''} quantity`);
      } else {
        const { data, error } = await addToCartAPI({
          userId: currentUser.id, storeId, productId: product.id,
          product: { name: product.name, price, image: product.image, image_url: product.image_url, category: product.category, selectedSize: selectedSize || null },
          quantity: 1,
        });
        if (error) throw new Error(error);
        const newId = data?.cartItemId ?? data?.id;
        if (newId) setCartItemMap(prev => ({ ...prev, [cartKey]: newId }));
        setCart([...cart, { ...product, quantity: 1, selectedSize, price, cartItemId: newId }]);
        toast.success(`${product.name}${selectedSize ? ` (${selectedSize})` : ''} added to cart!`);
      }
    } catch (err) {
      console.error('addToCart error:', err);
      toast.error('Failed to add item to cart');
    }
  };

  const removeFromCart = async (productId, selectedSize = null) => {
    const cartKey    = selectedSize ? `${productId}-${selectedSize}` : productId;
    const cartItemId = cartItemMap[cartKey];
    if (!cartItemId) { toast.error('Error: Cannot remove item (missing ID)'); return; }
    const existing = cart.find(i =>
      selectedSize ? i.id === productId && i.selectedSize === selectedSize : i.id === productId);
    if (!existing) return;

    try {
      if (existing.quantity === 1) {
        const { error } = await removeFromCartAPI(cartItemId);
        if (error) throw new Error(error);
        setCart(cart.filter(i =>
          selectedSize ? !(i.id === productId && i.selectedSize === selectedSize) : i.id !== productId));
        setCartItemMap(prev => { const m = { ...prev }; delete m[cartKey]; return m; });
        toast.success('Item removed from cart');
      } else {
        const qty = existing.quantity - 1;
        const { error } = await updateCartItemQuantity(cartItemId, qty);
        if (error) throw new Error(error);
        setCart(cart.map(i =>
          (selectedSize ? i.id === productId && i.selectedSize === selectedSize : i.id === productId)
            ? { ...i, quantity: qty } : i));
        toast.success('Quantity updated');
      }
    } catch (err) {
      console.error('removeFromCart error:', err);
      toast.error('Failed to update cart');
    }
  };

  // ── Derived ────────────────────────────────────────────────────────────────
  const filteredProducts = useMemo(
    () => products.filter(p => p.name?.toLowerCase().includes(searchQuery.toLowerCase())),
    [products, searchQuery],
  );
  const cartTotal      = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const cartItemCount  = cart.reduce((s, i) => s + i.quantity, 0);
  const galleryImages  = store?.metadata?.gallery || [];
  const totalItems     = products.length;
  const availableItems = products.filter(p => p.status === 'available').length;

  // ── Render guards ──────────────────────────────────────────────────────────
  if (loading || !config) {
    return (
      <div className="store-products-container">
        <header className="store-products-header">
          <div className="store-products-header-content">
            <button onClick={() => router.back()} className="store-products-back-button"><ChevronLeft className="w-6 h-6" /></button>
            <img src="/noq-logo_1.svg" alt="NoQ" style={{ height: '32px', width: 'auto' }} />
            <div style={{ width: 40 }} />
          </div>
        </header>
        <div className="store-products-loading-state"><Loader2 className="store-products-loading-spinner" /><p>Loading store...</p></div>
      </div>
    );
  }

  if (!store) {
    return (
      <div className="store-products-container">
        <header className="store-products-header">
          <div className="store-products-header-content">
            <button onClick={() => router.back()} className="store-products-back-button"><ChevronLeft className="w-6 h-6" /></button>
            <img src="/noq-logo_1.svg" alt="NoQ" style={{ height: '32px', width: 'auto' }} />
            <div style={{ width: 40 }} />
          </div>
        </header>
        <div className="store-products-empty-state"><p className="store-products-empty-state-text">Store not found</p></div>
      </div>
    );
  }

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <div className="store-products-container">

      <header className="store-products-header">
        <div className="store-products-header-content">
          <button onClick={() => router.back()} className="store-products-back-button"><ChevronLeft className="w-6 h-6" /></button>
          <img src="/noq-logo_1.svg" alt="NoQ" style={{ height: '32px', width: 'auto' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {/* Book Appointment button in header if appointment-only store */}
            {showAppointment && !showProducts && (
              <button
                onClick={() => router.push(`/buyer/appointments/${storeId}`)}
                style={{
                  padding: '0.45rem 0.85rem',
                  background: config.gradient || config.color,
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                  fontFamily: 'inherit',
                }}
              >
                <Calendar size={14} />
                Book
              </button>
            )}
            {showProducts && (
              <button className="store-products-cart-button" onClick={() => router.push('/buyer/cart')}>
                <ShoppingCart className="w-6 h-6" />
                {cartItemCount > 0 && (
                  <span className="store-products-cart-badge" style={{ background: config.color }}>{cartItemCount}</span>
                )}
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="store-products-main-content">
        <div
          className="store-products-store-header-card"
          style={{
            background: `linear-gradient(135deg, ${config.color}08 0%, ${config.color}03 100%)`,
            borderTop: `4px solid ${config.color}`,
          }}
        >
          {/* Store profile */}
          <div className="store-profile-section">
            <div className="store-profile-header">
              {store.logo_url ? (
                <img src={store.logo_url} alt={`${store.store_name} logo`} className="store-profile-logo" />
              ) : (
                <div className="store-profile-logo-placeholder" style={{ background: config.gradient, boxShadow: `0 8px 24px ${config.color}30` }}>
                  <span style={{ fontSize: '3rem' }}>{config.icon}</span>
                </div>
              )}
              <div className="store-profile-info">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                  <h1 className="store-products-store-title" style={{ color: config.color }}>{store.store_name}</h1>
                  <RealtimePill status={realtimeStatus} />
                </div>
                <p className="store-category-tag" style={{ background: `${config.color}15`, color: config.color }}>{config.name}</p>
                {store.description && <p className="store-description">{store.description}</p>}

                {/* Action pills showing what's available */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.5rem' }}>
                  {showQueue && (
                    <span style={{ fontSize: '0.72rem', padding: '2px 10px', borderRadius: '999px', background: '#7c3aed14', color: '#7c3aed', border: '1px solid #7c3aed30', fontWeight: 600 }}>
                      👥 Queue available
                    </span>
                  )}
                  {showAppointment && (
                    <span style={{ fontSize: '0.72rem', padding: '2px 10px', borderRadius: '999px', background: '#2563eb14', color: '#2563eb', border: '1px solid #2563eb30', fontWeight: 600 }}>
                      📅 Appointments available
                    </span>
                  )}
                  {showProducts && (
                    <span style={{ fontSize: '0.72rem', padding: '2px 10px', borderRadius: '999px', background: '#10b98114', color: '#10b981', border: '1px solid #10b98130', fontWeight: 600 }}>
                      🛒 Products available
                    </span>
                  )}
                </div>
              </div>

              {galleryImages.length > 0 && (
                <div className="store-gallery-slideshow">
                  <div className="slideshow-container">
                    <img
                      src={galleryImages[currentGalleryIndex]}
                      alt={`Store image ${currentGalleryIndex + 1}`}
                      className="slideshow-image"
                      onClick={() => { setShowGalleryModal(true); setIsAutoPlaying(false); }}
                    />
                    <div className="slideshow-dots">
                      {galleryImages.map((_, i) => (
                        <button key={i}
                          className={`slideshow-dot ${i === currentGalleryIndex ? 'active' : ''}`}
                          onClick={e => { e.stopPropagation(); setCurrentGalleryIndex(i); setIsAutoPlaying(false); }}
                          style={{ background: i === currentGalleryIndex ? config.color : 'rgba(255,255,255,0.5)' }}
                        />
                      ))}
                    </div>
                    {galleryImages.length > 1 && (
                      <>
                        <button className="slideshow-arrow slideshow-prev"
                          onClick={e => { e.stopPropagation(); setCurrentGalleryIndex(p => p === 0 ? galleryImages.length - 1 : p - 1); setIsAutoPlaying(false); }}>
                          <ChevronLeft className="w-5 h-5" />
                        </button>
                        <button className="slideshow-arrow slideshow-next"
                          onClick={e => { e.stopPropagation(); setCurrentGalleryIndex(p => p === galleryImages.length - 1 ? 0 : p + 1); setIsAutoPlaying(false); }}>
                          <ChevronRight className="w-5 h-5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Stats grid */}
          <div className="store-products-stats-grid">
            {showProducts && (
              <>
                <div className="store-products-stat-card" style={{ borderTop: `4px solid ${config.color}` }}>
                  <div className="store-products-stat-icon" style={{ background: `${config.color}15`, color: config.color }}>{config.icon}</div>
                  <div className="store-products-stat-value">{totalItems}</div>
                  <div className="store-products-stat-label">Total Products</div>
                </div>

                <div className="store-products-stat-card" style={{ borderTop: '4px solid #10B981' }}>
                  <div className="store-products-stat-icon" style={{ background: '#10B98115', color: '#10B981' }}>✓</div>
                  <div className="store-products-stat-value">{availableItems}</div>
                  <div className="store-products-stat-label">Available</div>
                </div>
              </>
            )}

            {!showProducts && storeServices.length > 0 && (
              <div className="store-products-stat-card" style={{ borderTop: `4px solid ${config.color}` }}>
                <div className="store-products-stat-icon" style={{ background: `${config.color}15`, color: config.color }}>🧪</div>
                <div className="store-products-stat-value">{storeServices.length}</div>
                <div className="store-products-stat-label">Services</div>
              </div>
            )}

            <LiveStatCard
              color="#2563eb"
              value={`${avgWaitTime} min`}
              label="Avg Wait / Customer"
              icon={
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: '1.5rem', height: '1.5rem' }}>
                  <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                </svg>
              }
            />

            <LiveStatCard
              color="#7c3aed"
              value={totalInQueue}
              label="In Queue"
              icon={
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: '1.5rem', height: '1.5rem' }}>
                  <line x1="8" y1="6"  x2="21" y2="6"/>
                  <line x1="8" y1="12" x2="21" y2="12"/>
                  <line x1="8" y1="18" x2="21" y2="18"/>
                  <line x1="3" y1="6"  x2="3.01" y2="6"/>
                  <line x1="3" y1="12" x2="3.01" y2="12"/>
                  <line x1="3" y1="18" x2="3.01" y2="18"/>
                </svg>
              }
            />
          </div>

          {/* Search — only when products are shown */}
          {showProducts && (
            <div className="store-products-search-filters">
              <div className="store-products-search-box">
                <svg className="store-products-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                </svg>
                <input
                  type="text"
                  placeholder="Search products..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="store-products-search-input"
                />
              </div>
            </div>
          )}
        </div>

        {/* ── Content area ──────────────────────────────────────── */}
        <div className="store-products-content">

          {/* Appointment banner — always shown when appointments enabled */}
          {showAppointment && config && (
            <AppointmentBanner
              storeId={storeId}
              config={config}
              services={storeServices}
            />
          )}

          {/* Services list — shown when products are hidden (lab mode) */}
          {!showProducts && storeServices.length > 0 && config && (
            <ServicesList
              services={storeServices}
              config={config}
              storeId={storeId}
            />
          )}

          {/* Products grid */}
          {showProducts && (
            productsLoading ? (
              <div className="store-products-loading-state">
                <Loader2 className="store-products-loading-spinner" style={{ color: config.color }} />
                <p>Loading products...</p>
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="store-products-empty-state">
                <div style={{ fontSize: '6rem', marginBottom: '1.5rem' }}>{config.icon}</div>
                <h3 className="store-products-empty-title">No products found</h3>
                <p className="store-products-empty-text">Try adjusting your search or filters</p>
              </div>
            ) : (
              <div className="store-products-products-grid">
                {filteredProducts.map(product => {
                  const variants     = getProductVariants(product);
                  const selectedSize = selectedSizes[product.id];
                  const displayPrice = getProductPrice(product);
                  const displayStock = getProductStock(product);
                  const quantity     = getQuantityInCart(product.id, selectedSize);
                  const hasVariants  = variants && variants.length > 0;

                  const plainStock = !hasVariants ? product.stock : null;
                  const isLowStock = hasVariants
                    ? (selectedSize && displayStock != null && displayStock > 0 && displayStock <= 5)
                    : (plainStock > 0 && plainStock <= 5);

                  const isUnavailable = product.status !== 'available' ||
                    (!hasVariants && product.stock === 0);

                  return (
                    <div key={product.id}
                      className="store-products-product-card"
                      style={{
                        borderTop: `3px solid ${config.color}`,
                        opacity: isUnavailable ? 0.6 : 1,
                        transition: 'opacity 0.3s ease',
                      }}
                    >
                      <div className="store-products-product-header" style={{ background: config.gradient, position: 'relative' }}>
                        <div className="store-products-product-emoji">
                          <ProductImage
                            src={product.image_url}
                            fallback={product.image}
                            alt={product.name}
                            category={product.category}
                            loading="lazy"
                          />
                        </div>

                        {!hasVariants && product.stock === 0 && (
                          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.38)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'inherit' }}>
                            <span style={{ background: '#ef4444', color: '#fff', fontWeight: 800, padding: '0.25rem 0.9rem', borderRadius: '999px', fontSize: '0.82rem', letterSpacing: '0.04em' }}>
                              OUT OF STOCK
                            </span>
                          </div>
                        )}

                        {product.status === 'unavailable' && (!hasVariants ? product.stock > 0 : true) && (
                          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.38)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'inherit' }}>
                            <span style={{ background: '#6b7280', color: '#fff', fontWeight: 800, padding: '0.25rem 0.9rem', borderRadius: '999px', fontSize: '0.82rem', letterSpacing: '0.04em' }}>
                              UNAVAILABLE
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="store-products-product-body">
                        <h3 className="store-products-product-name">{product.name}</h3>
                        <span className="store-products-product-category" style={{ background: `${config.color}20`, color: config.color }}>{product.category}</span>

                        {hasVariants && (
                          <div className="store-products-size-selector">
                            <label className="store-products-size-label">Select Size:</label>
                            <select
                              value={selectedSize || ''}
                              onChange={e => setSelectedSizes({ ...selectedSizes, [product.id]: e.target.value })}
                              className="store-products-size-select"
                            >
                              <option value="">Choose size...</option>
                              {variants.map(v => (
                                <option key={v.size} value={v.size} disabled={v.stock === 0}>
                                  {v.size} — ₹{v.price}{v.stock === 0 ? ' (sold out)' : v.stock <= 5 ? ` (${v.stock} left)` : ''}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        <div className="store-products-product-stats">
                          <div>
                            <div className="store-products-product-price" style={{ color: config.color }}>
                              {hasVariants
                                ? (displayPrice !== null ? `₹${displayPrice}` : 'Select size')
                                : `₹${product.price}`}
                            </div>
                          </div>

                          <div className="store-products-product-stock-box">
                            {!hasVariants && (
                              <>
                                {product.stock === 0 ? (
                                  <>
                                    <div className="store-products-product-stock stock-out">0</div>
                                    <div className="store-products-product-sales" style={{ color: '#ef4444', fontWeight: 700 }}>sold out</div>
                                  </>
                                ) : isLowStock ? (
                                  <>
                                    <div className="store-products-product-stock stock-good" style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d', fontWeight: 700 }}>
                                      {product.stock}
                                    </div>
                                    <div className="store-products-product-sales" style={{ color: '#c2410c', fontWeight: 700 }}>
                                      only {product.stock} left!
                                    </div>
                                  </>
                                ) : null}
                              </>
                            )}

                            {hasVariants && selectedSize && (
                              <>
                                {displayStock === 0 ? (
                                  <>
                                    <div className="store-products-product-stock stock-out">0</div>
                                    <div className="store-products-product-sales" style={{ color: '#ef4444', fontWeight: 700 }}>sold out</div>
                                  </>
                                ) : isLowStock ? (
                                  <>
                                    <div className="store-products-product-stock stock-good" style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d', fontWeight: 700 }}>
                                      {displayStock}
                                    </div>
                                    <div className="store-products-product-sales" style={{ color: '#c2410c', fontWeight: 700 }}>only {displayStock} left!</div>
                                  </>
                                ) : null}
                              </>
                            )}
                          </div>
                        </div>

                        {quantity === 0 ? (
                          <button
                            onClick={() => addToCart(product)}
                            disabled={
                              isUnavailable ||
                              (hasVariants && !selectedSize) ||
                              (hasVariants && selectedSize && displayStock === 0) ||
                              (!hasVariants && product.stock === 0)
                            }
                            className={`store-products-btn ${
                              !isUnavailable &&
                              (!hasVariants ? product.stock > 0 : (selectedSize && displayStock > 0))
                                ? 'store-products-btn-available'
                                : 'store-products-btn-unavailable'
                            }`}
                            style={
                              !isUnavailable &&
                              (!hasVariants ? product.stock > 0 : (selectedSize && displayStock > 0))
                                ? { background: config.gradient }
                                : {}
                            }
                          >
                            {hasVariants && !selectedSize
                              ? 'Select Size First'
                              : product.status === 'unavailable'
                              ? '✗ Unavailable'
                              : hasVariants
                                ? (displayStock > 0 ? '✓ Add to Cart' : '✗ Out of Stock')
                                : (product.stock > 0 ? '✓ Add to Cart' : '✗ Out of Stock')}
                          </button>
                        ) : (
                          <div className="store-products-quantity-controls" style={{ background: config.gradient }}>
                            <button onClick={() => removeFromCart(product.id, selectedSize)} className="store-products-quantity-btn">
                              <Minus className="w-5 h-5" />
                            </button>
                            <span className="store-products-quantity-display">{quantity}</span>
                            <button
                              onClick={() => addToCart(product)}
                              className="store-products-quantity-btn"
                              disabled={quantity >= (hasVariants ? (displayStock ?? 0) : product.stock)}
                            >
                              <Plus className="w-5 h-5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}

          {/* No-products, no-services empty state */}
          {!showProducts && storeServices.length === 0 && !productsLoading && (
            <div className="store-products-empty-state">
              <div style={{ fontSize: '5rem', marginBottom: '1rem' }}>🏥</div>
              <h3 className="store-products-empty-title">No services listed yet</h3>
              <p className="store-products-empty-text">
                {showAppointment
                  ? 'Book an appointment to get started.'
                  : 'Check back later for available services.'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Gallery modal */}
      {showGalleryModal && galleryImages.length > 0 && (
        <div className="gallery-modal-overlay" onClick={() => setShowGalleryModal(false)}>
          <div className="gallery-modal" onClick={e => e.stopPropagation()}>
            <button className="gallery-modal-close" onClick={() => setShowGalleryModal(false)}><X className="w-6 h-6" /></button>
            <div className="gallery-modal-content">
              <button className="gallery-nav-btn gallery-nav-prev" onClick={() => setCurrentGalleryIndex(p => p === 0 ? galleryImages.length - 1 : p - 1)}>
                <ChevronLeft className="w-8 h-8" />
              </button>
              <img src={galleryImages[currentGalleryIndex]} alt={`Store image ${currentGalleryIndex + 1}`} className="gallery-modal-image" />
              <button className="gallery-nav-btn gallery-nav-next" onClick={() => setCurrentGalleryIndex(p => p === galleryImages.length - 1 ? 0 : p + 1)}>
                <ChevronRight className="w-8 h-8" />
              </button>
            </div>
            <div className="gallery-modal-footer"><span>{currentGalleryIndex + 1} / {galleryImages.length}</span></div>
          </div>
        </div>
      )}

      {/* Cart bar — only when products shown */}
      {showProducts && cart.length > 0 && (
        <div className="store-products-cart-summary">
          <div className="store-products-cart-summary-content">
            <div className="store-products-cart-info">
              <p className="store-products-cart-items-count">{cartItemCount} items in cart</p>
              <p className="store-products-cart-total" style={{ color: config.color }}>₹{cartTotal.toFixed(2)}</p>
            </div>
            <button onClick={() => router.push('/buyer/cart')} className="store-products-checkout-btn" style={{ background: config.gradient }}>
              View Cart →
            </button>
          </div>
        </div>
      )}

      {/* Fixed appointment button at bottom for appointment-only stores */}
      {showAppointment && !showProducts && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          padding: '1rem 1.25rem',
          background: 'var(--color-background-primary)',
          borderTop: '1px solid var(--color-border-tertiary)',
          zIndex: 50,
        }}>
          <button
            onClick={() => router.push(`/buyer/appointments/${storeId}`)}
            style={{
              width: '100%',
              padding: '0.9rem',
              background: config.gradient || config.color,
              color: '#fff',
              border: 'none',
              borderRadius: '12px',
              fontSize: '1rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              fontFamily: 'inherit',
            }}
          >
            <Calendar size={20} />
            Book an Appointment
          </button>
        </div>
      )}

      <style>{`
        @keyframes livePulse {
          0%, 100% { opacity: 1;   transform: scale(1);   }
          50%       { opacity: 0.4; transform: scale(1.5); }
        }
      `}</style>
    </div>
  );
}