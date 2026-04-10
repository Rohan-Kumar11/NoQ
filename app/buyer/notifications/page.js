// app/buyer/notifications/page.jsx - COMPLETE FIXED VERSION
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Bell, 
  BellOff, 
  Clock, 
  CheckCircle, 
  AlertCircle, 
  Package, 
  Store, 
  TrendingUp, 
  Settings, 
  ChevronLeft, 
  X,
  Loader2,
  Trash2,
  ShoppingBag,
  XCircle
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import toast from 'react-hot-toast';
import './Notifications.css';

export default function Notifications() {
  const router = useRouter();
  
  // State
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [filter, setFilter] = useState('all');
  const [showSettings, setShowSettings] = useState(false);
  const [markingRead, setMarkingRead] = useState(false);
  
  // Notification settings from localStorage
  const [notificationSettings, setNotificationSettings] = useState({
    queueAlerts: true,
    orderUpdates: true,
    promotions: true,
    systemAlerts: true,
    sound: true,
    vibrate: true
  });

  useEffect(() => {
    initializePage();
    loadSettings();
  }, []);

  // Real-time subscription
  useEffect(() => {
    if (!currentUser) return;

    const channel = supabase
      .channel('notifications-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${currentUser.id}`
        },
        (payload) => {
          console.log('Notification change:', payload);
          
          if (payload.eventType === 'INSERT') {
            // New notification received
            const newNotif = payload.new;
            setNotifications(prev => [newNotif, ...prev]);
            
            // Show toast notification
            if (notificationSettings.sound) {
              playNotificationSound();
            }
            
            toast.success(newNotif.title, {
              icon: getNotificationIconElement(newNotif.type),
              duration: 4000
            });
          } else if (payload.eventType === 'UPDATE') {
            // Notification updated
            setNotifications(prev =>
              prev.map(n => n.id === payload.new.id ? payload.new : n)
            );
          } else if (payload.eventType === 'DELETE') {
            // Notification deleted
            setNotifications(prev =>
              prev.filter(n => n.id !== payload.old.id)
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser, notificationSettings]);

  const initializePage = async () => {
    try {
      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      if (userError) throw userError;
      
      if (!user) {
        toast.error('Please login to view notifications');
        router.push('/auth/signin');
        return;
      }
      
      console.log('Current user:', user.id);
      setCurrentUser(user);
      await loadNotifications(user.id);
    } catch (error) {
      console.error('Error initializing page:', error);
      toast.error('Failed to load notifications');
    } finally {
      setLoading(false);
    }
  };

  const loadNotifications = async (userId) => {
    try {
      console.log('Fetching notifications for user:', userId);

      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('Notifications fetch error:', error);
        throw error;
      }

      console.log('Fetched notifications:', data);
      setNotifications(data || []);
    } catch (error) {
      console.error('Error loading notifications:', error);
      toast.error('Failed to load notifications');
    }
  };

  const loadSettings = () => {
    const saved = localStorage.getItem('notificationSettings');
    if (saved) {
      setNotificationSettings(JSON.parse(saved));
    }
  };

  const saveSettings = () => {
    localStorage.setItem('notificationSettings', JSON.stringify(notificationSettings));
    toast.success('Settings saved');
    setShowSettings(false);
  };

  const markAsRead = async (notificationId) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ 
          is_read: true,
          read_at: new Date().toISOString()
        })
        .eq('id', notificationId);

      if (error) throw error;

      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, is_read: true, read_at: new Date().toISOString() } : n)
      );
    } catch (error) {
      console.error('Error marking as read:', error);
    }
  };

  const markAllAsRead = async () => {
    if (!currentUser) return;
    
    setMarkingRead(true);
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ 
          is_read: true,
          read_at: new Date().toISOString()
        })
        .eq('user_id', currentUser.id)
        .eq('is_read', false);

      if (error) throw error;

      setNotifications(prev =>
        prev.map(n => ({ ...n, is_read: true, read_at: new Date().toISOString() }))
      );
      
      toast.success('All notifications marked as read');
    } catch (error) {
      console.error('Error marking all as read:', error);
      toast.error('Failed to mark all as read');
    } finally {
      setMarkingRead(false);
    }
  };

  const deleteNotification = async (notificationId) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', notificationId);

      if (error) throw error;

      setNotifications(prev => prev.filter(n => n.id !== notificationId));
      toast.success('Notification deleted');
    } catch (error) {
      console.error('Error deleting notification:', error);
      toast.error('Failed to delete notification');
    }
  };

  const handleNotificationClick = async (notification) => {
    // Mark as read
    if (!notification.is_read) {
      await markAsRead(notification.id);
    }

    // Navigate based on action_url
    if (notification.action_url) {
      router.push(notification.action_url);
    }
  };

  // FIXED: Enhanced notification icon mapping
  const getNotificationIcon = (type) => {
    if (!type) return <Bell className="w-6 h-6" />;
    
    const typeStr = type.toLowerCase();
    
    // Order accepted
    if (typeStr.includes('accept')) {
      return <CheckCircle className="w-6 h-6" />;
    }
    
    // Order ready for pickup
    if (typeStr.includes('ready')) {
      return <Package className="w-6 h-6" />;
    }
    
    // Order completed
    if (typeStr.includes('complet')) {
      return <CheckCircle className="w-6 h-6" />;
    }
    
    // Order cancelled
    if (typeStr.includes('cancel')) {
      return <XCircle className="w-6 h-6" />;
    }
    
    // Queue/Token related
    if (typeStr.includes('queue') || typeStr.includes('token') || typeStr.includes('wait')) {
      return <Clock className="w-6 h-6" />;
    }
    
    // General order updates
    if (typeStr.includes('order')) {
      return <ShoppingBag className="w-6 h-6" />;
    }
    
    // Promotions
    if (typeStr.includes('promotion') || typeStr.includes('offer')) {
      return <TrendingUp className="w-6 h-6" />;
    }
    
    // Store updates
    if (typeStr.includes('store')) {
      return <Store className="w-6 h-6" />;
    }
    
    // Time updates
    if (typeStr.includes('time')) {
      return <Clock className="w-6 h-6" />;
    }
    
    return <Bell className="w-6 h-6" />;
  };

  // For toast notifications (returns string emoji)
  const getNotificationIconElement = (type) => {
    if (!type) return '🔔';
    
    const typeStr = type.toLowerCase();
    if (typeStr.includes('accept')) return '✅';
    if (typeStr.includes('ready')) return '🎉';
    if (typeStr.includes('complet')) return '✅';
    if (typeStr.includes('cancel')) return '❌';
    if (typeStr.includes('token')) return '🎫';
    if (typeStr.includes('order')) return '📦';
    
    return '🔔';
  };

  // FIXED: Better type classification for styling
  const getNotificationType = (type) => {
    if (!type) return 'info';
    
    const typeStr = type.toLowerCase();
    
    // Urgent notifications
    if (typeStr.includes('urgent') || 
        typeStr.includes('cancel') || 
        typeStr.includes('reject')) {
      return 'urgent';
    }
    
    // Success notifications
    if (typeStr.includes('accept') || 
        typeStr.includes('ready') || 
        typeStr.includes('complet')) {
      return 'success';
    }
    
    return 'info';
  };

  // FIXED: Enhanced category mapping
  const getNotificationCategory = (type) => {
    if (!type) return 'other';
    
    const typeStr = type.toLowerCase();
    
    // Queue-related notifications
    if (typeStr.includes('queue') || 
        typeStr.includes('token') || 
        typeStr.includes('wait')) {
      return 'queue';
    }
    
    // Order-related notifications (broader matching)
    if (typeStr.includes('order') || 
        typeStr.includes('accept') || 
        typeStr.includes('ready') || 
        typeStr.includes('complet') || 
        typeStr.includes('cancel') ||
        typeStr.includes('prepar') ||
        typeStr.includes('time')) {
      return 'order';
    }
    
    // Promotion/offers
    if (typeStr.includes('promotion') || 
        typeStr.includes('offer') || 
        typeStr.includes('discount') ||
        typeStr.includes('deal')) {
      return 'promotion';
    }
    
    // Store updates
    if (typeStr.includes('store') || 
        typeStr.includes('announce')) {
      return 'store';
    }
    
    return 'other';
  };

  const playNotificationSound = () => {
    if (typeof Audio !== 'undefined') {
      try {
        const audio = new Audio('/notification.mp3');
        audio.play().catch(e => console.log('Audio play failed:', e));
      } catch (e) {
        console.log('Audio not available:', e);
      }
    }
  };

  const getTypeClass = (type) => {
    const notifType = getNotificationType(type);
    switch (notifType) {
      case 'urgent': return 'notif-urgent';
      case 'success': return 'notif-success';
      default: return 'notif-info';
    }
  };

  const formatTimeAgo = (dateString) => {
    if (!dateString) return 'Just now';
    
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // NEW: Calculate estimated ready time for preparing orders
  const getEstimatedReadyTime = (notification) => {
    if (!notification.metadata) return null;
    
    const metadata = notification.metadata;
    
    // If order is preparing, calculate ready time
    if (metadata.order_status === 'preparing' && metadata.preparation_time) {
      const createdAt = new Date(notification.created_at);
      const prepTime = metadata.preparation_time || 15;
      const readyTime = new Date(createdAt.getTime() + prepTime * 60000);
      const now = new Date();
      const minutesLeft = Math.max(0, Math.floor((readyTime - now) / 60000));
      
      return {
        time: readyTime.toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit' 
        }),
        minutesLeft: minutesLeft,
        isPast: minutesLeft === 0
      };
    }
    
    return null;
  };

  // Calculate categories
  const categories = [
    { id: 'all', name: 'All', count: notifications.length },
    { 
      id: 'queue', 
      name: 'Queue', 
      count: notifications.filter(n => getNotificationCategory(n.type) === 'queue').length 
    },
    { 
      id: 'order', 
      name: 'Orders', 
      count: notifications.filter(n => getNotificationCategory(n.type) === 'order').length 
    },
    { 
      id: 'promotion', 
      name: 'Offers', 
      count: notifications.filter(n => getNotificationCategory(n.type) === 'promotion').length 
    }
  ];

  const filteredNotifications = filter === 'all'
    ? notifications
    : notifications.filter(n => getNotificationCategory(n.type) === filter);

  const unreadCount = notifications.filter(n => !n.is_read).length;

  if (loading) {
    return (
      <div className="notifications-container">
        <div className="notifications-loading">
          <Loader2 className="notifications-loading-spinner" />
          <p>Loading notifications...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="notifications-container">
      <header className="notifications-header">
        <div className="notifications-header-content">
          <button 
            className="notifications-back-btn"
            onClick={() => router.push('/buyer')}
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <div className="notifications-header-title-wrapper">
            <div className="notifications-header-title">Notifications</div>
            {unreadCount > 0 && (
              <span className="notifications-unread-badge">{unreadCount}</span>
            )}
          </div>
          <button
            onClick={() => setShowSettings(true)}
            className="notifications-settings-btn"
          >
            <Settings className="w-6 h-6" />
          </button>
        </div>
      </header>

      <div className="notifications-main-content">
        {unreadCount > 0 && (
          <div className="notifications-info-banner">
            <div className="notifications-banner-content">
              <div className="notifications-banner-left">
                <div className="notifications-banner-icon">
                  <Bell className="w-6 h-6 notifications-bell-icon" />
                </div>
                <div>
                  <h3 className="notifications-banner-title">
                    You have {unreadCount} new notification{unreadCount > 1 ? 's' : ''}
                  </h3>
                  <p className="notifications-banner-subtitle">
                    Stay updated with your queue status and orders
                  </p>
                </div>
              </div>
              <button 
                onClick={markAllAsRead}
                disabled={markingRead}
                className="notifications-mark-read-btn"
              >
                {markingRead ? 'Marking...' : 'Mark all read'}
              </button>
            </div>
          </div>
        )}

        <div className="notifications-filter-tabs">
          {categories.map((category) => (
            <button
              key={category.id}
              onClick={() => setFilter(category.id)}
              className={`notifications-filter-tab ${filter === category.id ? 'active' : ''}`}
            >
              {category.name}
              <span className={`notifications-filter-count ${filter === category.id ? 'active' : ''}`}>
                {category.count}
              </span>
            </button>
          ))}
        </div>

        <div className="notifications-list">
          {filteredNotifications.length === 0 ? (
            <div className="notifications-empty-state">
              <BellOff className="notifications-empty-icon" />
              <h3 className="notifications-empty-title">No notifications</h3>
              <p className="notifications-empty-text">
                {filter === 'all' ? "You're all caught up!" : `No ${filter} notifications`}
              </p>
            </div>
          ) : (
            filteredNotifications.map((notification) => {
              const category = getNotificationCategory(notification.type);
              const typeClass = getTypeClass(notification.type);
              const icon = getNotificationIcon(notification.type);
              const isUrgent = notification.type?.includes('urgent') || notification.type?.includes('ready');
              const readyTimeInfo = getEstimatedReadyTime(notification);

              return (
                <div
                  key={notification.id}
                  className={`notifications-item ${!notification.is_read ? 'unread' : ''} ${isUrgent ? 'pulse' : ''}`}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <div className="notifications-item-content">
                    <div className={`notifications-item-icon ${typeClass}`}>
                      {icon}
                    </div>

                    <div className="notifications-item-body">
                      <div className="notifications-item-header">
                        <h3 className="notifications-item-title">{notification.title}</h3>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          {!notification.is_read && (
                            <div className="notifications-unread-dot"></div>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteNotification(notification.id);
                            }}
                            className="notifications-delete-btn"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      
                      <p className="notifications-item-message">{notification.message}</p>
                      
                      {/* NEW: Order details from metadata */}
                      {notification.metadata?.order_number && (
                        <div style={{ 
                          marginTop: '0.75rem', 
                          padding: '0.75rem', 
                          background: '#f9fafb', 
                          borderRadius: '0.5rem',
                          fontSize: '0.875rem',
                          border: '1px solid #e5e7eb'
                        }}>
                          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: '500' }}>
                              <strong>Order:</strong> #{notification.metadata.order_number}
                            </span>
                            {notification.metadata.total_amount && (
                              <span style={{ fontWeight: '500' }}>
                                <strong>Amount:</strong> ₹{parseFloat(notification.metadata.total_amount).toFixed(2)}
                              </span>
                            )}
                            {notification.metadata.order_status && (
                              <span style={{ 
                                fontWeight: '500',
                                textTransform: 'capitalize'
                              }}>
                                <strong>Status:</strong> {notification.metadata.order_status.replace('_', ' ')}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                      
                      {/* NEW: Estimated ready time for preparing orders */}
                      {readyTimeInfo && (
                        <div style={{ 
                          marginTop: '0.75rem', 
                          padding: '0.75rem', 
                          background: readyTimeInfo.isPast ? '#fef2f2' : '#eff6ff', 
                          border: `1px solid ${readyTimeInfo.isPast ? '#fecaca' : '#bfdbfe'}`,
                          borderRadius: '0.5rem',
                          fontSize: '0.875rem',
                          color: readyTimeInfo.isPast ? '#991b1b' : '#1e40af'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Clock className="w-4 h-4" />
                            <strong>Estimated Ready:</strong> {readyTimeInfo.time}
                            {readyTimeInfo.minutesLeft > 0 ? (
                              <span> ({readyTimeInfo.minutesLeft} mins remaining)</span>
                            ) : (
                              <span> (Should be ready now!)</span>
                            )}
                          </div>
                        </div>
                      )}
                      
                      <div className="notifications-item-footer">
                        <span className="notifications-item-time">
                          {formatTimeAgo(notification.created_at)}
                        </span>
                        {isUrgent && (
                          <span className="notifications-urgent-badge">URGENT</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="notifications-modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="notifications-modal" onClick={(e) => e.stopPropagation()}>
            <div className="notifications-modal-header">
              <h3 className="notifications-modal-title">Notification Settings</h3>
              <button
                onClick={() => setShowSettings(false)}
                className="notifications-modal-close"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="notifications-modal-body">
              <div>
                <h4 className="notifications-settings-section-title">Alert Types</h4>
                <div className="notifications-settings-section">
                  <label className="notifications-setting-item">
                    <div>
                      <p className="notifications-setting-label">Queue Alerts</p>
                      <p className="notifications-setting-desc">Get notified about queue updates</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={notificationSettings.queueAlerts}
                      onChange={(e) => setNotificationSettings({
                        ...notificationSettings,
                        queueAlerts: e.target.checked
                      })}
                      className="notifications-checkbox"
                    />
                  </label>

                  <label className="notifications-setting-item">
                    <div>
                      <p className="notifications-setting-label">Order Updates</p>
                      <p className="notifications-setting-desc">Payment and order confirmations</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={notificationSettings.orderUpdates}
                      onChange={(e) => setNotificationSettings({
                        ...notificationSettings,
                        orderUpdates: e.target.checked
                      })}
                      className="notifications-checkbox"
                    />
                  </label>

                  <label className="notifications-setting-item">
                    <div>
                      <p className="notifications-setting-label">Promotions</p>
                      <p className="notifications-setting-desc">Special offers and deals</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={notificationSettings.promotions}
                      onChange={(e) => setNotificationSettings({
                        ...notificationSettings,
                        promotions: e.target.checked
                      })}
                      className="notifications-checkbox"
                    />
                  </label>

                  <label className="notifications-setting-item">
                    <div>
                      <p className="notifications-setting-label">System Alerts</p>
                      <p className="notifications-setting-desc">Important system messages</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={notificationSettings.systemAlerts}
                      onChange={(e) => setNotificationSettings({
                        ...notificationSettings,
                        systemAlerts: e.target.checked
                      })}
                      className="notifications-checkbox"
                    />
                  </label>
                </div>
              </div>

              <div className="notifications-settings-divider">
                <h4 className="notifications-settings-section-title">Delivery Method</h4>
                <div className="notifications-settings-section">
                  <label className="notifications-setting-item">
                    <div>
                      <p className="notifications-setting-label">Sound</p>
                      <p className="notifications-setting-desc">Play notification sounds</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={notificationSettings.sound}
                      onChange={(e) => setNotificationSettings({
                        ...notificationSettings,
                        sound: e.target.checked
                      })}
                      className="notifications-checkbox"
                    />
                  </label>

                  <label className="notifications-setting-item">
                    <div>
                      <p className="notifications-setting-label">Vibrate</p>
                      <p className="notifications-setting-desc">Vibrate on notifications</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={notificationSettings.vibrate}
                      onChange={(e) => setNotificationSettings({
                        ...notificationSettings,
                        vibrate: e.target.checked
                      })}
                      className="notifications-checkbox"
                    />
                  </label>
                </div>
              </div>
            </div>

            <button
              onClick={saveSettings}
              className="notifications-save-btn"
            >
              Save Settings
            </button>
          </div>
        </div>
      )}
    </div>
  );
}