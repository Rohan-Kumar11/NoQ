// Sidebar.jsx — Final version: hamburger only (no X button), responsive, product/queue-only aware
'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useNotifications } from '../context/NotificationContext';
import { hasProductsFeature } from '@/lib/categoryConfig';
import styles from './Sidebar.module.css';

export default function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { unreadCount } = useNotifications();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [storeProfile, setStoreProfile] = useState(null);
  const [storeType, setStoreType] = useState(null);
  const [serviceMode, setServiceMode] = useState(null);
  const overlayRef = useRef(null);

  useEffect(() => {
    loadStoreProfile();
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 1024);
      if (window.innerWidth <= 1024) setIsCollapsed(false);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => { setIsMobileOpen(false); }, [pathname]);

  useEffect(() => {
    if (isMobile) document.body.style.overflow = isMobileOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isMobileOpen, isMobile]);

  async function loadStoreProfile() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: stores } = await supabase
        .from('stores')
        .select('id, store_name, store_type, is_open, logo_url, service_mode')
        .eq('owner_id', user.id)
        .single();
      if (stores) {
        setStoreProfile(stores);
        setStoreType(stores.store_type);
        setServiceMode(stores.service_mode ?? {
          queue_enabled: true,
          appointment_enabled: false,
          has_products: true,
        });
      }
    } catch (error) {
      console.error('Error loading store profile:', error);
    }
  }

  const showProductsMenu = serviceMode
    ? serviceMode.has_products
    : (storeType ? hasProductsFeature(storeType) : true);

  const showAppointments = serviceMode?.appointment_enabled || storeType === 'lab';

  const navItems = [
    { icon: '📊', label: 'Dashboard',    path: '/seller/dashboard',    requiresProducts: false, requiresAppointments: false },
    { icon: '👥', label: 'Queue',         path: '/seller/queue',         requiresProducts: false, requiresAppointments: false },
    { icon: '📦', label: 'Products',      path: '/seller/products',      requiresProducts: true,  requiresAppointments: false },
    { icon: '🛍️', label: 'Orders',        path: '/seller/orders',        requiresProducts: true,  requiresAppointments: false },
    { icon: '📅', label: 'Appointments',  path: '/seller/appointments',  requiresProducts: false, requiresAppointments: true  },
    { icon: '📈', label: 'Analytics',     path: '/seller/analytics',     requiresProducts: false, requiresAppointments: false },
    { icon: '💳', label: 'Payments',      path: '/seller/payments',      requiresProducts: false, requiresAppointments: false },
    { icon: '🔔', label: 'Notifications', path: '/seller/notifications', badge: unreadCount, requiresProducts: false, requiresAppointments: false },
    { icon: '⚙️', label: 'Settings',      path: '/seller/settings',      requiresProducts: false, requiresAppointments: false },
  ];

  const filteredNavItems = navItems.filter(item => {
    if (item.requiresProducts && !showProductsMenu) return false;
    if (item.requiresAppointments && !showAppointments) return false;
    return true;
  });

  const handleProfileClick = () => {
    router.push('/seller/profile');
    if (isMobile) setIsMobileOpen(false);
  };

  const handleNavClick = (path) => {
    router.push(path);
    if (isMobile) setIsMobileOpen(false);
  };

  const getInitials = (name) => {
    if (!name) return 'S';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const collapsed = !isMobile && isCollapsed;

  return (
    <>
      {isMobile && (
        <button
          className={styles.hamburger}
          onClick={() => setIsMobileOpen(v => !v)}
          aria-label={isMobileOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={isMobileOpen}
        >
          <span className={`${styles.hamburgerBar} ${isMobileOpen ? styles.barTop : ''}`} />
          <span className={`${styles.hamburgerBar} ${isMobileOpen ? styles.barMid : ''}`} />
          <span className={`${styles.hamburgerBar} ${isMobileOpen ? styles.barBot : ''}`} />
        </button>
      )}

      {isMobile && (
        <div
          ref={overlayRef}
          className={`${styles.overlay} ${isMobileOpen ? styles.overlayVisible : ''}`}
          onClick={() => setIsMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={[
          styles.sidebar,
          collapsed    ? styles.collapsed  : '',
          isMobile     ? styles.mobile     : '',
          isMobile && isMobileOpen ? styles.mobileOpen : '',
        ].filter(Boolean).join(' ')}
      >
        <div className={styles.sidebarHeader}>
          {!collapsed ? (
            <>
              <div className={styles.logo}>
                <img src="/noq-logo_1.svg" alt="NoQ" className={styles.logoIcon} />
              </div>
              {!isMobile && (
                <button
                  className={styles.collapseBtn}
                  onClick={() => setIsCollapsed(true)}
                  aria-label="Collapse sidebar"
                >
                  ←
                </button>
              )}
            </>
          ) : (
            <button
              className={styles.expandBtn}
              onClick={() => setIsCollapsed(false)}
              aria-label="Expand sidebar"
            >
              →
            </button>
          )}
        </div>

        {/* Store Profile (expanded) */}
        {storeProfile && !collapsed && (
          <div
            className={styles.storeProfile}
            onClick={handleProfileClick}
            style={{ cursor: 'pointer' }}
          >
            <div className={styles.avatarSection}>
              <div className={styles.avatarContainer}>
                {storeProfile.logo_url ? (
                  <img
                    src={storeProfile.logo_url}
                    alt={storeProfile.store_name}
                    className={styles.avatarImage}
                  />
                ) : (
                  <div className={styles.avatarPlaceholder}>
                    {getInitials(storeProfile.store_name)}
                  </div>
                )}
              </div>
              <div className={styles.storeInfo}>
                <div className={styles.storeName}>{storeProfile.store_name}</div>
                <div className={styles.storeType}>{storeProfile.store_type}</div>
                {!showProductsMenu && (
                  <div className={styles.shopTypeBadge}>Queue Only</div>
                )}
              </div>
            </div>
            <div className={`${styles.storeStatus} ${storeProfile.is_open ? styles.open : styles.closed}`}>
              {storeProfile.is_open ? '🟢 Open' : '🔴 Closed'}
            </div>
            <div className={styles.editProfileHint}>Click to manage profile</div>
          </div>
        )}

        {/* Collapsed avatar */}
        {storeProfile && collapsed && (
          <div
            className={styles.collapsedAvatar}
            onClick={handleProfileClick}
            title="Manage Profile"
          >
            <div className={styles.avatarContainer}>
              {storeProfile.logo_url ? (
                <img
                  src={storeProfile.logo_url}
                  alt={storeProfile.store_name}
                  className={styles.avatarImage}
                />
              ) : (
                <div className={styles.avatarPlaceholder}>
                  {getInitials(storeProfile.store_name)}
                </div>
              )}
            </div>
          </div>
        )}

        <nav className={styles.nav}>
          {filteredNavItems.map((item) => (
            <button
              key={item.path}
              onClick={() => handleNavClick(item.path)}
              className={`${styles.navItem} ${pathname === item.path ? styles.active : ''}`}
              title={collapsed ? item.label : undefined}
            >
              <span className={styles.navIcon}>{item.icon}</span>
              {!collapsed && (
                <>
                  <span className={styles.navLabel}>{item.label}</span>
                  {item.badge > 0 && (
                    <span className={styles.badge}>{item.badge}</span>
                  )}
                </>
              )}
            </button>
          ))}
        </nav>

        <div className={styles.sidebarFooter}>
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              router.push('/');
            }}
            className={styles.logoutBtn}
            title={collapsed ? 'Logout' : undefined}
          >
            <span className={styles.navIcon}>🚪</span>
            {!collapsed && <span className={styles.navLabel}>Logout</span>}
          </button>
        </div>
      </aside>
    </>
  );
}