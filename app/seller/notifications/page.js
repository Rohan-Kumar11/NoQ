'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '../../components/Sidebar';
import styles from './Notifications.module.css';
import { supabase } from '@/lib/supabase/client';
import { hasProductsFeature } from '@/lib/categoryConfig';
import toast from 'react-hot-toast';
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  deleteAllRead,
  subscribeToNotifications,
} from '@/lib/api/notifications';

export default function Notifications() {
  const router = useRouter();
  const [currentTime, setCurrentTime]       = useState(null);
  const [loading, setLoading]               = useState(true);
  const [notifications, setNotifications]   = useState([]);
  const [filter, setFilter]                 = useState('all');
  const [typeFilter, setTypeFilter]         = useState('all');
  const [mounted, setMounted]               = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isLive, setIsLive]                 = useState(false);

  // Refs to avoid stale closures in callbacks
  const filterRef    = useRef(filter);
  const typeFilterRef = useRef(typeFilter);
  useEffect(() => { filterRef.current    = filter;     }, [filter]);
  useEffect(() => { typeFilterRef.current = typeFilter; }, [typeFilter]);

  // ── Store type ─────────────────────────────────────────────────────────────
  const [hasProducts, setHasProducts] = useState(true);
  const isQueueOnly = !hasProducts;

  const [settings, setSettings] = useState({
    queueAlerts: {
      enabled: true,
      newToken: true,
      tokenApproaching: true,
      queueOverload: true,
      lowQueue: false,
    },
    reminderTiming: {
      enabled: true,
      beforeMinutes: 5,
      repeatReminder: true,
      repeatInterval: 3,
    },
    autoActions: {
      autoCallNext: false,
      autoCallDelay: 2,
      pauseOnOverload: true,
      overloadThreshold: 15,
    },
    delayMessages: {
      enabled: true,
      autoNotify: true,
      customMessage: 'Your order will be ready shortly. Thank you for your patience!',
    },
    channels: {
      sms: true,
      email: false,
      push: true,
      whatsapp: false,
    },
  });

  const [previewMessage, setPreviewMessage] = useState({ type: 'token_ready', show: false });

  const allTemplates = {
    token_ready: {
      title: 'Token Ready',
      message: 'Your token {{token_number}} is now being served. Please proceed to the counter.',
      preview: 'Your token A-045 is now being served. Please proceed to the counter.',
    },
    token_approaching: {
      title: 'Token Approaching',
      message: 'Your token {{token_number}} will be called in approximately {{minutes}} minutes.',
      preview: 'Your token A-045 will be called in approximately 5 minutes.',
    },
    order_ready: {
      title: 'Order Ready',
      message: 'Your order for token {{token_number}} is ready for pickup!',
      preview: 'Your order for token A-045 is ready for pickup!',
      productOnly: true,
    },
    delay_notification: {
      title: 'Slight Delay',
      message: settings.delayMessages.customMessage,
      preview: settings.delayMessages.customMessage,
      productOnly: true,
    },
    service_complete: {
      title: 'Service Complete',
      message: 'Your appointment for token {{token_number}} has been completed. Thank you for visiting!',
      preview: 'Your appointment for token A-045 has been completed. Thank you for visiting!',
      queueOnly: true,
    },
  };

  // ── loadNotifications (stable ref via useCallback) ─────────────────────────
  const loadNotifications = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const currentFilter     = filterRef.current;
      const currentTypeFilter = typeFilterRef.current;
      const filters = {};
      if (currentFilter === 'unread') filters.isRead = false;
      else if (currentFilter === 'read') filters.isRead = true;
      if (currentTypeFilter !== 'all') filters.type = currentTypeFilter;

      const result = await getNotifications(filters);
      if (result.success) {
        setNotifications(result.data);
      } else {
        if (!silent) toast.error(result.error || 'Failed to load notifications');
      }
    } catch (err) {
      console.error('Load notifications error:', err);
      if (!silent) toast.error('Failed to load notifications');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  // ── Load store type once ───────────────────────────────────────────────────
  useEffect(() => {
    async function loadStoreType() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: store } = await supabase
          .from('stores')
          .select('store_type')
          .eq('owner_id', user.id)
          .single();
        if (store) setHasProducts(hasProductsFeature(store.store_type || 'retail'));

        // Mark unread as read on load
        await supabase
          .from('notifications')
          .update({ is_read: true, read_at: new Date().toISOString() })
          .eq('user_id', user.id)
          .eq('is_read', false);
      } catch (err) {
        console.error('Failed to load store type:', err);
      }
    }
    loadStoreType();
  }, []);

  const templates = Object.fromEntries(
    Object.entries(allTemplates).filter(([, t]) => {
      if (t.productOnly && isQueueOnly) return false;
      if (t.queueOnly  && !isQueueOnly) return false;
      return true;
    })
  );

  // ── Reload on filter change ────────────────────────────────────────────────
  useEffect(() => {
    loadNotifications();
  }, [filter, typeFilter, loadNotifications]);

  useEffect(() => {
    setMounted(true);
    setCurrentTime(new Date());
  }, []);

  // ── Sidebar collapse detection ─────────────────────────────────────────────
  useEffect(() => {
    const check = () => {
      const sidebar = document.querySelector('[class*="sidebar"]');
      if (sidebar) setSidebarCollapsed(sidebar.className.includes('collapsed'));
    };
    check();
    const interval = setInterval(check, 100);
    return () => clearInterval(interval);
  }, []);

  // ── Real-time subscription + visibility-based refetch + polling fallback ──
  useEffect(() => {
    let cleanup;
    let pollInterval;

    async function setup() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // 1. Real-time Supabase subscription
      cleanup = subscribeToNotifications(user.id, (payload) => {
        setIsLive(true);
        if (payload.type === 'INSERT') {
          setNotifications(prev => [payload.notification, ...prev]);
          toast.success(payload.notification.title, { duration: 5000 });
        } else if (payload.type === 'UPDATE') {
          setNotifications(prev =>
            prev.map(n => n.id === payload.notification.id ? payload.notification : n)
          );
        } else if (payload.type === 'DELETE') {
          setNotifications(prev => prev.filter(n => n.id !== payload.notification.id));
        }
      });

      // Mark realtime as connected (optimistic)
      setIsLive(true);

      // 2. Polling fallback — refresh silently every 30 seconds
      //    catches edge cases where realtime drops or misses events
      pollInterval = setInterval(() => {
        loadNotifications(true); // silent = no loading spinner
      }, 30_000);
    }

    setup();

    // 3. Visibility change — refetch when user returns to tab
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadNotifications(true);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // 4. Window focus — also refetch when window regains focus
    const handleFocus = () => loadNotifications(true);
    window.addEventListener('focus', handleFocus);

    return () => {
      if (cleanup) cleanup();
      if (pollInterval) clearInterval(pollInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [loadNotifications]);

  // ── Clock ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const formatTime = (d) => !d ? '--:--:--' : d.toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
  });
  const formatDate = (d) => !d ? 'Loading...' : d.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  const formatNotificationTime = (timestamp) => {
    if (!timestamp) return 'Just now';
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return 'Invalid date';
    const diffMs    = Date.now() - date;
    if (diffMs < 0) return 'Just now';
    const diffMins  = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays  = Math.floor(diffMs / 86400000);
    if (diffMins < 1)    return 'Just now';
    if (diffMins === 1)  return '1 minute ago';
    if (diffMins < 60)   return `${diffMins} minutes ago`;
    if (diffHours === 1) return '1 hour ago';
    if (diffHours < 24)  return `${diffHours} hours ago`;
    if (diffDays === 1)  return '1 day ago';
    if (diffDays < 7)    return `${diffDays} days ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const handleMarkAsRead = async (id) => {
    const result = await markAsRead(id);
    if (result.success) {
      setNotifications(prev =>
        prev.map(n => n.id === id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n)
      );
    } else {
      toast.error(result.error || 'Failed to mark as read');
    }
  };

  const handleMarkAllAsRead = async () => {
    const result = await markAllAsRead();
    if (result.success) {
      toast.success('All notifications marked as read');
      loadNotifications();
    } else {
      toast.error(result.error || 'Failed to mark all as read');
    }
  };

  const handleDelete = async (id) => {
    const result = await deleteNotification(id);
    if (result.success) {
      setNotifications(prev => prev.filter(n => n.id !== id));
      toast.success('Notification deleted');
    } else {
      toast.error(result.error || 'Failed to delete notification');
    }
  };

  const handleDeleteAllRead = async () => {
    if (!window.confirm('Delete all read notifications?')) return;
    const result = await deleteAllRead();
    if (result.success) {
      toast.success('Read notifications deleted');
      loadNotifications();
    } else {
      toast.error(result.error || 'Failed to delete notifications');
    }
  };

  const handleViewDetails = async (notification) => {
    await handleMarkAsRead(notification.id);

    if (notification.action_url) {
      if (isQueueOnly && (
        notification.action_url.includes('/orders') ||
        notification.action_url.includes('/payments')
      )) {
        router.push('/seller/queue');
        return;
      }
      router.push(notification.action_url);
      return;
    }

    const type  = notification.type;
    const meta  = notification.metadata || {};
    const title = notification.title?.toLowerCase() || '';

    if (isQueueOnly) {
      if (type === 'queue' || title.includes('token') || title.includes('queue')) {
        router.push(meta.token_number ? `/seller/queue?token=${meta.token_number}` : '/seller/queue');
      } else {
        router.push('/seller/dashboard');
      }
      return;
    }

    switch (type) {
      case 'order':
        router.push(meta.order_id ? `/seller/orders?highlight=${meta.order_id}` : '/seller/orders');
        break;
      case 'queue':
        router.push(meta.token_number ? `/seller/queue?token=${meta.token_number}` : '/seller/queue');
        break;
      case 'payment':
        router.push(meta.transaction_id ? `/seller/payments?highlight=${meta.transaction_id}` : '/seller/payments');
        break;
      case 'inventory':
      case 'stock':
        router.push(meta.product_id ? `/seller/inventory?highlight=${meta.product_id}` : '/seller/inventory');
        break;
      case 'analytics':
      case 'report':
        router.push('/seller/analytics');
        break;
      default:
        if (title.includes('order'))   router.push('/seller/orders');
        else if (title.includes('queue') || title.includes('token')) router.push('/seller/queue');
        else if (title.includes('payment')) router.push('/seller/payments');
        else router.push('/seller/dashboard');
    }
  };

  const handleToggle = (section, field) =>
    setSettings(prev => ({ ...prev, [section]: { ...prev[section], [field]: !prev[section][field] } }));

  const handleNumberChange = (section, field, value) =>
    setSettings(prev => ({ ...prev, [section]: { ...prev[section], [field]: parseInt(value) || 0 } }));

  const handleTextChange = (section, field, value) =>
    setSettings(prev => ({ ...prev, [section]: { ...prev[section], [field]: value } }));

  const handlePreview = (type) => {
    setPreviewMessage({ type, show: true });
    setTimeout(() => setPreviewMessage({ type, show: false }), 5000);
  };

  const handleSaveSettings = () => toast.success('Notification settings saved successfully!');

  const getNotificationIcon = (type) => ({
    order: '📦', queue: '🎫', payment: '💰', success: '✅',
    warning: '⚠️', error: '❌', inventory: '📊', stock: '📦',
    customer: '👤', analytics: '📈'
  }[type] || 'ℹ️');

  const getNotificationColor = (type) => ({
    order: '#3b82f6', queue: '#8b5cf6', payment: '#10b981', success: '#22c55e',
    warning: '#f59e0b', error: '#ef4444', inventory: '#6366f1', stock: '#f59e0b',
    customer: '#14b8a6', analytics: '#8b5cf6'
  }[type] || '#6b7280');

  const unreadCount = notifications.filter(n => !n.is_read).length;

  if (!mounted) {
    return (
      <div className={styles.dashboard}>
        <Sidebar />
        <main className={styles.mainContent}>
          <div className={styles.loadingContainer}>
            <div className={styles.loader}></div>
            <p>Loading...</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={styles.dashboard}>
      <Sidebar />

      <main className={`${styles.mainContent} ${sidebarCollapsed ? styles.expanded : ''}`}>

        {/* ── Top Bar ── */}
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
              <span className={styles.liveIndicator}>
                <span className={styles.liveDot} />
                Live
              </span>
            )}
            <button className={styles.saveBtn} onClick={handleSaveSettings}>
              💾 Save Settings
            </button>
          </div>
        </header>

        {/* ── Preview Alert ── */}
        {previewMessage.show && (
          <div className={styles.previewAlert}>
            <div className={styles.previewHeader}>
              <span className={styles.previewIcon}>📱</span>
              <span className={styles.previewTitle}>
                Preview — {templates[previewMessage.type]?.title}
              </span>
            </div>
            <div className={styles.previewMessage}>
              {templates[previewMessage.type]?.preview}
            </div>
          </div>
        )}

        {/* ── Notifications List ── */}
        <div className={styles.notificationsSection}>
          <div className={styles.notificationsHeader}>
            <div className={styles.notificationsHeaderLeft}>
              <h2 className={styles.sectionTitle}>
                Recent Notifications
                {unreadCount > 0 && (
                  <span className={styles.unreadBadge}>{unreadCount} unread</span>
                )}
              </h2>
            </div>
            <div className={styles.notificationsActions}>
              <select
                className={styles.filterSelect}
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
              >
                <option value="all">All Types</option>
                {!isQueueOnly && <option value="order">Orders</option>}
                <option value="queue">Queue</option>
                {!isQueueOnly && <option value="payment">Payments</option>}
                <option value="info">Info</option>
                <option value="warning">Warnings</option>
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

              {unreadCount > 0 && (
                <button className={styles.markAllBtn} onClick={handleMarkAllAsRead}>
                  ✓ Mark All Read
                </button>
              )}
              <button className={styles.deleteAllBtn} onClick={handleDeleteAllRead}>
                🗑️ Clear Read
              </button>
            </div>
          </div>

          <div className={styles.notificationsList}>
            {loading ? (
              <div className={styles.loadingContainer}>
                <div className={styles.loader}></div>
                <p>Loading notifications...</p>
              </div>
            ) : notifications.length === 0 ? (
              <div className={styles.emptyNotifications}>
                <div className={styles.emptyIcon}>🔔</div>
                <h3>No notifications</h3>
                <p>You're all caught up! New notifications will appear here.</p>
              </div>
            ) : (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`${styles.notificationCard} ${!notification.is_read ? styles.notificationUnread : ''}`}
                  style={{ borderLeftColor: getNotificationColor(notification.type) }}
                >
                  <div className={styles.notificationIcon}>
                    {getNotificationIcon(notification.type)}
                  </div>
                  <div className={styles.notificationContent}>
                    <div className={styles.notificationHeader}>
                      <h3 className={styles.notificationTitle}>{notification.title}</h3>
                      <span className={styles.notificationTime}>
                        {formatNotificationTime(notification.created_at)}
                      </span>
                    </div>
                    <p className={styles.notificationMessage}>{notification.message}</p>
                    <button
                      className={styles.notificationAction}
                      onClick={() => handleViewDetails(notification)}
                    >
                      View Details →
                    </button>
                  </div>
                  <div className={styles.notificationActions}>
                    {!notification.is_read && (
                      <button
                        className={styles.notificationBtn}
                        onClick={() => handleMarkAsRead(notification.id)}
                        title="Mark as read"
                      >✓</button>
                    )}
                    <button
                      className={styles.notificationBtnDelete}
                      onClick={() => handleDelete(notification.id)}
                      title="Delete"
                    >🗑️</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ── Settings Grid ── */}
        <div className={styles.settingsGrid}>

          <div className={styles.settingsCard}>
            <div className={styles.cardHeader}>
              <div className={styles.cardHeaderLeft}>
                <span className={styles.cardIcon}>🔔</span>
                <h2 className={styles.cardTitle}>Queue Alerts</h2>
              </div>
              <label className={styles.toggleLabel}>
                <input type="checkbox" checked={settings.queueAlerts.enabled}
                  onChange={() => handleToggle('queueAlerts', 'enabled')} className={styles.toggleInput} />
                <span className={styles.toggleSlider}></span>
              </label>
            </div>
            <div className={styles.cardBody}>
              {[
                { field: 'newToken',        label: 'New Token Issued',       desc: 'Notify customers when their token is generated' },
                { field: 'tokenApproaching',label: 'Token Approaching',      desc: "Alert when customer's turn is coming up" },
                { field: 'queueOverload',   label: 'Queue Overload Warning', desc: 'Alert staff when queue exceeds capacity' },
                { field: 'lowQueue',        label: 'Low Queue Alert',        desc: 'Notify when queue is running low (less than 3)' },
              ].map(({ field, label, desc }) => (
                <div key={field} className={styles.settingItem}>
                  <div className={styles.settingInfo}>
                    <div className={styles.settingLabel}>{label}</div>
                    <div className={styles.settingDescription}>{desc}</div>
                  </div>
                  <label className={styles.toggleLabel}>
                    <input type="checkbox" checked={settings.queueAlerts[field]}
                      onChange={() => handleToggle('queueAlerts', field)}
                      disabled={!settings.queueAlerts.enabled} className={styles.toggleInput} />
                    <span className={styles.toggleSlider}></span>
                  </label>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.settingsCard}>
            <div className={styles.cardHeader}>
              <div className={styles.cardHeaderLeft}>
                <span className={styles.cardIcon}>⏰</span>
                <h2 className={styles.cardTitle}>Reminder Timing</h2>
              </div>
              <label className={styles.toggleLabel}>
                <input type="checkbox" checked={settings.reminderTiming.enabled}
                  onChange={() => handleToggle('reminderTiming', 'enabled')} className={styles.toggleInput} />
                <span className={styles.toggleSlider}></span>
              </label>
            </div>
            <div className={styles.cardBody}>
              <div className={styles.settingItem}>
                <div className={styles.settingInfo}>
                  <div className={styles.settingLabel}>Advance Notice</div>
                  <div className={styles.settingDescription}>How many minutes before to send reminder</div>
                </div>
                <div className={styles.numberInput}>
                  <input type="number" value={settings.reminderTiming.beforeMinutes}
                    onChange={(e) => handleNumberChange('reminderTiming', 'beforeMinutes', e.target.value)}
                    disabled={!settings.reminderTiming.enabled} min="1" max="30" className={styles.inputField} />
                  <span className={styles.inputUnit}>min</span>
                </div>
              </div>
              <div className={styles.settingItem}>
                <div className={styles.settingInfo}>
                  <div className={styles.settingLabel}>Repeat Reminder</div>
                  <div className={styles.settingDescription}>Send additional reminders if customer doesn't respond</div>
                </div>
                <label className={styles.toggleLabel}>
                  <input type="checkbox" checked={settings.reminderTiming.repeatReminder}
                    onChange={() => handleToggle('reminderTiming', 'repeatReminder')}
                    disabled={!settings.reminderTiming.enabled} className={styles.toggleInput} />
                  <span className={styles.toggleSlider}></span>
                </label>
              </div>
              {settings.reminderTiming.repeatReminder && (
                <div className={styles.settingItem}>
                  <div className={styles.settingInfo}>
                    <div className={styles.settingLabel}>Repeat Interval</div>
                    <div className={styles.settingDescription}>Time between repeated reminders</div>
                  </div>
                  <div className={styles.numberInput}>
                    <input type="number" value={settings.reminderTiming.repeatInterval}
                      onChange={(e) => handleNumberChange('reminderTiming', 'repeatInterval', e.target.value)}
                      disabled={!settings.reminderTiming.enabled} min="1" max="10" className={styles.inputField} />
                    <span className={styles.inputUnit}>min</span>
                  </div>
                </div>
              )}
              <button className={styles.previewBtn}
                onClick={() => handlePreview('token_approaching')}
                disabled={!settings.reminderTiming.enabled}>
                👁️ Preview Reminder
              </button>
            </div>
          </div>

          <div className={styles.settingsCard}>
            <div className={styles.cardHeader}>
              <div className={styles.cardHeaderLeft}>
                <span className={styles.cardIcon}>⚡</span>
                <h2 className={styles.cardTitle}>Auto Actions</h2>
              </div>
            </div>
            <div className={styles.cardBody}>
              <div className={styles.settingItem}>
                <div className={styles.settingInfo}>
                  <div className={styles.settingLabel}>Auto-Call Next Token</div>
                  <div className={styles.settingDescription}>Automatically call next customer after serving current</div>
                </div>
                <label className={styles.toggleLabel}>
                  <input type="checkbox" checked={settings.autoActions.autoCallNext}
                    onChange={() => handleToggle('autoActions', 'autoCallNext')} className={styles.toggleInput} />
                  <span className={styles.toggleSlider}></span>
                </label>
              </div>
              {settings.autoActions.autoCallNext && (
                <div className={styles.settingItem}>
                  <div className={styles.settingInfo}>
                    <div className={styles.settingLabel}>Auto-Call Delay</div>
                    <div className={styles.settingDescription}>Wait time before calling next token</div>
                  </div>
                  <div className={styles.numberInput}>
                    <input type="number" value={settings.autoActions.autoCallDelay}
                      onChange={(e) => handleNumberChange('autoActions', 'autoCallDelay', e.target.value)}
                      min="0" max="10" className={styles.inputField} />
                    <span className={styles.inputUnit}>min</span>
                  </div>
                </div>
              )}
              <div className={styles.settingItem}>
                <div className={styles.settingInfo}>
                  <div className={styles.settingLabel}>Pause on Overload</div>
                  <div className={styles.settingDescription}>Automatically pause queue when it exceeds threshold</div>
                </div>
                <label className={styles.toggleLabel}>
                  <input type="checkbox" checked={settings.autoActions.pauseOnOverload}
                    onChange={() => handleToggle('autoActions', 'pauseOnOverload')} className={styles.toggleInput} />
                  <span className={styles.toggleSlider}></span>
                </label>
              </div>
              {settings.autoActions.pauseOnOverload && (
                <div className={styles.settingItem}>
                  <div className={styles.settingInfo}>
                    <div className={styles.settingLabel}>Overload Threshold</div>
                    <div className={styles.settingDescription}>Maximum queue size before auto-pause</div>
                  </div>
                  <div className={styles.numberInput}>
                    <input type="number" value={settings.autoActions.overloadThreshold}
                      onChange={(e) => handleNumberChange('autoActions', 'overloadThreshold', e.target.value)}
                      min="5" max="50" className={styles.inputField} />
                    <span className={styles.inputUnit}>tokens</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {!isQueueOnly && (
            <div className={styles.settingsCard}>
              <div className={styles.cardHeader}>
                <div className={styles.cardHeaderLeft}>
                  <span className={styles.cardIcon}>💬</span>
                  <h2 className={styles.cardTitle}>Delay Messages</h2>
                </div>
                <label className={styles.toggleLabel}>
                  <input type="checkbox" checked={settings.delayMessages.enabled}
                    onChange={() => handleToggle('delayMessages', 'enabled')} className={styles.toggleInput} />
                  <span className={styles.toggleSlider}></span>
                </label>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.settingItem}>
                  <div className={styles.settingInfo}>
                    <div className={styles.settingLabel}>Auto-Notify on Delay</div>
                    <div className={styles.settingDescription}>Automatically send message when order is delayed</div>
                  </div>
                  <label className={styles.toggleLabel}>
                    <input type="checkbox" checked={settings.delayMessages.autoNotify}
                      onChange={() => handleToggle('delayMessages', 'autoNotify')}
                      disabled={!settings.delayMessages.enabled} className={styles.toggleInput} />
                    <span className={styles.toggleSlider}></span>
                  </label>
                </div>
                <div className={styles.textInputWrapper}>
                  <label className={styles.textLabel}>Custom Delay Message</label>
                  <textarea value={settings.delayMessages.customMessage}
                    onChange={(e) => handleTextChange('delayMessages', 'customMessage', e.target.value)}
                    disabled={!settings.delayMessages.enabled}
                    className={styles.textArea} rows={4}
                    placeholder="Enter custom message for delays..." />
                  <div className={styles.charCount}>
                    {settings.delayMessages.customMessage.length} / 200 characters
                  </div>
                </div>
                <button className={styles.previewBtn}
                  onClick={() => handlePreview('delay_notification')}
                  disabled={!settings.delayMessages.enabled}>
                  👁️ Preview Message
                </button>
              </div>
            </div>
          )}

          <div className={styles.settingsCard}>
            <div className={styles.cardHeader}>
              <div className={styles.cardHeaderLeft}>
                <span className={styles.cardIcon}>📱</span>
                <h2 className={styles.cardTitle}>Notification Channels</h2>
              </div>
            </div>
            <div className={styles.cardBody}>
              <div className={styles.channelGrid}>
                {[
                  { key: 'sms',      icon: '📱', name: 'SMS' },
                  { key: 'email',    icon: '📧', name: 'Email' },
                  { key: 'push',     icon: '🔔', name: 'Push' },
                  { key: 'whatsapp', icon: '💬', name: 'WhatsApp' },
                ].map(({ key, icon, name }) => (
                  <div key={key}
                    className={`${styles.channelCard} ${settings.channels[key] ? styles.channelActive : ''}`}>
                    <div className={styles.channelIcon}>{icon}</div>
                    <div className={styles.channelName}>{name}</div>
                    <label className={styles.toggleLabel}>
                      <input type="checkbox" checked={settings.channels[key]}
                        onChange={() => handleToggle('channels', key)} className={styles.toggleInput} />
                      <span className={styles.toggleSlider}></span>
                    </label>
                    <div className={styles.channelStatus}>
                      {settings.channels[key] ? 'Active' : 'Inactive'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className={`${styles.settingsCard} ${styles.templatesCard}`}>
            <div className={styles.cardHeader}>
              <div className={styles.cardHeaderLeft}>
                <span className={styles.cardIcon}>📄</span>
                <h2 className={styles.cardTitle}>Notification Templates</h2>
              </div>
            </div>
            <div className={styles.cardBody}>
              <div className={styles.templatesList}>
                {Object.entries(templates).map(([key, template]) => (
                  <div key={key} className={styles.templateItem}>
                    <div className={styles.templateInfo}>
                      <div className={styles.templateTitle}>{template.title}</div>
                      <div className={styles.templateMessage}>{template.message}</div>
                    </div>
                    <button className={styles.templateBtn} onClick={() => handlePreview(key)}>
                      👁️ Preview
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Info Section ── */}
        <div className={styles.infoSection}>
          <div className={styles.infoCard}>
            <div className={styles.infoIcon}>💡</div>
            <div className={styles.infoContent}>
              <div className={styles.infoTitle}>Pro Tips</div>
              <ul className={styles.infoList}>
                <li>Enable SMS and Push notifications for best customer reach</li>
                <li>Set advance notice to 5–10 minutes for optimal timing</li>
                <li>Use auto-pause on overload during peak hours</li>
                {!isQueueOnly && (
                  <li>Delay messages keep customers informed when orders run late</li>
                )}
                <li>Notifications update live — the green dot confirms your connection is active</li>
              </ul>
            </div>
          </div>
        </div>

      </main>
    </div>
  );
}