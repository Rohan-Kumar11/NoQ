'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useNotifications } from '../context/NotificationContext';
import styles from './EventSidebar.module.css';

export default function EventSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { unreadCount } = useNotifications();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [profile, setProfile] = useState(null);
  const overlayRef = useRef(null);

  useEffect(() => {
    loadProfile();
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

  async function loadProfile() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('profiles')
        .select('full_name, phone')
        .eq('id', user.id)
        .single();
      if (data) setProfile({ ...data, email: user.email });
    } catch (error) {
      console.error('Error loading profile:', error);
    }
  }

  // Nav sections with grouping
  const navSections = [
    {
      label: 'Main',
      items: [
        { icon: '📊', label: 'Dashboard',    path: '/events/dashboard' },
        { icon: '➕', label: 'Create Event', path: '/events/create' },
      ],
    },
    {
      label: 'Insights',
      items: [
        { icon: '📈', label: 'Analytics',    path: '/events/analytics' },
      ],
    },
    {
      label: 'Account',
      items: [
        { icon: '🔔', label: 'Notifications', path: '/events/notifications', badge: unreadCount },
        { icon: '👤', label: 'Profile',        path: '/events/profile' },
        { icon: '⚙️', label: 'Settings',       path: '/events/settings' },
      ],
    },
  ];

  const handleNavClick = (path) => {
    router.push(path);
    if (isMobile) setIsMobileOpen(false);
  };

  const getInitials = (name) => {
    if (!name) return 'E';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  // Check if a nav item is active — exact match OR starts-with for nested routes
  const isActive = (itemPath) => {
    if (!pathname) return false;
    if (pathname === itemPath) return true;
    // For dashboard, only exact match to avoid matching /events/dashboard/... broadly
    if (itemPath === '/events/dashboard') return pathname === itemPath;
    return pathname.startsWith(itemPath + '/') || pathname.startsWith(itemPath);
  };

  const collapsed = !isMobile && isCollapsed;

  return (
    <>
      {isMobile && (
        <button
          className={styles.hamburger}
          onClick={() => setIsMobileOpen(v => !v)}
          aria-label={isMobileOpen ? 'Close menu' : 'Open menu'}
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
        />
      )}

      <aside className={[
        styles.sidebar,
        collapsed ? styles.collapsed : '',
        isMobile ? styles.mobile : '',
        isMobile && isMobileOpen ? styles.mobileOpen : '',
      ].filter(Boolean).join(' ')}>

        {/* Header */}
        <div className={styles.sidebarHeader}>
          {!collapsed ? (
            <>
              <div className={styles.logo}>
                <img src="/noq-logo_1.svg" alt="NoQ" className={styles.logoIcon} />
              </div>
              {!isMobile && (
                <button className={styles.collapseBtn} onClick={() => setIsCollapsed(true)} title="Collapse sidebar">
                  ←
                </button>
              )}
            </>
          ) : (
            <button className={styles.expandBtn} onClick={() => setIsCollapsed(false)} title="Expand sidebar">
              →
            </button>
          )}
        </div>

        {/* Profile */}
        {profile && !collapsed && (
          <div className={styles.profileSection}>
            <div className={styles.avatarContainer}>
              <div className={styles.avatarPlaceholder}>{getInitials(profile.full_name)}</div>
              <div className={styles.onlineDot} />
            </div>
            <div className={styles.profileInfo}>
              <div className={styles.profileName}>{profile.full_name || 'Organizer'}</div>
              <div className={styles.profileRole}>🎪 Event Organizer</div>
            </div>
          </div>
        )}

        {profile && collapsed && (
          <div className={styles.collapsedAvatar}>
            <div className={styles.avatarContainer}>
              <div className={styles.avatarPlaceholder}>{getInitials(profile.full_name)}</div>
              <div className={styles.onlineDot} />
            </div>
          </div>
        )}

        {/* Nav with sections */}
        <nav className={styles.nav}>
          {navSections.map((section) => (
            <div key={section.label} className={styles.navSection}>
              {!collapsed && (
                <div className={styles.navSectionLabel}>{section.label}</div>
              )}
              {section.items.map((item) => (
                <button
                  key={item.path}
                  onClick={() => handleNavClick(item.path)}
                  className={`${styles.navItem} ${isActive(item.path) ? styles.active : ''}`}
                  title={collapsed ? item.label : undefined}
                >
                  <span className={styles.navIcon}>{item.icon}</span>
                  {!collapsed && (
                    <>
                      <span className={styles.navLabel}>{item.label}</span>
                      {item.badge > 0 && (
                        <span className={styles.badge}>{item.badge > 99 ? '99+' : item.badge}</span>
                      )}
                    </>
                  )}
                  {collapsed && item.badge > 0 && (
                    <span className={styles.collapsedBadge} />
                  )}
                </button>
              ))}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className={styles.sidebarFooter}>
          {!collapsed && (
            <div className={styles.footerVersion}>NoQ Events v1.0</div>
          )}
          <button
            onClick={async () => { await supabase.auth.signOut(); router.push('/'); }}
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