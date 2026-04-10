'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  Home, ShoppingCart, Package, Users, Bell,
  Calendar, BookMarked, Menu, X,
  User, ChevronDown, LogOut, MapPin,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { signOut } from '@/lib/auth';
import '../buyer/BuyerHome.css'; // ← same CSS as buyer/page.js

// ─────────────────────────────────────────────
// NAV ITEMS — extend this array to add more tabs
// ─────────────────────────────────────────────
const NAV_ITEMS = [
  { icon: Home,         label: 'Home',         path: '/buyer' },
  { icon: ShoppingCart, label: 'Cart',          path: '/buyer/cart',          showBadge: true },
  { icon: Package,      label: 'Orders',        path: '/buyer/orders' },
  { icon: Users,        label: 'Queue History', path: '/buyer/queue-history' },
  { icon: Bell,         label: 'Notifications', path: '/buyer/notifications' },
  { icon: Calendar,     label: 'Events',        path: '/buyer/events' },
  { icon: BookMarked,   label: 'My Events',     path: '/buyer/my-events' },
];

export default function BuyerNavbar() {
  const router   = useRouter();
  const pathname = usePathname();

  const [cartCount,        setCartCount]        = useState(0);
  const [userProfile,      setUserProfile]      = useState(null);
  const [mobileMenuOpen,   setMobileMenuOpen]   = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);

  // ── fetch user + profile ──────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from('profiles').select('full_name').eq('id', user.id).single();
      setUserProfile({ email: user.email, fullName: profile?.full_name || '' });
    })();
  }, []);

  // ── fetch + subscribe cart count ──────────────────────────────────────────
  const refreshCart = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: cart } = await supabase
      .from('carts').select('id').eq('user_id', user.id).single();
    if (!cart) { setCartCount(0); return; }
    const { data: items } = await supabase
      .from('cart_items').select('quantity').eq('cart_id', cart.id);
    setCartCount(items?.reduce((s, i) => s + (i.quantity || 0), 0) || 0);
  }, []);

  useEffect(() => {
    refreshCart();
    const sub = supabase
      .channel('bn-cart')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cart_items' }, refreshCart)
      .subscribe();
    window.addEventListener('cartUpdated', refreshCart);
    return () => {
      sub.unsubscribe();
      window.removeEventListener('cartUpdated', refreshCart);
    };
  }, [refreshCart]);

  // ── helpers ───────────────────────────────────────────────────────────────
  const getUserInitials = () => {
    if (!userProfile?.fullName) return 'U';
    return userProfile.fullName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const handleLogout = async () => {
    const result = await signOut();
    if (result.success) router.push('/');
  };

  const isActive = (path) => {
    if (path === '/buyer') return pathname === '/buyer';
    return pathname.startsWith(path);
  };

  const navigate = (path) => {
    router.push(path);
    setMobileMenuOpen(false);
    setUserDropdownOpen(false);
  };

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <nav className="buyer-nav-bar">
      <div className="buyer-nav-content">

        {/* Logo */}
        <div className="buyer-nav-left">
          <div
            className="buyer-nav-logo-container"
            onClick={() => navigate('/')}
            style={{ cursor: 'pointer' }}
          >
            <img src="/noq-logo_1.svg" alt="NoQ" className="buyer-nav-logo-img" />
          </div>
        </div>

        {/* Center nav items */}
        <div className="buyer-nav-center">
          {NAV_ITEMS.map(({ icon: Icon, label, path, showBadge }) => (
            <button
              key={path}
              onClick={() => navigate(path)}
              className={`buyer-nav-item ${isActive(path) ? 'active' : ''}`}
            >
              <div className="buyer-nav-item-icon">
                <Icon className="w-5 h-5" />
                {showBadge && cartCount > 0 && (
                  <span className="buyer-nav-badge">{cartCount}</span>
                )}
              </div>
              <span className="buyer-nav-item-label">{label}</span>
            </button>
          ))}
        </div>

        {/* Right: location + user dropdown */}
        <div className="buyer-nav-right">
          <button className="buyer-nav-location-btn">
            <MapPin className="w-4 h-4" />
            <span className="buyer-nav-location-text">Ghaziabad</span>
          </button>

          <div className="buyer-nav-user-menu">
            <button
              className="buyer-nav-user-btn"
              onClick={() => setUserDropdownOpen(v => !v)}
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
                  onClick={() => navigate('/buyer/settings')}
                >
                  <User className="w-4 h-4" /> Settings
                </button>
                <button
                  className="buyer-nav-dropdown-item"
                  onClick={() => navigate('/buyer/orders')}
                >
                  <Package className="w-4 h-4" /> My Orders
                </button>

                <div className="buyer-nav-dropdown-divider" />

                <button
                  className="buyer-nav-dropdown-item logout"
                  onClick={handleLogout}
                >
                  <LogOut className="w-4 h-4" /> Logout
                </button>
              </div>
            )}
          </div>

          {/* Hamburger */}
          <button
            className="buyer-nav-mobile-toggle"
            onClick={() => setMobileMenuOpen(v => !v)}
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="buyer-mobile-menu">
          {NAV_ITEMS.map(({ icon: Icon, label, path, showBadge }) => (
            <button
              key={path}
              onClick={() => navigate(path)}
              className={`buyer-mobile-menu-item ${isActive(path) ? 'active' : ''}`}
            >
              <Icon className="w-5 h-5" />
              <span>{label}</span>
              {showBadge && cartCount > 0 && (
                <span className="buyer-mobile-menu-badge">{cartCount}</span>
              )}
            </button>
          ))}

          <div className="buyer-mobile-menu-divider" />

          <button
            className="buyer-mobile-menu-item"
            onClick={() => navigate('/buyer/settings')}
          >
            <User className="w-5 h-5" /><span>Settings</span>
          </button>
          <button
            className="buyer-mobile-menu-item logout"
            onClick={handleLogout}
          >
            <LogOut className="w-5 h-5" /><span>Logout</span>
          </button>
        </div>
      )}
    </nav>
  );
}