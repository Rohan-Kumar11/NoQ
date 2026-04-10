'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  User, Bell, Lock, MapPin, Heart, 
  ChevronRight, Save, X, Check, AlertCircle,
  Loader2, Trash2, AlertTriangle, Package
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { updateCustomerProfile, signOut, deleteAccount } from '@/lib/auth';
import BuyerNavbar from '@/app/components/BuyerNavbar'; // ← adjust path if needed
import './BuyerSettings.css';

export default function BuyerSettings() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('profile');
  const [message, setMessage] = useState({ type: '', text: '' });

  // Account deletion state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  // Profile data
  const [profile, setProfile] = useState({
    fullName: '',
    email: '',
    phone: '',
    avatar: '',
  });

  // Preferences
  const [preferences, setPreferences] = useState({
    preferredService: 'grocery',
    emailNotifications: true,
    smsNotifications: true,
    pushNotifications: true,
    queueNotifications: true,
    orderNotifications: true,
    promotionalNotifications: false,
  });

  // Address
  const [address, setAddress] = useState({
    street: '',
    city: 'Ghaziabad',
    state: 'Uttar Pradesh',
    pincode: '',
    landmark: '',
  });

  useEffect(() => {
    fetchUserData();
  }, []);

  const fetchUserData = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.push('/signin');
        return;
      }

      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (profileData) {
        setProfile({
          fullName: profileData.full_name || '',
          email: user.email || '',
          phone: profileData.phone || '',
          avatar: profileData.avatar_url || '',
        });
      }

      const { data: customerData } = await supabase
        .from('customers')
        .select('*')
        .eq('id', user.id)
        .single();

      if (customerData) {
        setPreferences({
          preferredService: customerData.preferred_service || 'grocery',
          emailNotifications: customerData.notification_preferences?.email ?? true,
          smsNotifications: customerData.notification_preferences?.sms ?? true,
          pushNotifications: customerData.notification_preferences?.push ?? true,
          queueNotifications: customerData.notification_preferences?.queue ?? true,
          orderNotifications: customerData.notification_preferences?.order ?? true,
          promotionalNotifications: customerData.notification_preferences?.promotional ?? false,
        });

        if (customerData.address) {
          setAddress(customerData.address);
        }
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
      showMessage('error', 'Failed to load user data');
    } finally {
      setLoading(false);
    }
  };

  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: '', text: '' }), 5000);
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      const result = await updateCustomerProfile({
        fullName: profile.fullName,
        phone: profile.phone,
      });

      if (result.success) {
        showMessage('success', 'Profile updated successfully!');
      } else {
        showMessage('error', result.error || 'Failed to update profile');
      }
    } catch (error) {
      console.error('Error saving profile:', error);
      showMessage('error', 'An error occurred while saving');
    } finally {
      setSaving(false);
    }
  };

  const handleSavePreferences = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await supabase
        .from('customers')
        .update({
          preferred_service: preferences.preferredService,
          notification_preferences: {
            email: preferences.emailNotifications,
            sms: preferences.smsNotifications,
            push: preferences.pushNotifications,
            queue: preferences.queueNotifications,
            order: preferences.orderNotifications,
            promotional: preferences.promotionalNotifications,
          },
        })
        .eq('id', user.id);

      if (error) throw error;
      showMessage('success', 'Preferences updated successfully!');
    } catch (error) {
      console.error('Error saving preferences:', error);
      showMessage('error', 'Failed to update preferences');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAddress = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await supabase
        .from('customers')
        .update({ address })
        .eq('id', user.id);

      if (error) throw error;
      showMessage('success', 'Address updated successfully!');
    } catch (error) {
      console.error('Error saving address:', error);
      showMessage('error', 'Failed to update address');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmation !== 'DELETE') {
      showMessage('error', 'Please type DELETE to confirm');
      return;
    }
    if (!deletePassword) {
      showMessage('error', 'Please enter your password');
      return;
    }

    setIsDeleting(true);
    try {
      const result = await deleteAccount(deletePassword);

      if (result.success) {
        showMessage('success', 'Account deleted successfully. Redirecting...');
        setTimeout(() => router.push('/'), 2000);
      } else {
        showMessage('error', result.error || 'Failed to delete account');
      }
    } catch (error) {
      console.error('Delete account error:', error);
      showMessage('error', 'An error occurred while deleting account');
    } finally {
      setIsDeleting(false);
    }
  };

  const tabs = [
    { id: 'profile',       label: 'Profile',       icon: User },
    { id: 'preferences',   label: 'Preferences',   icon: Heart },
    { id: 'address',       label: 'Address',        icon: MapPin },
    { id: 'notifications', label: 'Notifications',  icon: Bell },
    { id: 'security',      label: 'Security',       icon: Lock },
  ];

  if (loading) {
    return (
      <div className="buyer-settings-loading">
        <Loader2 className="buyer-settings-loading-spinner" />
        <p>Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="buyer-settings-container">
      <BuyerNavbar />

      {/* Main Content */}
      <div className="buyer-settings-main">
        <div className="buyer-settings-header">
          <h1 className="buyer-settings-title">Account Settings</h1>
          <p className="buyer-settings-subtitle">Manage your account preferences and settings</p>
        </div>

        {message.text && (
          <div className={`buyer-settings-message ${message.type}`}>
            {message.type === 'success'
              ? <Check className="w-5 h-5" />
              : <AlertCircle className="w-5 h-5" />
            }
            <span>{message.text}</span>
          </div>
        )}

        <div className="buyer-settings-content">
          {/* Sidebar Tabs */}
          <div className="buyer-settings-sidebar">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`buyer-settings-tab ${activeTab === id ? 'active' : ''}`}
              >
                <Icon className="w-5 h-5" />
                <span>{label}</span>
                <ChevronRight className="w-4 h-4 ml-auto" />
              </button>
            ))}
          </div>

          {/* Content Panel */}
          <div className="buyer-settings-panel">

            {/* Profile Tab */}
            {activeTab === 'profile' && (
              <div className="buyer-settings-section">
                <h2 className="buyer-settings-section-title">Profile Information</h2>
                <p className="buyer-settings-section-subtitle">Update your personal information</p>

                <div className="buyer-settings-form">
                  <div className="buyer-settings-form-group">
                    <label className="buyer-settings-label">Full Name</label>
                    <input
                      type="text"
                      value={profile.fullName}
                      onChange={(e) => setProfile({ ...profile, fullName: e.target.value })}
                      className="buyer-settings-input"
                      placeholder="Enter your full name"
                    />
                  </div>

                  <div className="buyer-settings-form-group">
                    <label className="buyer-settings-label">Email</label>
                    <input
                      type="email"
                      value={profile.email}
                      disabled
                      className="buyer-settings-input disabled"
                    />
                    <p className="buyer-settings-help-text">Email cannot be changed</p>
                  </div>

                  <div className="buyer-settings-form-group">
                    <label className="buyer-settings-label">Phone Number</label>
                    <input
                      type="tel"
                      value={profile.phone}
                      onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                      className="buyer-settings-input"
                      placeholder="Enter your phone number"
                    />
                  </div>

                  <button onClick={handleSaveProfile} disabled={saving} className="buyer-settings-save-btn">
                    {saving
                      ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
                      : <><Save className="w-4 h-4" /> Save Changes</>
                    }
                  </button>
                </div>
              </div>
            )}

            {/* Preferences Tab */}
            {activeTab === 'preferences' && (
              <div className="buyer-settings-section">
                <h2 className="buyer-settings-section-title">Preferences</h2>
                <p className="buyer-settings-section-subtitle">Customize your experience</p>

                <div className="buyer-settings-form">
                  <div className="buyer-settings-form-group">
                    <label className="buyer-settings-label">Preferred Service</label>
                    <select
                      value={preferences.preferredService}
                      onChange={(e) => setPreferences({ ...preferences, preferredService: e.target.value })}
                      className="buyer-settings-select"
                    >
                      <option value="grocery">Grocery</option>
                      <option value="food">Food & Dining</option>
                      <option value="retail">Retail Shopping</option>
                      <option value="healthcare">Healthcare</option>
                      <option value="other">Other Services</option>
                    </select>
                  </div>

                  <button onClick={handleSavePreferences} disabled={saving} className="buyer-settings-save-btn">
                    {saving
                      ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
                      : <><Save className="w-4 h-4" /> Save Preferences</>
                    }
                  </button>
                </div>
              </div>
            )}

            {/* Address Tab */}
            {activeTab === 'address' && (
              <div className="buyer-settings-section">
                <h2 className="buyer-settings-section-title">Address</h2>
                <p className="buyer-settings-section-subtitle">Manage your delivery address</p>

                <div className="buyer-settings-form">
                  <div className="buyer-settings-form-group">
                    <label className="buyer-settings-label">Street Address</label>
                    <input
                      type="text"
                      value={address.street}
                      onChange={(e) => setAddress({ ...address, street: e.target.value })}
                      className="buyer-settings-input"
                      placeholder="Enter street address"
                    />
                  </div>

                  <div className="buyer-settings-form-row">
                    <div className="buyer-settings-form-group">
                      <label className="buyer-settings-label">City</label>
                      <input
                        type="text"
                        value={address.city}
                        onChange={(e) => setAddress({ ...address, city: e.target.value })}
                        className="buyer-settings-input"
                      />
                    </div>
                    <div className="buyer-settings-form-group">
                      <label className="buyer-settings-label">State</label>
                      <input
                        type="text"
                        value={address.state}
                        onChange={(e) => setAddress({ ...address, state: e.target.value })}
                        className="buyer-settings-input"
                      />
                    </div>
                  </div>

                  <div className="buyer-settings-form-row">
                    <div className="buyer-settings-form-group">
                      <label className="buyer-settings-label">Pincode</label>
                      <input
                        type="text"
                        value={address.pincode}
                        onChange={(e) => setAddress({ ...address, pincode: e.target.value })}
                        className="buyer-settings-input"
                        placeholder="000000"
                      />
                    </div>
                    <div className="buyer-settings-form-group">
                      <label className="buyer-settings-label">Landmark</label>
                      <input
                        type="text"
                        value={address.landmark}
                        onChange={(e) => setAddress({ ...address, landmark: e.target.value })}
                        className="buyer-settings-input"
                        placeholder="Optional"
                      />
                    </div>
                  </div>

                  <button onClick={handleSaveAddress} disabled={saving} className="buyer-settings-save-btn">
                    {saving
                      ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
                      : <><Save className="w-4 h-4" /> Save Address</>
                    }
                  </button>
                </div>
              </div>
            )}

            {/* Notifications Tab */}
            {activeTab === 'notifications' && (
              <div className="buyer-settings-section">
                <h2 className="buyer-settings-section-title">Notification Preferences</h2>
                <p className="buyer-settings-section-subtitle">Choose how you want to be notified</p>

                <div className="buyer-settings-form">
                  <div className="buyer-settings-toggle-group">
                    {[
                      { key: 'emailNotifications',       title: 'Email Notifications',  desc: 'Receive updates via email' },
                      { key: 'smsNotifications',         title: 'SMS Notifications',    desc: 'Receive updates via SMS' },
                      { key: 'pushNotifications',        title: 'Push Notifications',   desc: 'Receive push notifications' },
                      { key: 'queueNotifications',       title: 'Queue Updates',        desc: 'Get notified about queue status' },
                      { key: 'orderNotifications',       title: 'Order Updates',        desc: 'Get notified about order status' },
                      { key: 'promotionalNotifications', title: 'Promotional Offers',   desc: 'Receive promotional offers and deals' },
                    ].map(({ key, title, desc }) => (
                      <div key={key} className="buyer-settings-toggle-item">
                        <div>
                          <h4 className="buyer-settings-toggle-title">{title}</h4>
                          <p className="buyer-settings-toggle-desc">{desc}</p>
                        </div>
                        <label className="buyer-settings-switch">
                          <input
                            type="checkbox"
                            checked={preferences[key]}
                            onChange={(e) => setPreferences({ ...preferences, [key]: e.target.checked })}
                          />
                          <span className="buyer-settings-slider" />
                        </label>
                      </div>
                    ))}
                  </div>

                  <button onClick={handleSavePreferences} disabled={saving} className="buyer-settings-save-btn">
                    {saving
                      ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
                      : <><Save className="w-4 h-4" /> Save Preferences</>
                    }
                  </button>
                </div>
              </div>
            )}

            {/* Security Tab */}
            {activeTab === 'security' && (
              <div className="buyer-settings-section">
                <h2 className="buyer-settings-section-title">Account Security</h2>
                <p className="buyer-settings-section-subtitle">Manage your account security settings</p>

                <div className="buyer-settings-form">
                  <div className="buyer-settings-danger-zone">
                    <div className="buyer-settings-danger-header">
                      <AlertTriangle className="w-5 h-5" />
                      <h3>Danger Zone</h3>
                    </div>
                    <div className="buyer-settings-danger-content">
                      <h4>Delete Account</h4>
                      <p>
                        Once you delete your account, there is no going back. This action cannot be undone.
                        All your data including orders, cart items, and preferences will be permanently deleted.
                      </p>
                      <p className="buyer-settings-danger-note">
                        <strong>Note:</strong> You will be able to create a new account with the same email address in the future if needed.
                      </p>
                      <button onClick={() => setShowDeleteModal(true)} className="buyer-settings-delete-btn">
                        <Trash2 className="w-4 h-4" />
                        Delete My Account
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete Account Modal */}
      {showDeleteModal && (
        <div className="buyer-settings-modal-overlay">
          <div className="buyer-settings-modal">
            <div className="buyer-settings-modal-header">
              <AlertTriangle className="w-6 h-6 text-red-600" />
              <h3>Delete Account</h3>
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeletePassword('');
                  setDeleteConfirmation('');
                }}
                className="buyer-settings-modal-close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="buyer-settings-modal-body">
              <div className="buyer-settings-modal-warning">
                <p><strong>Warning:</strong> This action is permanent and cannot be undone.</p>
                <p>All your data will be permanently deleted including:</p>
                <ul>
                  <li>Profile information</li>
                  <li>Order history</li>
                  <li>Cart items</li>
                  <li>Saved addresses</li>
                  <li>Preferences and settings</li>
                </ul>
              </div>

              <div className="buyer-settings-form">
                <div className="buyer-settings-form-group">
                  <label className="buyer-settings-label">Enter your password to confirm</label>
                  <input
                    type="password"
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    className="buyer-settings-input"
                    placeholder="Your password"
                  />
                </div>
                <div className="buyer-settings-form-group">
                  <label className="buyer-settings-label">
                    Type <strong>DELETE</strong> to confirm
                  </label>
                  <input
                    type="text"
                    value={deleteConfirmation}
                    onChange={(e) => setDeleteConfirmation(e.target.value)}
                    className="buyer-settings-input"
                    placeholder="DELETE"
                  />
                </div>
              </div>
            </div>

            <div className="buyer-settings-modal-footer">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeletePassword('');
                  setDeleteConfirmation('');
                }}
                className="buyer-settings-modal-cancel"
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                className="buyer-settings-modal-delete"
                disabled={isDeleting || deleteConfirmation !== 'DELETE' || !deletePassword}
              >
                {isDeleting
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Deleting...</>
                  : <><Trash2 className="w-4 h-4" /> Delete Account Permanently</>
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}