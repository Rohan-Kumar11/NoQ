// app/buyer/page.js
'use client';

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Search, MapPin, TrendingUp, Map, List, Filter, Loader2, ShoppingCart, Package, Bell, Home, Menu, X, User, Calendar, ChevronDown, LogOut, Users, BookMarked } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { fetchStores, isStoreOpen, formatStoreCategory } from '@/lib/api/stores';
import { supabase } from '@/lib/supabase/client';
import { signOut } from '@/lib/auth';
import StoreMap from './StoreMap';
import StoreRating from '@/app/components/StoreRating';
import './BuyerHome.css';
import { hasProductsFeature } from '@/lib/categoryConfig';
import { getServiceMode } from '@/lib/api/appointments';

const AUTO_REFRESH_INTERVAL = 30000;

export default function BuyerHome() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [serviceModes, setServiceModes] = useState({});
  const [viewMode, setViewMode] = useState('list');
  const [showFilters, setShowFilters] = useState(false);
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [queueData, setQueueData] = useState({});
  const [userLocation, setUserLocation] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  const [userId, setUserId] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const queueSubscriptionsRef = useRef([]);
  const refreshTimerRef = useRef(null);

  const [filters, setFilters] = useState({
    maxDistance: null,
    isOpen: false,
    minRating: 0,
    hasQueue: false,
    takeaway: false,      // ✅ NEW
  });

  const [distanceEnabled, setDistanceEnabled] = useState(false);

  const handleNavigateToStore = useCallback((store) => {
    if (store.status === 'closed') return;
    const mode = serviceModes[store.id];
    if (mode && !mode.has_products && mode.appointment_enabled) {
      router.push(`/buyer/appointments/${store.id}`);
      return;
    }
    if (hasProductsFeature(store.store_type)) {
      router.push(`/buyer/store/${store.id}`);
    } else {
      router.push(`/buyer/checkout/${store.id}`);
    }
  }, [router, serviceModes]);

  useEffect(() => {
    const getCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();
        setUserProfile({
          email: user.email,
          fullName: profile?.full_name || '',
          phone: profile?.phone || '',
        });
      }
    };
    getCurrentUser();
  }, []);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
        },
        () => {
          setUserLocation({ lat: 28.6692, lng: 77.4538 });
        }
      );
    } else {
      setUserLocation({ lat: 28.6692, lng: 77.4538 });
    }
  }, []);

  const fetchCartCount = useCallback(async () => {
    if (!userId) return;
    try {
      const { data: cart } = await supabase
        .from('carts').select('id').eq('user_id', userId).single();
      if (!cart) { setCartCount(0); return; }
      const { data: cartItems } = await supabase
        .from('cart_items').select('quantity').eq('cart_id', cart.id);
      setCartCount(cartItems?.reduce((sum, item) => sum + (item.quantity || 0), 0) || 0);
    } catch (error) {
      console.error('Error in fetchCartCount:', error);
    }
  }, [userId]);

  useEffect(() => { if (userId) fetchCartCount(); }, [userId, fetchCartCount]);

  useEffect(() => {
    if (!userId) return;
    const subscription = supabase
      .channel('cart-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cart_items' }, fetchCartCount)
      .subscribe();
    return () => subscription.unsubscribe();
  }, [userId, fetchCartCount]);

  useEffect(() => {
    window.addEventListener('cartUpdated', fetchCartCount);
    return () => window.removeEventListener('cartUpdated', fetchCartCount);
  }, [fetchCartCount]);

  const getStoreQueueCount = async (storeId) => {
    try {
      const { count } = await supabase
        .from('active_queue')
        .select('id', { count: 'exact', head: true })
        .eq('store_id', storeId)
        .in('status', ['confirmed', 'waiting', 'in_service']);

      const { data: waitData } = await supabase
        .from('active_queue')
        .select('wait_time_minutes')
        .eq('store_id', storeId)
        .in('status', ['waiting', 'in_service'])
        .not('wait_time_minutes', 'is', null);

      let avgWaitTime = 0;
      if (waitData && waitData.length > 0) {
        avgWaitTime = Math.round(waitData.reduce((s, e) => s + (e.wait_time_minutes || 0), 0) / waitData.length);
      }
      return { queueSize: count || 0, avgWaitTime };
    } catch {
      return { queueSize: 0, avgWaitTime: 0 };
    }
  };

  const fetchQueueDataForStores = useCallback(async (storesList) => {
    try {
      const results = await Promise.all(
        storesList.map(async (store) => ({
          storeId: store.id,
          data: await getStoreQueueCount(store.id)
        }))
      );
      const queueMap = {};
      results.forEach(({ storeId, data }) => { queueMap[storeId] = data; });
      setQueueData(queueMap);
    } catch (error) {
      console.error('Error fetching queue data:', error);
    }
  }, []);

  const loadStores = useCallback(async (isBackground = false) => {
    if (!isBackground) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    setError(null);

    try {
      const { data, error: fetchError } = await fetchStores({
        storeType: null,
        lat: userLocation?.lat,
        lng: userLocation?.lng,
        maxDistance: filters.maxDistance
      });

      if (fetchError) { setError(fetchError); setStores([]); return; }
      if (!data || data.length === 0) { setStores([]); return; }

      const storesWithStatus = data.map(store => ({
        ...store,
        status: isStoreOpen(store) ? 'open' : 'closed',
        category: formatStoreCategory(store.store_type),
        rawStoreType: store.store_type,
        rating: parseFloat(store.average_rating) || 0
      }));

      setStores(storesWithStatus);
      await fetchQueueDataForStores(storesWithStatus);
    } catch (error) {
      console.error('Error in loadStores:', error);
      setError(error.message || 'Failed to load stores');
      setStores([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userLocation, filters.maxDistance, fetchQueueDataForStores]);

  useEffect(() => {
    if (userLocation) {
      loadStores(false);
    }
  }, [userLocation, loadStores]);

  useEffect(() => {
    if (!userLocation) return;
    refreshTimerRef.current = setInterval(() => {
      loadStores(true);
    }, AUTO_REFRESH_INTERVAL);
    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  }, [userLocation, loadStores]);

  useEffect(() => {
    if (stores.length === 0) return;
    const fetchModes = async () => {
      const results = await Promise.all(
        stores.map(async (store) => {
          try {
            const { data } = await getServiceMode(store.id);
            return { id: store.id, mode: data };
          } catch {
            return { id: store.id, mode: null };
          }
        })
      );
      const map = {};
      results.forEach(({ id, mode }) => { map[id] = mode; });
      setServiceModes(map);
    };
    fetchModes();
  }, [stores]);

  useEffect(() => {
    if (stores.length === 0) return;

    queueSubscriptionsRef.current.forEach(ch => {
      try { supabase.removeChannel(ch); } catch { }
    });
    queueSubscriptionsRef.current = [];

    const newChannels = stores.map(store => {
      const channel = supabase
        .channel(`active-queue-${store.id}-${Date.now()}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'active_queue', filter: `store_id=eq.${store.id}` },
          async () => {
            const updatedData = await getStoreQueueCount(store.id);
            setQueueData(prev => ({ ...prev, [store.id]: updatedData }));
          }
        )
        .subscribe();
      return channel;
    });

    queueSubscriptionsRef.current = newChannels;

    return () => {
      newChannels.forEach(ch => {
        try { supabase.removeChannel(ch); } catch { }
      });
    };
  }, [stores.length]);

  const storeTypes = useMemo(() => {
    const uniqueTypes = new Set(stores.map(s => s.rawStoreType).filter(Boolean));
    return ['All', ...Array.from(uniqueTypes).sort()];
  }, [stores]);

  const filteredStores = useMemo(() => {
    return stores.filter(store => {
      const matchesSearch =
        store.store_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        store.category?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        store.description?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType = selectedCategory === 'All' || store.rawStoreType === selectedCategory;
      const matchesOpenStatus = !filters.isOpen || store.status === 'open';
      const matchesRating = !filters.minRating || store.rating >= filters.minRating;
      const queue = queueData[store.id] || { queueSize: 0 };
      const matchesQueue = !filters.hasQueue || queue.queueSize === 0;
      // ✅ NEW: only show stores where takeaway_enabled === true
      const matchesTakeaway = !filters.takeaway || store.takeaway_enabled === true;
      return matchesSearch && matchesType && matchesOpenStatus && matchesRating && matchesQueue && matchesTakeaway;
    });
  }, [stores, searchQuery, selectedCategory, filters, queueData]);

  const getStoreIcon = (category) => {
    const icons = {
      'Grocery': '🛒', 'Food': '🍽️', 'Electronics': '📱', 'Fashion': '👗',
      'Healthcare': '💊', 'Pharmacy': '⚕️', 'Books': '📚', 'Restaurant': '🍴',
      'Cafe': '☕', 'Retail': '🏪', 'Bakery': '🥐', 'Clinic': '🏥',
      'Salon': '💇', 'Lab': '🔬'
    };
    return icons[category] || '🏪';
  };

  const formatStoreType = (storeType) => {
    if (!storeType) return storeType;
    return storeType.split(/[-_]/)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  };

  const getUserInitials = () => {
    if (!userProfile?.fullName) return 'U';
    return userProfile.fullName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const handleLogout = async () => {
    try {
      const result = await signOut();
      if (result.success) router.push('/');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const navItems = [
    { icon: Home, label: 'Home', path: '/buyer', active: true },
    { icon: ShoppingCart, label: 'Cart', path: '/buyer/cart', badge: cartCount },
    { icon: Package, label: 'Orders', path: '/buyer/orders' },
    { icon: Users, label: 'Queue History', path: '/buyer/queue-history' },
    { icon: Bell, label: 'Notifications', path: '/buyer/notifications' },
    { icon: Calendar, label: 'Events', path: '/buyer/events' },
    { icon: BookMarked, label: 'My Events', path: '/buyer/my-events' },
  ];

  return (
    <div className="buyer-home-container">

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
            {navItems.map(({ icon: Icon, label, path, active, badge }) => (
              <button
                key={path}
                onClick={() => router.push(path)}
                className={`buyer-nav-item ${active ? 'active' : ''}`}
              >
                <div className="buyer-nav-item-icon">
                  <Icon className="w-5 h-5" />
                  {badge !== undefined && badge > 0 && (
                    <span className="buyer-nav-badge">{badge}</span>
                  )}
                </div>
                <span className="buyer-nav-item-label">{label}</span>
              </button>
            ))}
          </div>

          <div className="buyer-nav-right">
            {refreshing && (
              <div className="buyer-nav-refresh-indicator" title="Refreshing...">
                <Loader2 className="w-4 h-4 buyer-nav-refresh-spinner" />
              </div>
            )}

            <button className="buyer-nav-location-btn">
              <MapPin className="w-4 h-4" />
              <span className="buyer-nav-location-text">Ghaziabad</span>
            </button>

            <div className="buyer-nav-user-menu">
              <button
                className="buyer-nav-user-btn"
                onClick={() => setUserDropdownOpen(!userDropdownOpen)}
              >
                <div className="buyer-nav-user-avatar">{getUserInitials()}</div>
                <span className="buyer-nav-user-name">{userProfile?.fullName || 'User'}</span>
                <ChevronDown className={`buyer-nav-dropdown-icon ${userDropdownOpen ? 'open' : ''}`} />
              </button>

              {userDropdownOpen && (
                <div className="buyer-nav-dropdown">
                  <div className="buyer-nav-dropdown-header">
                    <div className="buyer-nav-dropdown-avatar">{getUserInitials()}</div>
                    <div className="buyer-nav-dropdown-info">
                      <div className="buyer-nav-dropdown-name">{userProfile?.fullName || 'User'}</div>
                      <div className="buyer-nav-dropdown-email">{userProfile?.email}</div>
                    </div>
                  </div>
                  <div className="buyer-nav-dropdown-divider" />
                  <button
                    className="buyer-nav-dropdown-item"
                    onClick={() => { setUserDropdownOpen(false); router.push('/buyer/settings'); }}
                  >
                    <User className="w-4 h-4" /> Settings
                  </button>
                  <button
                    className="buyer-nav-dropdown-item"
                    onClick={() => { setUserDropdownOpen(false); router.push('/buyer/orders'); }}
                  >
                    <Package className="w-4 h-4" /> My Orders
                  </button>
                  <div className="buyer-nav-dropdown-divider" />
                  <button className="buyer-nav-dropdown-item logout" onClick={handleLogout}>
                    <LogOut className="w-4 h-4" /> Logout
                  </button>
                </div>
              )}
            </div>

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
            {navItems.map(({ icon: Icon, label, path, active, badge }) => (
              <button
                key={path}
                onClick={() => { router.push(path); setMobileMenuOpen(false); }}
                className={`buyer-mobile-menu-item ${active ? 'active' : ''}`}
              >
                <Icon className="w-5 h-5" />
                <span>{label}</span>
                {badge !== undefined && badge > 0 && (
                  <span className="buyer-mobile-menu-badge">{badge}</span>
                )}
              </button>
            ))}
            <div className="buyer-mobile-menu-divider" />
            <button
              onClick={() => { setMobileMenuOpen(false); router.push('/buyer/settings'); }}
              className="buyer-mobile-menu-item"
            >
              <User className="w-5 h-5" /><span>Settings</span>
            </button>
            <button onClick={handleLogout} className="buyer-mobile-menu-item logout">
              <LogOut className="w-5 h-5" /><span>Logout</span>
            </button>
          </div>
        )}
      </nav>

      <div className="buyer-home-main-content">

        <div className="buyer-home-hero-section">
          <h1 className="buyer-home-hero-title">
            No Wait, <br />
            Only <span className="buyer-home-hero-title-gradient">Satisfaction</span>
          </h1>
          <p className="buyer-home-hero-subtitle">
            Browse nearby stores, join virtual queues, and skip the wait. Your time matters.
          </p>
        </div>

        <div className="buyer-home-search-section">
          <div className="buyer-home-search-container">
            <div className="buyer-home-search-input-wrapper">
              <Search className="buyer-home-search-icon" />
              <input
                type="text"
                placeholder="Search stores, categories..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="buyer-home-search-input"
              />
            </div>
            <div className="buyer-home-view-toggle-container">
              <button
                onClick={() => setViewMode('list')}
                className={`buyer-home-view-toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
              >
                <List className="w-5 h-5" />
              </button>
              <button
                onClick={() => setViewMode('map')}
                className={`buyer-home-view-toggle-btn ${viewMode === 'map' ? 'active' : ''}`}
              >
                <Map className="w-5 h-5" />
              </button>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`buyer-home-view-toggle-btn ${showFilters ? 'active' : ''}`}
              >
                <Filter className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {showFilters && (
          <div className="buyer-home-filters-panel">
            <div className="buyer-home-filters-content">

              {/* Distance filter */}
              <div className="buyer-home-filter-group">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <label className="buyer-home-filter-label" style={{ margin: 0 }}>
                    Max Distance: {distanceEnabled && filters.maxDistance !== null ? `${filters.maxDistance} km` : 'No limit'}
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#6b7280', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={distanceEnabled}
                      onChange={(e) => {
                        const enabled = e.target.checked;
                        setDistanceEnabled(enabled);
                        setFilters(prev => ({ ...prev, maxDistance: enabled ? 50 : null }));
                      }}
                    />
                    Enable limit
                  </label>
                </div>
                {distanceEnabled && (
                  <input
                    type="range"
                    min="1"
                    max="100"
                    value={filters.maxDistance ?? 50}
                    onChange={(e) => setFilters({ ...filters, maxDistance: parseInt(e.target.value) })}
                    className="buyer-home-filter-slider"
                  />
                )}
              </div>

              {/* Open now */}
              <div className="buyer-home-filter-group">
                <label className="buyer-home-filter-checkbox">
                  <input type="checkbox" checked={filters.isOpen}
                    onChange={(e) => setFilters({ ...filters, isOpen: e.target.checked })} />
                  <span>Open Now Only</span>
                </label>
              </div>

              {/* No queue */}
              <div className="buyer-home-filter-group">
                <label className="buyer-home-filter-checkbox">
                  <input type="checkbox" checked={filters.hasQueue}
                    onChange={(e) => setFilters({ ...filters, hasQueue: e.target.checked })} />
                  <span>No Queue Only</span>
                </label>
              </div>

              {/* ✅ NEW: Takeaway filter */}
              <div className="buyer-home-filter-group">
                <label className="buyer-home-filter-checkbox">
                  <input
                    type="checkbox"
                    checked={filters.takeaway}
                    onChange={(e) => setFilters({ ...filters, takeaway: e.target.checked })}
                  />
                  <span>🥡 Takeaway Available</span>
                </label>
              </div>

              {/* Min rating */}
              <div className="buyer-home-filter-group">
                <label className="buyer-home-filter-label">Min Rating: {filters.minRating || 'Any'}</label>
                <select
                  value={filters.minRating}
                  onChange={(e) => setFilters({ ...filters, minRating: parseFloat(e.target.value) })}
                  className="buyer-home-filter-select"
                >
                  <option value="0">Any Rating</option>
                  <option value="3">3+ Stars</option>
                  <option value="4">4+ Stars</option>
                  <option value="4.5">4.5+ Stars</option>
                </select>
              </div>

              {/* ✅ Reset also clears takeaway */}
              <button
                onClick={() => {
                  setDistanceEnabled(false);
                  setFilters({ maxDistance: null, isOpen: false, minRating: 0, hasQueue: false, takeaway: false });
                }}
                className="buyer-home-filter-reset"
              >
                Reset Filters
              </button>
            </div>
          </div>
        )}

        <div className="buyer-home-categories-section">
          {storeTypes.map((storeType) => (
            <button
              key={storeType}
              onClick={() => setSelectedCategory(storeType)}
              className={`buyer-home-category-pill ${selectedCategory === storeType ? 'active' : ''}`}
            >
              {formatStoreType(storeType)}
            </button>
          ))}
        </div>


        {error && (
          <div className="buyer-home-error-state">
            <p className="buyer-home-error-text">⚠️ {error}</p>
            <button onClick={() => loadStores(false)} className="buyer-home-retry-button">Try Again</button>
          </div>
        )}

        {loading ? (
          <div className="buyer-home-loading-state">
            <Loader2 className="buyer-home-loading-spinner" />
            <p>Loading stores...</p>
          </div>
        ) : viewMode === 'list' ? (
          <div className="buyer-home-stores-list">
            {filteredStores.length === 0 ? (
              <div className="buyer-home-empty-state">
                <p className="buyer-home-empty-state-text">
                  {stores.length === 0
                    ? 'No stores available at the moment. Please check back later.'
                    : 'No stores found matching your filters.'}
                </p>
              </div>
            ) : (
              filteredStores.map((store) => {
                const queue = queueData[store.id] || { queueSize: 0, avgWaitTime: 0 };
                const isClosed = store.status === 'closed';

                return (
                  <div
                    key={store.id}
                    className={`buyer-home-store-card ${isClosed ? 'store-card-closed' : 'store-card-open'}`}
                    onClick={() => handleNavigateToStore(store)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleNavigateToStore(store); }}
                    aria-label={`${store.store_name} — ${isClosed ? 'Closed' : 'Open'}`}
                  >
                    <div className="buyer-home-store-card-content">
                      <div className="buyer-home-store-icon">
                        {store.logo_url ? (
                          <img
                            src={store.logo_url}
                            alt={`${store.store_name} logo`}
                            className="buyer-home-store-logo-image"
                          />
                        ) : (
                          getStoreIcon(store.category)
                        )}
                      </div>

                      <div className="buyer-home-store-info-wrapper">
                        <div className="buyer-home-store-header">
                          <div>
                            <h3 className="buyer-home-store-name">{store.store_name}</h3>
                            <div className="buyer-home-store-meta">
                              <span className="buyer-home-meta-item">
                                <MapPin className="w-4 h-4" />
                                {store.distance ? `${store.distance.toFixed(1)} km` : store.city}
                              </span>
                              <span>•</span>
                              <span className="buyer-home-category-badge">{store.category}</span>
                              {/* ✅ NEW: Takeaway badge on store card */}
                              {store.takeaway_enabled && (
                                <>
                                  <span>•</span>
                                  <span
                                    className="buyer-home-category-badge"
                                    style={{
                                      background: '#ecfdf5',
                                      color: '#059669',
                                      borderColor: 'rgba(5,150,105,0.2)',
                                    }}
                                  >
                                    🥡 Takeaway
                                  </span>
                                </>
                              )}
                            </div>
                            <div className="buyer-home-store-rating">
                              <StoreRating
                                storeId={store.id}
                                storeName={store.store_name}
                                averageRating={store.rating || 0}
                                totalRatings={store.total_ratings || 0}
                                size="medium"
                                interactive={false}
                                showCount={true}
                              />
                            </div>
                          </div>
                          <div className={`buyer-home-status-badge ${store.status}`}>
                            {store.status === 'open' ? '🟢 Open' : '🔴 Closed'}
                          </div>
                        </div>

                        {store.description && (
                          <div className="buyer-home-store-description">
                            <p>{store.description}</p>
                          </div>
                        )}

                        {store.address && (
                          <div className="buyer-home-store-address">
                            <p>📍 {store.address}{store.landmark ? `, ${store.landmark}` : ''}, {store.city}</p>
                          </div>
                        )}

                        <div className="buyer-home-store-actions">
                          <div className="buyer-home-queue-info">
                            <div className="buyer-home-queue-size">
                              <TrendingUp className="w-5 h-5" style={{ color: '#9ca3af' }} />
                              <div>
                                <p className="buyer-home-queue-size-label">People in Queue</p>
                                <p className="buyer-home-queue-size-value">
                                  {queue.queueSize} {queue.queueSize === 1 ? 'person' : 'people'}
                                </p>
                              </div>
                            </div>
                          </div>

                          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                            

                            <button
                              disabled={isClosed}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleNavigateToStore(store);
                              }}
                              className={`buyer-home-action-button ${isClosed ? 'disabled' : 'primary'}`}
                            >
                              {isClosed
                                ? 'Closed'
                                : serviceModes[store.id]?.has_products === false
                                  ? (serviceModes[store.id]?.appointment_enabled ? '📅 Book Appointment' : 'View Services')
                                  : hasProductsFeature(store.store_type)
                                    ? 'View Products'
                                    : 'Join Queue'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        ) : (
          <StoreMap
            stores={filteredStores}
            queueData={queueData}
            userLocation={userLocation}
            onStoreSelect={(storeId) => {
              const store = stores.find(s => s.id === storeId);
              if (store) handleNavigateToStore(store);
            }}
          />
        )}

        <div className="buyer-home-stats-grid">
          <div className="buyer-home-stat-card">
            <p className="buyer-home-stat-value">{stores.length}</p>
            <p className="buyer-home-stat-label">Active Stores</p>
          </div>
          <div className="buyer-home-stat-card">
            <p className="buyer-home-stat-value">{stores.filter(s => s.status === 'open').length}</p>
            <p className="buyer-home-stat-label">Currently Open</p>
          </div>
          <div className="buyer-home-stat-card">
            <p className="buyer-home-stat-value">{storeTypes.length - 1}</p>
            <p className="buyer-home-stat-label">Store Types</p>
          </div>
        </div>
      </div>
    </div>
  );
}