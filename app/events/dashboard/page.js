'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { useNotifications } from '@/app/context/NotificationContext';
import {
  getOrganizerEvents,
  activateEvent,
  closeEvent,
  cancelEvent,
} from '@/lib/api/events';
import toast from 'react-hot-toast';
import EventSidebar from '@/app/components/EventSidebar';
import styles from './EventsDashboard.module.css';

export default function EventsDashboard() {
  const router = useRouter();
  const { unreadCount } = useNotifications();
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [profile, setProfile] = useState(null);
  const [events, setEvents] = useState([]);
  const [filter, setFilter] = useState('all');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

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
    const t = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const loadData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/get-started'); return; }

      const { data: profileData } = await supabase
        .from('profiles')
        .select('full_name, user_type')
        .eq('id', user.id)
        .single();

      if (!profileData || profileData.user_type !== 'event_organizer') {
        toast.error('Access denied');
        router.push('/get-started');
        return;
      }
      setProfile(profileData);

      const { data: eventsData } = await getOrganizerEvents();
      setEvents(eventsData || []);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { loadData(); }, [loadData]);

  const formatTime = (d) => d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  const formatDate = (d) => d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const formatEventDate = (dateStr) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const formatEventTime = (dateStr) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  const handleActivate = async (eventId, eventName) => {
    if (!confirm(`Activate "${eventName}"? Attendees will be able to join.`)) return;
    const { error } = await activateEvent(eventId);
    if (error) { toast.error(error); return; }
    toast.success('Event is now live!', { icon: '🟢' });
    loadData();
  };

  const handleClose = async (eventId, eventName) => {
    if (!confirm(`Close "${eventName}"? This will end the event and cancel remaining queue entries.`)) return;
    const { error } = await closeEvent(eventId);
    if (error) { toast.error(error); return; }
    toast.success('Event closed successfully');
    loadData();
  };

  const handleCancel = async (eventId, eventName) => {
    const reason = prompt(`Why are you cancelling "${eventName}"?`);
    if (reason === null) return;
    const { error } = await cancelEvent(eventId, reason || 'Cancelled by organizer');
    if (error) { toast.error(error); return; }
    toast.success('Event cancelled');
    loadData();
  };

  const filteredEvents = events.filter(e => {
    if (filter === 'all') return true;
    return e.status === filter;
  });

  const stats = {
    total:     events.length,
    active:    events.filter(e => e.status === 'active').length,
    upcoming:  events.filter(e => e.status === 'upcoming').length,
    completed: events.filter(e => e.status === 'completed').length,
  };

  const getStatusBadge = (status) => ({
    upcoming:  { label: '📅 Upcoming',  bg: '#dbeafe', color: '#1e40af' },
    active:    { label: '🟢 Live',      bg: '#d1fae5', color: '#065f46' },
    completed: { label: '✅ Completed', bg: '#f3f4f6', color: '#374151' },
    cancelled: { label: '❌ Cancelled', bg: '#fee2e2', color: '#991b1b' },
  }[status] || { label: status, bg: '#f3f4f6', color: '#374151' });

  const getEventTypeIcon = (type) => ({
    food_distribution: '🍱',
    large_dinner:      '🍽️',
    registration:      '📋',
    conference:        '🎤',
    general:           '📅',
  }[type] || '📅');

  // Returns the primary manage button label + route based on queue_mode and status
  const getManageButton = (event) => {
    const isQueueBased = event.queue_mode === 'queue_based';

    if (event.status === 'active') {
      return {
        label: isQueueBased ? '🎫 Manage Queue' : '👥 Manage Registrations',
        route: isQueueBased
          ? `/events/${event.id}/manage`
          : `/events/${event.id}/registrations`,
      };
    }

    if (event.status === 'upcoming') {
      return {
        label: isQueueBased ? '👁️ View Queue' : '👥 Manage Registrations',
        route: isQueueBased
          ? `/events/${event.id}/manage`
          : `/events/${event.id}/registrations`,
      };
    }

    if (event.status === 'completed') {
      return {
        label: isQueueBased ? '📋 Queue Summary' : '👥 Registrations',
        route: isQueueBased
          ? `/events/${event.id}/manage`
          : `/events/${event.id}/registrations`,
      };
    }

    return null;
  };

  if (loading) {
    return (
      <div className={styles.dashboard}>
        <EventSidebar />
        <main className={styles.mainContent}>
          <div className={styles.loadingContainer}>
            <div className={styles.loader}></div>
            <p>Loading your events...</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={styles.dashboard}>
      <EventSidebar />

      <main className={`${styles.mainContent} ${isSidebarCollapsed ? styles.mainContentCollapsed : ''}`}>

        {/* Top Bar */}
        <header className={styles.topBar}>
          <div className={styles.topBarLeft}>
            <h1 className={styles.pageTitle}>Events Dashboard</h1>
            <div className={styles.dateTime}>
              <div className={styles.date}>{formatDate(currentTime)}</div>
              <div className={styles.time}>{formatTime(currentTime)}</div>
            </div>
          </div>
          <div className={styles.topBarRight}>
            <button className={styles.iconButton} onClick={() => router.push('/events/notifications')}>
              {unreadCount > 0 && <span className={styles.notificationBadge}>{unreadCount}</span>}
              🔔
            </button>
            <button className={styles.createEventBtn} onClick={() => router.push('/events/create')}>
              ➕ Create Event
            </button>
          </div>
        </header>

        {/* Welcome Banner */}
        <div className={styles.welcomeBanner}>
          <div className={styles.welcomeLeft}>
            <div className={styles.welcomeIcon}>🎪</div>
            <div>
              <h2 className={styles.welcomeTitle}>Welcome, {profile?.full_name?.split(' ')[0] || 'Organizer'}!</h2>
              <p className={styles.welcomeSubtitle}>Manage queues for your events — food distributions, dinners, registrations & more.</p>
            </div>
          </div>
          <button className={styles.quickCreateBtn} onClick={() => router.push('/events/create')}>
            ➕ New Event →
          </button>
        </div>

        {/* Stats */}
        <div className={styles.statsGrid}>
          <div className={`${styles.statCard} ${styles.statTotal}`}>
            <div className={styles.statIcon}>📊</div>
            <div className={styles.statContent}>
              <div className={styles.statLabel}>Total Events</div>
              <div className={styles.statValue}>{stats.total}</div>
            </div>
          </div>
          <div className={`${styles.statCard} ${styles.statActive}`}>
            <div className={styles.statIcon}>🟢</div>
            <div className={styles.statContent}>
              <div className={styles.statLabel}>Live Now</div>
              <div className={styles.statValue}>{stats.active}</div>
            </div>
          </div>
          <div className={`${styles.statCard} ${styles.statUpcoming}`}>
            <div className={styles.statIcon}>📅</div>
            <div className={styles.statContent}>
              <div className={styles.statLabel}>Upcoming</div>
              <div className={styles.statValue}>{stats.upcoming}</div>
            </div>
          </div>
          <div className={`${styles.statCard} ${styles.statCompleted}`}>
            <div className={styles.statIcon}>✅</div>
            <div className={styles.statContent}>
              <div className={styles.statLabel}>Completed</div>
              <div className={styles.statValue}>{stats.completed}</div>
            </div>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className={styles.filterTabs}>
          {['all', 'active', 'upcoming', 'completed', 'cancelled'].map(f => (
            <button
              key={f}
              className={`${styles.filterTab} ${filter === f ? styles.filterTabActive : ''}`}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? 'All Events' : f.charAt(0).toUpperCase() + f.slice(1)}
              {f !== 'all' && (
                <span className={styles.filterCount}>
                  {events.filter(e => e.status === f).length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Events List */}
        {filteredEvents.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>🎪</div>
            <h3>No events yet</h3>
            <p>Create your first event to start managing queues for attendees.</p>
            <button className={styles.emptyCreateBtn} onClick={() => router.push('/events/create')}>
              ➕ Create Your First Event
            </button>
          </div>
        ) : (
          <div className={styles.eventsList}>
            {filteredEvents.map((event) => {
              const badge      = getStatusBadge(event.status);
              const typeIcon   = getEventTypeIcon(event.event_type);
              const manageBtn  = getManageButton(event);
              const isQueueBased = event.queue_mode === 'queue_based';

              return (
                <div key={event.id} className={styles.eventCard}>
                  <div className={styles.eventCardLeft}>
                    <div className={styles.eventTypeIcon}>{typeIcon}</div>
                    <div className={styles.eventInfo}>
                      <div className={styles.eventCardTop}>
                        <h3 className={styles.eventName}>{event.name}</h3>
                        <div className={styles.badgeRow}>
                          {/* queue_mode pill */}
                          <span className={styles.modePill}>
                            {isQueueBased ? '🎫 Queue Based' : '📋 Registration'}
                          </span>
                          {/* status badge */}
                          <span
                            className={styles.statusBadge}
                            style={{ background: badge.bg, color: badge.color }}
                          >
                            {badge.label}
                          </span>
                        </div>
                      </div>
                      <div className={styles.eventMeta}>
                        <span>📍 {event.location}</span>
                        <span>📅 {formatEventDate(event.start_time)}</span>
                        <span>🕐 {formatEventTime(event.start_time)} – {formatEventTime(event.end_time)}</span>
                        {event.max_capacity && <span>👥 Max {event.max_capacity}</span>}
                        <span>⏱️ ~{event.avg_service_time} min/person</span>
                        {isQueueBased && event.waiting_timeout_minutes && (
                          <span>⏰ {event.waiting_timeout_minutes} min timeout</span>
                        )}
                      </div>
                      {event.description && (
                        <p className={styles.eventDescription}>{event.description}</p>
                      )}
                    </div>
                  </div>

                  <div className={styles.eventCardActions}>

                    {/* Primary manage button — queue-mode aware */}
                    {manageBtn && (
                      <button
                        className={styles.actionBtnPrimary}
                        onClick={() => router.push(manageBtn.route)}
                      >
                        {manageBtn.label}
                      </button>
                    )}

                    {/* Analytics */}
                    <button
                      className={styles.actionBtnSecondary}
                      onClick={() => router.push(`/events/${event.id}/analytics`)}
                    >
                      📊 Analytics
                    </button>

                    {/* Go Live */}
                    {event.status === 'upcoming' && (
                      <button
                        className={styles.actionBtnSuccess}
                        onClick={() => handleActivate(event.id, event.name)}
                      >
                        🟢 Go Live
                      </button>
                    )}

                    {/* Close Event */}
                    {event.status === 'active' && (
                      <button
                        className={styles.actionBtnDanger}
                        onClick={() => handleClose(event.id, event.name)}
                      >
                        🔴 Close Event
                      </button>
                    )}

                    {/* Cancel */}
                    {['upcoming', 'active'].includes(event.status) && (
                      <button
                        className={styles.actionBtnGhost}
                        onClick={() => handleCancel(event.id, event.name)}
                      >
                        ❌ Cancel
                      </button>
                    )}

                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}