'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import toast from 'react-hot-toast';
import EventSidebar from '../../components/EventSidebar';
import styles from './EventSettings.module.css';

export default function EventSettings() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [user, setUser] = useState(null);

  const [profile, setProfile] = useState({
    full_name: '',
    phone: '',
  });

  const [passwords, setPasswords] = useState({
    current: '',
    new: '',
    confirm: '',
  });

  const [prefs, setPrefs] = useState({
    emailNotifications: true,
    autoCloseEvents: true,
  });

  // Load profile
  useEffect(() => {
    (async () => {
      try {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (!authUser) { router.push('/get-started'); return; }
        setUser(authUser);

        const { data: profileData } = await supabase
          .from('profiles')
          .select('full_name, phone, user_type')
          .eq('id', authUser.id)
          .single();

        if (profileData) {
          setProfile({
            full_name: profileData.full_name || '',
            phone: profileData.phone || '',
          });
        }
      } catch (err) {
        toast.error('Failed to load settings');
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  const handleSaveProfile = async () => {
    if (!profile.full_name.trim()) {
      toast.error('Name cannot be empty');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: profile.full_name.trim(),
          phone: profile.phone.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (error) throw error;
      toast.success('Profile updated successfully!');
    } catch (err) {
      toast.error('Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!passwords.new || passwords.new.length < 8) {
      toast.error('New password must be at least 8 characters');
      return;
    }
    if (passwords.new !== passwords.confirm) {
      toast.error('Passwords do not match');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: passwords.new });
      if (error) throw error;
      toast.success('Password updated successfully!');
      setPasswords({ current: '', new: '', confirm: '' });
    } catch (err) {
      toast.error(err.message || 'Failed to update password');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE') {
      toast.error('Type DELETE to confirm');
      return;
    }
    setDeletingAccount(true);
    try {
      // Cancel all upcoming/active events first
      const { data: events } = await supabase
        .from('events')
        .select('id')
        .eq('organizer_id', user.id)
        .in('status', ['upcoming', 'active']);

      if (events?.length) {
        await supabase
          .from('queue')
          .update({ status: 'cancelled' })
          .in('event_id', events.map(e => e.id))
          .in('status', ['waiting', 'in_service']);

        await supabase
          .from('events')
          .update({ status: 'cancelled' })
          .in('id', events.map(e => e.id));
      }

      await supabase.auth.signOut();
      router.push('/');
      toast.success('Account deleted. Sorry to see you go.');
    } catch (err) {
      toast.error('Failed to delete account. Please contact support.');
      setDeletingAccount(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.dashboard}>
        <EventSidebar />
        <main className={styles.mainContent}>
          <div className={styles.loadingContainer}>
            <div className={styles.loader} />
            <p>Loading settings...</p>
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
          <div>
            <h1 className={styles.pageTitle}>⚙️ Settings</h1>
            <p className={styles.pageSubtitle}>Manage your account and preferences</p>
          </div>
        </header>

        <div className={styles.content}>
          {/* Profile Section */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div className={styles.cardHeaderIcon}>👤</div>
              <div>
                <h2 className={styles.cardTitle}>Profile Information</h2>
                <p className={styles.cardSubtitle}>Update your name and phone number</p>
              </div>
            </div>
            <div className={styles.cardBody}>
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Full Name</label>
                  <input
                    className={styles.input}
                    value={profile.full_name}
                    onChange={e => setProfile(p => ({ ...p, full_name: e.target.value }))}
                    placeholder="Your full name"
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Phone Number</label>
                  <input
                    className={styles.input}
                    value={profile.phone}
                    onChange={e => setProfile(p => ({ ...p, phone: e.target.value }))}
                    placeholder="+91 XXXXX XXXXX"
                  />
                </div>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Email Address</label>
                <input
                  className={`${styles.input} ${styles.inputDisabled}`}
                  value={user?.email || ''}
                  disabled
                />
                <span className={styles.hint}>Email cannot be changed from here. Contact support if needed.</span>
              </div>
              <button
                className={styles.saveBtn}
                onClick={handleSaveProfile}
                disabled={saving}
              >
                {saving ? '⏳ Saving...' : '💾 Save Profile'}
              </button>
            </div>
          </div>

          {/* Password Section */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div className={styles.cardHeaderIcon}>🔒</div>
              <div>
                <h2 className={styles.cardTitle}>Change Password</h2>
                <p className={styles.cardSubtitle}>Use a strong password with at least 8 characters</p>
              </div>
            </div>
            <div className={styles.cardBody}>
              <div className={styles.formGroup}>
                <label className={styles.label}>New Password</label>
                <input
                  className={styles.input}
                  type="password"
                  value={passwords.new}
                  onChange={e => setPasswords(p => ({ ...p, new: e.target.value }))}
                  placeholder="Min. 8 characters"
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Confirm New Password</label>
                <input
                  className={styles.input}
                  type="password"
                  value={passwords.confirm}
                  onChange={e => setPasswords(p => ({ ...p, confirm: e.target.value }))}
                  placeholder="Repeat new password"
                />
                {passwords.new && passwords.confirm && passwords.new !== passwords.confirm && (
                  <span className={styles.errorHint}>Passwords do not match</span>
                )}
              </div>
              <button
                className={styles.saveBtn}
                onClick={handleChangePassword}
                disabled={saving || !passwords.new || !passwords.confirm}
              >
                {saving ? '⏳ Updating...' : '🔑 Update Password'}
              </button>
            </div>
          </div>

          {/* Account Info */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div className={styles.cardHeaderIcon}>ℹ️</div>
              <div>
                <h2 className={styles.cardTitle}>Account Info</h2>
                <p className={styles.cardSubtitle}>Details about your organizer account</p>
              </div>
            </div>
            <div className={styles.cardBody}>
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Account Type</span>
                <span className={styles.infoBadge}>🎪 Event Organizer</span>
              </div>
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Account ID</span>
                <span className={styles.infoMono}>{user?.id?.slice(0, 8)}...</span>
              </div>
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Member Since</span>
                <span>{user?.created_at ? new Date(user.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}</span>
              </div>
            </div>
          </div>

          {/* Danger Zone */}
          <div className={`${styles.card} ${styles.dangerCard}`}>
            <div className={styles.cardHeader}>
              <div className={styles.cardHeaderIcon}>⚠️</div>
              <div>
                <h2 className={`${styles.cardTitle} ${styles.dangerTitle}`}>Danger Zone</h2>
                <p className={styles.cardSubtitle}>Irreversible actions — proceed with caution</p>
              </div>
            </div>
            <div className={styles.cardBody}>
              <div className={styles.dangerItem}>
                <div>
                  <div className={styles.dangerItemTitle}>Sign Out</div>
                  <div className={styles.dangerItemDesc}>Sign out of your account on this device</div>
                </div>
                <button
                  className={styles.signOutBtn}
                  onClick={async () => { await supabase.auth.signOut(); router.push('/'); }}
                >
                  🚪 Sign Out
                </button>
              </div>

              <div className={`${styles.dangerItem} ${styles.dangerItemLast}`}>
                <div>
                  <div className={styles.dangerItemTitle}>Delete Account</div>
                  <div className={styles.dangerItemDesc}>
                    Permanently delete your account. All events and queue data will be cancelled. This cannot be undone.
                  </div>
                </div>
                <button
                  className={styles.deleteBtn}
                  onClick={() => setShowDeleteConfirm(true)}
                >
                  🗑️ Delete Account
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Delete Confirm Modal */}
        {showDeleteConfirm && (
          <div className={styles.modalBackdrop} onClick={() => setShowDeleteConfirm(false)}>
            <div className={styles.modal} onClick={e => e.stopPropagation()}>
              <div className={styles.modalIcon}>⚠️</div>
              <h3 className={styles.modalTitle}>Delete Account?</h3>
              <p className={styles.modalDesc}>
                This will permanently delete your account, cancel all upcoming and active events, and remove all data. <strong>This cannot be undone.</strong>
              </p>
              <div className={styles.formGroup}>
                <label className={styles.label}>Type <strong>DELETE</strong> to confirm</label>
                <input
                  className={styles.input}
                  value={deleteConfirmText}
                  onChange={e => setDeleteConfirmText(e.target.value)}
                  placeholder="DELETE"
                  autoFocus
                />
              </div>
              <div className={styles.modalActions}>
                <button className={styles.cancelModalBtn} onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(''); }}>
                  Cancel
                </button>
                <button
                  className={styles.confirmDeleteBtn}
                  onClick={handleDeleteAccount}
                  disabled={deleteConfirmText !== 'DELETE' || deletingAccount}
                >
                  {deletingAccount ? '⏳ Deleting...' : '🗑️ Yes, Delete Everything'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}