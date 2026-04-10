'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { getOrganizerEvents } from '@/lib/api/events';
import toast from 'react-hot-toast';
import EventSidebar from '../../components/EventSidebar';
import styles from './EventProfile.module.css';

export default function EventProfile() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState({ total: 0, active: 0, completed: 0 });

  useEffect(() => {
    (async () => {
      try {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (!authUser) { router.push('/get-started'); return; }
        setUser(authUser);

        const { data: profileData } = await supabase
          .from('profiles')
          .select('full_name, phone, user_type, created_at')
          .eq('id', authUser.id)
          .single();

        setProfile(profileData);

        const { data: events } = await getOrganizerEvents();
        const evList = events || [];
        setStats({
          total: evList.length,
          active: evList.filter(e => e.status === 'active').length,
          completed: evList.filter(e => e.status === 'completed').length,
        });
      } catch (err) {
        toast.error('Failed to load profile');
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  const getInitials = (name) => {
    if (!name) return 'E';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric',
  }) : '—';

  if (loading) {
    return (
      <div className={styles.dashboard}>
        <EventSidebar />
        <main className={styles.mainContent}>
          <div className={styles.loadingContainer}>
            <div className={styles.loader} />
            <p>Loading profile...</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={styles.dashboard}>
      <EventSidebar />

      <main className={styles.mainContent}>
        <header className={styles.topBar}>
          <h1 className={styles.pageTitle}>👤 Profile</h1>
          <button
            className={styles.editBtn}
            onClick={() => router.push('/events/settings')}
          >
            ✏️ Edit Profile
          </button>
        </header>

        <div className={styles.content}>
          {/* Profile Card */}
          <div className={styles.profileCard}>
            <div className={styles.profileBanner} />
            <div className={styles.profileBody}>
              <div className={styles.avatarWrapper}>
                <div className={styles.avatar}>{getInitials(profile?.full_name)}</div>
              </div>
              <div className={styles.profileDetails}>
                <h2 className={styles.profileName}>{profile?.full_name || 'Organizer'}</h2>
                <div className={styles.profileBadge}>🎪 Event Organizer</div>
                <div className={styles.profileMeta}>
                  {user?.email && (
                    <div className={styles.profileMetaItem}>
                      <span className={styles.metaIcon}>📧</span>
                      <span>{user.email}</span>
                    </div>
                  )}
                  {profile?.phone && (
                    <div className={styles.profileMetaItem}>
                      <span className={styles.metaIcon}>📱</span>
                      <span>{profile.phone}</span>
                    </div>
                  )}
                  <div className={styles.profileMetaItem}>
                    <span className={styles.metaIcon}>📅</span>
                    <span>Member since {formatDate(profile?.created_at || user?.created_at)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className={styles.statsGrid}>
            <div className={styles.statCard}>
              <div className={styles.statIcon}>🎪</div>
              <div className={styles.statValue}>{stats.total}</div>
              <div className={styles.statLabel}>Events Created</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statIcon}>🟢</div>
              <div className={styles.statValue}>{stats.active}</div>
              <div className={styles.statLabel}>Currently Live</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statIcon}>✅</div>
              <div className={styles.statValue}>{stats.completed}</div>
              <div className={styles.statLabel}>Completed</div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className={styles.actionsCard}>
            <h3 className={styles.actionsTitle}>Quick Actions</h3>
            <div className={styles.actionsList}>
              <button className={styles.actionItem} onClick={() => router.push('/events/create')}>
                <span className={styles.actionIcon}>➕</span>
                <div>
                  <div className={styles.actionName}>Create New Event</div>
                  <div className={styles.actionDesc}>Set up a new temporary event queue</div>
                </div>
                <span className={styles.actionArrow}>›</span>
              </button>
              <button className={styles.actionItem} onClick={() => router.push('/events/dashboard')}>
                <span className={styles.actionIcon}>📊</span>
                <div>
                  <div className={styles.actionName}>Go to Dashboard</div>
                  <div className={styles.actionDesc}>Manage all your events</div>
                </div>
                <span className={styles.actionArrow}>›</span>
              </button>
              <button className={styles.actionItem} onClick={() => router.push('/events/analytics')}>
                <span className={styles.actionIcon}>📈</span>
                <div>
                  <div className={styles.actionName}>View Analytics</div>
                  <div className={styles.actionDesc}>See performance across all events</div>
                </div>
                <span className={styles.actionArrow}>›</span>
              </button>
              <button className={styles.actionItem} onClick={() => router.push('/events/settings')}>
                <span className={styles.actionIcon}>⚙️</span>
                <div>
                  <div className={styles.actionName}>Account Settings</div>
                  <div className={styles.actionDesc}>Update profile, password & more</div>
                </div>
                <span className={styles.actionArrow}>›</span>
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}