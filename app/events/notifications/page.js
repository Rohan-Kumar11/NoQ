'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { useNotifications } from '@/app/context/NotificationContext';
import toast from 'react-hot-toast';
import EventSidebar from '../../components/EventSidebar';
import styles from './EventNotifications.module.css';
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  deleteAllRead,
  subscribeToNotifications,
} from '@/lib/api/notifications';

export default function EventNotifications() {
  const router = useRouter();
  const { unreadCount, refreshUnread } = useNotifications();

  const [mounted, setMounted] = useState(false);
  const [currentTime, setCurrentTime] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState([]);
  const [filter, setFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [isLive, setIsLive] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const filterRef = useRef(filter);
  const typeFilterRef = useRef(typeFilter);
  useEffect(() => { filterRef.current = filter; }, [filter]);
  useEffect(() => { typeFilterRef.current = typeFilter; }, [typeFilter]);

  // Sidebar collapse detection
  useEffect(() => {
    const check = () => {
      const sidebar = document.querySelector('[class*="sidebar"]');
      if (sidebar) setIsSidebarCollapsed(sidebar.className.includes('collapsed'));
    };
    check();
    const observer = new MutationObserver(check);
    const sidebar = document.querySelector('[class*="sidebar"]');
    if (sidebar) observer.observe(sidebar, { attributes: true, attributeFilter: ['class'] });
    window.addEventListener('resize', check);
    return () => { observer.disconnect(); window.removeEventListener('resize', check); };
  }, []);

  // Clock
  useEffect(() => {
    setMounted(true);
    setCurrentTime(new Date());
    const t = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const formatTime = (d) => !d ? '--:--:--' : d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  const formatDate = (d) => !d ? 'Loading...' : d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const formatRelativeTime = (ts) => {
    if (!ts) return 'Just now';
    const diff = Date.now() - new Date(ts);
    if (diff < 0) return 'Just now';
    const m = Math.floor(diff / 60000);
    const h = Math.floor(diff / 3600000);
    const d = Math.floor(diff / 86400000);
    if (m < 1) return 'Just now';
    if (m < 60) return `${m}m ago`;
    if (h < 24) return `${h}h ago`;
    if (d < 7) return `${d}d ago`;
    return new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  };

  const loadNotifications = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const filters = {};
      if (filterRef.current === 'unread') filters.isRead = false;
      else if (filterRef.current === 'read') filters.isRead = true;
      if (typeFilterRef.current !== 'all') filters.type = typeFilterRef.current;

      const result = await getNotifications(filters);
      if (result.success) {
        setNotifications(result.data);
      } else if (!silent) {
        toast.error(result.error || 'Failed to load notifications');
      }
    } catch (err) {
      if (!silent) toast.error('Failed to load notifications');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { loadNotifications(); }, [filter, typeFilter, loadNotifications]);

  // Mark all as read when landing on this page
  useEffect(() => {
    const markRead = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .eq('is_read', false);
      refreshUnread?.();
    };
    markRead();
  }, [refreshUnread]);

  // Realtime + polling
  useEffect(() => {
    let cleanup;
    let pollInterval;

    async function setup() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      cleanup = subscribeToNotifications(user.id, (payload) => {
        setIsLive(true);
        if (payload.type === 'INSERT') {
          setNotifications(prev => [payload.notification, ...prev]);
          toast.success(payload.notification.title, { duration: 5000 });
        } else if (payload.type === 'UPDATE') {
          setNotifications(prev => prev.map(n => n.id === payload.notification.id ? payload.notification : n));
        } else if (payload.type === 'DELETE') {
          setNotifications(prev => prev.filter(n => n.id !== payload.notification.id));
        }
      });

      setIsLive(true);
      pollInterval = setInterval(() => loadNotifications(true), 30_000);
    }

    setup();

    const onVisible = () => { if (document.visibilityState === 'visible') loadNotifications(true); };
    const onFocus = () => loadNotifications(true);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);

    return () => {
      cleanup?.();
      clearInterval(pollInterval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
    };
  }, [loadNotifications]);

  const handleMarkAsRead = async (id) => {
    const result = await markAsRead(id);
    if (result.success) {
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
      refreshUnread?.();
    } else {
      toast.error('Failed to mark as read');
    }
  };

  const handleMarkAllAsRead = async () => {
    const result = await markAllAsRead();
    if (result.success) {
      toast.success('All marked as read');
      loadNotifications();
      refreshUnread?.();
    } else {
      toast.error('Failed');
    }
  };

  const handleDelete = async (id) => {
    const result = await deleteNotification(id);
    if (result.success) {
      setNotifications(prev => prev.filter(n => n.id !== id));
      toast.success('Deleted');
    } else {
      toast.error('Failed to delete');
    }
  };

  const handleDeleteAllRead = async () => {
    if (!confirm('Delete all read notifications?')) return;
    const result = await deleteAllRead();
    if (result.success) {
      toast.success('Read notifications cleared');
      loadNotifications();
    } else {
      toast.error('Failed');
    }
  };

  const handleViewDetails = async (notification) => {
    await handleMarkAsRead(notification.id);

    if (notification.action_url) {
      router.push(notification.action_url);
      return;
    }

    const type = notification.type;
    const meta = notification.metadata || {};

    switch (type) {
      case 'event_queue_joined':
      case 'event_your_turn':
      case 'event_served':
        router.push(meta.event_id ? `/events/${meta.event_id}/manage` : '/events/dashboard');
        break;
      case 'event_registered':
      case 'event_cancelled':
        router.push(meta.event_id ? `/events/${meta.event_id}/manage` : '/events/dashboard');
        break;
      default:
        router.push('/events/dashboard');
    }
  };

  const getNotificationIcon = (type) => {
    const map = {
      event_queue_joined: '🎫',
      event_your_turn: '🔔',
      event_served: '✅',
      event_registered: '🎉',
      event_cancelled: '❌',
      order: '📦',
      queue: '🎫',
      payment: '💰',
      warning: '⚠️',
      error: '❌',
    };
    return map[type] || 'ℹ️';
  };

  const getNotificationAccent = (type) => {
    const map = {
      event_queue_joined: '#8b5cf6',
      event_your_turn: '#f59e0b',
      event_served: '#10b981',
      event_registered: '#3b82f6',
      event_cancelled: '#ef4444',
      queue: '#8b5cf6',
      warning: '#f59e0b',
      error: '#ef4444',
    };
    return map[type] || '#6b7280';
  };

  const unread = notifications.filter(n => !n.is_read).length;

  if (!mounted) {
    return (
      <div className={styles.page}>
        <EventSidebar />
        <main className={styles.main}>
          <div className={styles.loadingWrap}>
            <div className={styles.loader} />
            <p>Loading...</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <EventSidebar />

      <main className={`${styles.main} ${isSidebarCollapsed ? styles.mainExpanded : ''}`}>

        {/* Top Bar */}
        <header className={styles.topBar}>
          <div className={styles.topBarLeft}>
            <h1 className={styles.pageTitle}>Notifications</h1>
            <div className={styles.dateTime}>
              <div className={styles.date}>{formatDate(currentTime)}</div>
              <div className={styles.time}>{formatTime(currentTime)}</div>
            </div>
          </div>
          <div className={styles.topBarRight}>
            {isLive && (
              <span className={styles.livePill}>
                <span className={styles.liveDot} />
                Live
              </span>
            )}
            <button className={styles.backBtn} onClick={() => router.push('/events/dashboard')}>
              ← Dashboard
            </button>
          </div>
        </header>

        {/* Stats row */}
        <div className={styles.statsRow}>
          <div className={styles.statCard}>
            <div className={styles.statIcon}>🔔</div>
            <div>
              <div className={styles.statVal}>{notifications.length}</div>
              <div className={styles.statLabel}>Total</div>
            </div>
          </div>
          <div className={`${styles.statCard} ${unread > 0 ? styles.statCardUnread : ''}`}>
            <div className={styles.statIcon}>📩</div>
            <div>
              <div className={styles.statVal}>{unread}</div>
              <div className={styles.statLabel}>Unread</div>
            </div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statIcon}>🎫</div>
            <div>
              <div className={styles.statVal}>{notifications.filter(n => n.type?.startsWith('event')).length}</div>
              <div className={styles.statLabel}>Event alerts</div>
            </div>
          </div>
        </div>

        {/* Notifications Section */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionHeaderLeft}>
              <h2 className={styles.sectionTitle}>
                Recent Notifications
                {unread > 0 && <span className={styles.unreadBadge}>{unread} unread</span>}
              </h2>
            </div>
            <div className={styles.sectionActions}>
              <select
                className={styles.filterSelect}
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
              >
                <option value="all">All Types</option>
                <option value="event_queue_joined">Queue Joined</option>
                <option value="event_your_turn">Your Turn</option>
                <option value="event_served">Served</option>
                <option value="event_registered">Registered</option>
                <option value="event_cancelled">Cancelled</option>
              </select>

              <select
                className={styles.filterSelect}
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="all">All</option>
                <option value="unread">Unread</option>
                <option value="read">Read</option>
              </select>

              {unread > 0 && (
                <button className={styles.markAllBtn} onClick={handleMarkAllAsRead}>
                  ✓ Mark All Read
                </button>
              )}
              <button className={styles.clearBtn} onClick={handleDeleteAllRead}>
                🗑️ Clear Read
              </button>
            </div>
          </div>

          <div className={styles.notificationsList}>
            {loading ? (
              <div className={styles.loadingWrap}>
                <div className={styles.loader} />
                <p>Loading notifications...</p>
              </div>
            ) : notifications.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>🔔</div>
                <h3>No notifications yet</h3>
                <p>When attendees join your events or queues update, you'll see alerts here.</p>
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={`${styles.notifCard} ${!n.is_read ? styles.notifUnread : ''}`}
                  style={{ borderLeftColor: getNotificationAccent(n.type) }}
                >
                  <div className={styles.notifIcon}>{getNotificationIcon(n.type)}</div>

                  <div className={styles.notifContent}>
                    <div className={styles.notifHeader}>
                      <h3 className={styles.notifTitle}>{n.title}</h3>
                      <span className={styles.notifTime}>{formatRelativeTime(n.created_at)}</span>
                    </div>
                    <p className={styles.notifMessage}>{n.message}</p>
                    <button className={styles.notifAction} onClick={() => handleViewDetails(n)}>
                      View Details →
                    </button>
                  </div>

                  <div className={styles.notifControls}>
                    {!n.is_read && (
                      <button className={styles.readBtn} onClick={() => handleMarkAsRead(n.id)} title="Mark as read">
                        ✓
                      </button>
                    )}
                    <button className={styles.deleteBtn} onClick={() => handleDelete(n.id)} title="Delete">
                      🗑️
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Info card */}
        <div className={styles.infoCard}>
          <div className={styles.infoIcon}>💡</div>
          <div>
            <div className={styles.infoTitle}>How event notifications work</div>
            <ul className={styles.infoList}>
              <li>When an attendee joins your queue, you get a real-time alert instantly.</li>
              <li>When you call a token, the attendee is notified it's their turn.</li>
              <li>All cancellations and registrations are tracked here for easy review.</li>
              <li>The green Live dot confirms your real-time connection is active.</li>
            </ul>
          </div>
        </div>

      </main>
    </div>
  );
}