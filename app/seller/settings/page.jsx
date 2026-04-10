'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { getStoreDetails, updateStoreProfile, deleteAccount } from '@/lib/auth';
import Sidebar from '../../components/Sidebar';
import styles from './Sellersettings.module.css';
import { getServiceMode, updateServiceMode } from '@/lib/api/appointments';
import { supabase } from '@/lib/supabase/client';

export function ServiceModeTab({ storeId, styles }) {
  const [mode, setMode]           = useState(null);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [localMode, setLocalMode] = useState(null);

  useEffect(() => {
    if (!storeId) return;
    (async () => {
      const { data } = await getServiceMode(storeId);
      if (data) { setMode(data); setLocalMode(data); }
      setLoading(false);
    })();
  }, [storeId]);

  const handleSave = async () => {
    setSaving(true);
    const { data, error } = await updateServiceMode(storeId, localMode);
    if (error) {
      console.error('ServiceModeTab save error:', error);
    } else {
      setMode(data);
    }
    setSaving(false);
  };

  if (loading) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-secondary)' }}>Loading...</div>;
  }

  const isDirty = JSON.stringify(mode) !== JSON.stringify(localMode);

  return (
    <div className={styles.section}>
      <h2 className={styles.sectionTitle}>Service Mode</h2>
      <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '1.5rem' }}>
        Control how customers interact with your store. You can enable queue, appointments, or both.
        Set <strong>has_products</strong> to off for labs and diagnostic centres.
      </p>

      <div className={styles.formGrid}>
        <div className={`${styles.formGroup} ${styles.fullWidth}`}>
          <label className={styles.switchLabel}>
            <input
              type="checkbox"
              checked={localMode?.queue_enabled ?? true}
              onChange={e => setLocalMode(p => ({ ...p, queue_enabled: e.target.checked }))}
              className={styles.switchInput}
            />
            <span className={styles.switch}></span>
            <div>
              <span>Queue System Enabled</span>
              <p className={styles.helpText}>Customers can join a walk-in queue at your store</p>
            </div>
          </label>
        </div>

        <div className={`${styles.formGroup} ${styles.fullWidth}`}>
          <label className={styles.switchLabel}>
            <input
              type="checkbox"
              checked={localMode?.appointment_enabled ?? false}
              onChange={e => setLocalMode(p => ({ ...p, appointment_enabled: e.target.checked }))}
              className={styles.switchInput}
            />
            <span className={styles.switch}></span>
            <div>
              <span>Appointment Booking Enabled</span>
              <p className={styles.helpText}>Customers can book time slots in advance. A "Book Appointment" button will appear on your store page.</p>
            </div>
          </label>
        </div>

        <div className={`${styles.formGroup} ${styles.fullWidth}`}>
          <label className={styles.switchLabel}>
            <input
              type="checkbox"
              checked={localMode?.has_products ?? true}
              onChange={e => setLocalMode(p => ({ ...p, has_products: e.target.checked }))}
              className={styles.switchInput}
            />
            <span className={styles.switch}></span>
            <div>
              <span>Store Has Products / Menu</span>
              <p className={styles.helpText}>Turn OFF for labs and diagnostic centres — the product grid will be hidden and replaced with your services list</p>
            </div>
          </label>
        </div>
      </div>

      {localMode && (
        <div style={{
          marginTop: '1.5rem',
          padding: '1rem 1.25rem',
          background: 'var(--color-background-secondary)',
          borderRadius: '12px',
          border: '1px solid var(--color-border-tertiary)',
        }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text-secondary)', marginBottom: '0.5rem' }}>
            Preview — what buyers will see on your store page:
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {localMode.queue_enabled && (
              <span style={{ fontSize: '0.78rem', padding: '3px 10px', borderRadius: '999px', background: '#7c3aed18', color: '#7c3aed', border: '1px solid #7c3aed30', fontWeight: 600 }}>
                👥 Join Queue button
              </span>
            )}
            {localMode.appointment_enabled && (
              <span style={{ fontSize: '0.78rem', padding: '3px 10px', borderRadius: '999px', background: '#2563eb18', color: '#2563eb', border: '1px solid #2563eb30', fontWeight: 600 }}>
                📅 Book Appointment button
              </span>
            )}
            {localMode.has_products && (
              <span style={{ fontSize: '0.78rem', padding: '3px 10px', borderRadius: '999px', background: '#10b98118', color: '#10b981', border: '1px solid #10b98130', fontWeight: 600 }}>
                🛒 Product grid shown
              </span>
            )}
            {!localMode.has_products && localMode.appointment_enabled && (
              <span style={{ fontSize: '0.78rem', padding: '3px 10px', borderRadius: '999px', background: '#f59e0b18', color: '#f59e0b', border: '1px solid #f59e0b30', fontWeight: 600 }}>
                🧪 Services list shown (no cart)
              </span>
            )}
          </div>
        </div>
      )}

      <div style={{ marginTop: '1.5rem' }}>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !isDirty}
          className={styles.saveButton}
          style={{ opacity: (saving || !isDirty) ? 0.5 : 1 }}
        >
          {saving ? 'Saving...' : isDirty ? 'Save Service Mode' : 'No changes'}
        </button>
      </div>
    </div>
  );
}

// ── NEW: UPI Settings Tab ──────────────────────────────────────────────────────
export function UpiSettingsTab({ storeId, styles }) {
  const [upiId, setUpiId]         = useState('');
  const [savedUpiId, setSavedUpiId] = useState('');
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [msg, setMsg]             = useState({ type: '', text: '' });

  useEffect(() => {
    if (!storeId) return;
    (async () => {
      const { data, error } = await supabase
        .from('stores')
        .select('metadata')
        .eq('id', storeId)
        .single();
      if (!error && data?.metadata?.upi_id) {
        setUpiId(data.metadata.upi_id);
        setSavedUpiId(data.metadata.upi_id);
      }
      setLoading(false);
    })();
  }, [storeId]);

  const validateUpi = (id) => /^[\w.\-]{2,256}@[a-zA-Z]{2,64}$/.test(id.trim());

  const handleSave = async () => {
    if (!upiId.trim()) { setMsg({ type: 'error', text: 'UPI ID cannot be empty.' }); return; }
    if (!validateUpi(upiId)) { setMsg({ type: 'error', text: 'Enter a valid UPI ID (e.g. yourname@upi).' }); return; }
    setSaving(true);
    setMsg({ type: '', text: '' });

    // Merge into existing metadata to avoid overwriting other keys
    const { data: existing } = await supabase.from('stores').select('metadata').eq('id', storeId).single();
    const merged = { ...(existing?.metadata || {}), upi_id: upiId.trim() };

    const { error } = await supabase.from('stores').update({ metadata: merged }).eq('id', storeId);
    if (error) {
      setMsg({ type: 'error', text: 'Failed to save UPI ID. Please try again.' });
    } else {
      setSavedUpiId(upiId.trim());
      setMsg({ type: 'success', text: 'UPI ID saved successfully!' });
      setTimeout(() => setMsg({ type: '', text: '' }), 3000);
    }
    setSaving(false);
  };

  const isDirty = upiId !== savedUpiId;

  if (loading) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-secondary)' }}>Loading...</div>;
  }

  return (
    <div className={styles.section}>
      <h2 className={styles.sectionTitle}>UPI Payment Settings</h2>
      <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginBottom: '2rem', lineHeight: 1.6 }}>
        Add your UPI ID so customers can pay you directly via any UPI app (GPay, PhonePe, Paytm, BHIM).
        A real QR code will be generated for each order using this ID.
      </p>

      {/* How it works */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem',
        marginBottom: '2rem',
      }}>
        {[
          { icon: '📱', title: 'Customer scans QR', desc: 'A UPI QR is generated per order with the exact amount' },
          { icon: '💸', title: 'Payment goes to you', desc: 'Funds land directly in your UPI-linked bank account' },
          { icon: '✅', title: 'Order confirmed', desc: 'Customer marks payment done; you verify and confirm' },
        ].map(({ icon, title, desc }) => (
          <div key={title} style={{
            padding: '1.25rem', borderRadius: '12px',
            background: 'linear-gradient(135deg, rgba(74,144,226,0.05), rgba(139,92,246,0.05))',
            border: '1px solid rgba(74,144,226,0.15)', textAlign: 'center',
          }}>
            <div style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>{icon}</div>
            <div style={{ fontWeight: 700, fontSize: '0.875rem', color: '#1a1a1a', marginBottom: '0.25rem' }}>{title}</div>
            <div style={{ fontSize: '0.8rem', color: '#666', lineHeight: 1.5 }}>{desc}</div>
          </div>
        ))}
      </div>

      <div className={styles.formGrid}>
        <div className={`${styles.formGroup} ${styles.fullWidth}`}>
          <label className={styles.label}>
            Your UPI ID
            {savedUpiId && (
              <span style={{
                marginLeft: '0.75rem', fontSize: '0.75rem', padding: '2px 10px',
                borderRadius: '999px', background: '#d1fae5', color: '#059669',
                fontWeight: 700, border: '1px solid #a7f3d0',
              }}>✓ Active</span>
            )}
          </label>
          <div style={{ position: 'relative' }}>
            <span style={{
              position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)',
              fontSize: '1.1rem', pointerEvents: 'none',
            }}>📲</span>
            <input
              type="text"
              value={upiId}
              onChange={e => setUpiId(e.target.value)}
              className={styles.input}
              placeholder="yourname@upi  or  yourname@paytm"
              style={{ paddingLeft: '2.5rem' }}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <p className={styles.helpText}>
            Accepted formats: <code>name@paytm</code>, <code>number@ybl</code>, <code>name@okaxis</code>, <code>name@oksbi</code>, etc.
          </p>
        </div>
      </div>

      {/* Live preview */}
      {upiId && validateUpi(upiId) && (
        <div style={{
          marginTop: '1.5rem', padding: '1.25rem 1.5rem',
          borderRadius: '14px', border: '2px solid #4A90E2',
          background: 'linear-gradient(135deg, rgba(74,144,226,0.04), rgba(91,163,245,0.04))',
        }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#4A90E2', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Live Preview — customers will see this UPI ID on the QR screen
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '1.5rem' }}>📲</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: '1rem', color: '#1a1a1a', fontFamily: 'monospace' }}>{upiId}</div>
              <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '2px' }}>UPI payment will flow to this ID</div>
            </div>
          </div>
        </div>
      )}

      {msg.text && (
        <div style={{
          marginTop: '1rem', padding: '0.875rem 1.25rem', borderRadius: '10px', fontWeight: 600,
          fontSize: '0.9rem',
          background: msg.type === 'success' ? '#d1fae5' : '#fee2e2',
          color: msg.type === 'success' ? '#059669' : '#dc2626',
          border: `1px solid ${msg.type === 'success' ? '#a7f3d0' : '#fecaca'}`,
        }}>
          {msg.type === 'success' ? '✓' : '⚠'} {msg.text}
        </div>
      )}

      <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !isDirty}
          className={styles.saveButton}
          style={{ opacity: (saving || !isDirty) ? 0.5 : 1 }}
        >
          {saving ? 'Saving...' : isDirty ? 'Save UPI ID' : 'No changes'}
        </button>
        {savedUpiId && !isDirty && (
          <span style={{ fontSize: '0.875rem', color: '#059669', fontWeight: 600 }}>
            ✓ UPI ID is active and ready
          </span>
        )}
      </div>

      {/* Warning if not set */}
      {!savedUpiId && (
        <div style={{
          marginTop: '1.5rem', padding: '1rem 1.25rem', borderRadius: '12px',
          background: '#fef3c7', border: '1px solid #fde68a', color: '#92400e',
          fontSize: '0.875rem', fontWeight: 500,
        }}>
          ⚠️ No UPI ID set yet. Customers will only see a placeholder QR until you add one.
          The "Simulate Payment (Demo)" button will still work for testing.
        </div>
      )}
    </div>
  );
}

export default function SellerSettings() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('location');
  const [message, setMessage] = useState({ type: '', text: '' });
  const [detectingLocation, setDetectingLocation] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [storeId, setStoreId] = useState(null);

  const [formData, setFormData] = useState({
    address: '',
    city: '',
    state: '',
    pincode: '',
    landmark: '',
    latitude: '',
    longitude: '',
    working_days: [],
    opening_time: '',
    closing_time: '',
    operating_hours: {
      monday:    { open: '09:00', close: '21:00', closed: false },
      tuesday:   { open: '09:00', close: '21:00', closed: false },
      wednesday: { open: '09:00', close: '21:00', closed: false },
      thursday:  { open: '09:00', close: '21:00', closed: false },
      friday:    { open: '09:00', close: '21:00', closed: false },
      saturday:  { open: '09:00', close: '21:00', closed: false },
      sunday:    { open: '10:00', close: '21:00', closed: false }
    },
    max_tokens_per_hour: 20,
    avg_service_time: 15,
    queue_capacity: 50,
    notification_timing: 5,
    auto_call_next: false,
    estimated_service_time: 15,
    is_active: true,
    is_open: false
  });

  useEffect(() => {
    const checkSidebarState = () => {
      const sidebar = document.querySelector('[class*="sidebar"]');
      if (sidebar) {
        setIsSidebarCollapsed(sidebar.classList.toString().includes('collapsed'));
      }
    };
    checkSidebarState();
    const observer = new MutationObserver(checkSidebarState);
    const sidebar = document.querySelector('[class*="sidebar"]');
    if (sidebar) observer.observe(sidebar, { attributes: true, attributeFilter: ['class'] });
    window.addEventListener('resize', checkSidebarState);
    return () => { observer.disconnect(); window.removeEventListener('resize', checkSidebarState); };
  }, []);

  useEffect(() => {
    async function loadStoreData() {
      try {
        setLoading(true);
        const result = await getStoreDetails();
        if (result.success && result.data) {
          setStoreId(result.data.id);
          const safeData = {
            address:            result.data.address || '',
            city:               result.data.city || '',
            state:              result.data.state || '',
            pincode:            result.data.pincode || '',
            landmark:           result.data.landmark || '',
            latitude:           result.data.latitude || '',
            longitude:          result.data.longitude || '',
            working_days:       result.data.working_days || [],
            opening_time:       result.data.opening_time || '',
            closing_time:       result.data.closing_time || '',
            operating_hours:    result.data.operating_hours || {
              monday:    { open: '09:00', close: '21:00', closed: false },
              tuesday:   { open: '09:00', close: '21:00', closed: false },
              wednesday: { open: '09:00', close: '21:00', closed: false },
              thursday:  { open: '09:00', close: '21:00', closed: false },
              friday:    { open: '09:00', close: '21:00', closed: false },
              saturday:  { open: '09:00', close: '21:00', closed: false },
              sunday:    { open: '10:00', close: '21:00', closed: false }
            },
            max_tokens_per_hour:    result.data.max_tokens_per_hour || 20,
            avg_service_time:       result.data.avg_service_time || 15,
            queue_capacity:         result.data.queue_capacity || 50,
            notification_timing:    result.data.notification_timing || 5,
            auto_call_next:         result.data.auto_call_next || false,
            estimated_service_time: result.data.estimated_service_time || 15,
            is_active: result.data.is_active !== undefined ? result.data.is_active : true,
            is_open:   result.data.is_open || false
          };
          setFormData(safeData);
        } else {
          setMessage({ type: 'error', text: 'Failed to load store details' });
        }
      } catch (error) {
        console.error('Load error:', error);
        setMessage({ type: 'error', text: 'An error occurred' });
      } finally {
        setLoading(false);
      }
    }
    loadStoreData();
  }, []);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleWorkingDaysChange = (day) => {
    setFormData(prev => ({
      ...prev,
      working_days: prev.working_days.includes(day)
        ? prev.working_days.filter(d => d !== day)
        : [...prev.working_days, day]
    }));
  };

  const handleOperatingHoursChange = (day, field, value) => {
    setFormData(prev => ({
      ...prev,
      operating_hours: { ...prev.operating_hours, [day]: { ...prev.operating_hours[day], [field]: value } }
    }));
  };

  const handleAutoDetectLocation = async () => {
    if (!navigator.geolocation) {
      setMessage({ type: 'error', text: 'Geolocation is not supported by your browser' });
      return;
    }
    setDetectingLocation(true);
    setMessage({ type: 'info', text: 'Detecting your location...' });
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        setFormData(prev => ({ ...prev, latitude: latitude.toFixed(6), longitude: longitude.toFixed(6) }));
        try {
          const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
          const data = await response.json();
          if (data.address) {
            setFormData(prev => ({
              ...prev,
              latitude: latitude.toFixed(6), longitude: longitude.toFixed(6),
              city:    data.address.city || data.address.town || data.address.village || prev.city,
              state:   data.address.state || prev.state,
              pincode: data.address.postcode || prev.pincode,
              address: data.display_name || prev.address
            }));
            setMessage({ type: 'success', text: 'Location detected successfully!' });
          }
        } catch {
          setMessage({ type: 'success', text: 'Coordinates detected! Please fill in address details.' });
        }
        setDetectingLocation(false);
        setTimeout(() => setMessage({ type: '', text: '' }), 3000);
      },
      (error) => {
        setDetectingLocation(false);
        const msgs = {
          [error.PERMISSION_DENIED]:    'Location permission denied. Please enable location access.',
          [error.POSITION_UNAVAILABLE]: 'Location information unavailable.',
          [error.TIMEOUT]:              'Location request timed out.',
        };
        setMessage({ type: 'error', text: msgs[error.code] || 'Failed to detect location' });
        setTimeout(() => setMessage({ type: '', text: '' }), 3000);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage({ type: '', text: '' });
    try {
      const result = await updateStoreProfile(formData);
      if (result.success) {
        setMessage({ type: 'success', text: 'Settings updated successfully!' });
        setTimeout(() => setMessage({ type: '', text: '' }), 3000);
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to update settings' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'An error occurred while saving' });
    } finally {
      setSaving(false);
    }
  };

  const tabs = [
    { id: 'location',     label: 'Location',        icon: '📍' },
    { id: 'hours',        label: 'Operating Hours',  icon: '🕐' },
    { id: 'queue',        label: 'Queue Settings',   icon: '🎫' },
    { id: 'servicemode',  label: 'Service Mode',     icon: '🔧' },
    { id: 'upi',          label: 'UPI Payments',     icon: '💳' },  // ← NEW
    { id: 'advanced',     label: 'Advanced',         icon: '⚙️' },
  ];

  if (loading) {
    return (
      <div className={styles.dashboard}>
        <Sidebar />
        <main className={`${styles.mainContent} ${isSidebarCollapsed ? styles.mainContentCollapsed : ''}`}>
          <div className={styles.loadingContainer}>
            <div className={styles.loader}></div>
            <p>Loading settings...</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={styles.dashboard}>
      <Sidebar />
      <main className={`${styles.mainContent} ${isSidebarCollapsed ? styles.mainContentCollapsed : ''}`}>
        <motion.div className={styles.header} initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <div className={styles.headerLeft}>
            <button className={styles.backButton} onClick={() => router.push('/seller/dashboard')}>← Back</button>
            <div>
              <h1 className={styles.pageTitle}>Store Settings</h1>
              <p className={styles.pageSubtitle}>Manage your store information and preferences</p>
            </div>
          </div>
          {/* Hide the global Save button for tabs that have their own save */}
          {activeTab !== 'servicemode' && activeTab !== 'upi' && (
            <button className={styles.saveButton} onClick={handleSubmit} disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          )}
        </motion.div>

        {message.text && (
          <motion.div className={`${styles.alert} ${styles[message.type]}`} initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
            {message.type === 'success' ? '✓' : message.type === 'error' ? '⚠' : 'ℹ'} {message.text}
          </motion.div>
        )}

        <div className={styles.settingsContainer}>
          <motion.div className={styles.tabsNav} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5, delay: 0.2 }}>
            {tabs.map((tab, index) => (
              <motion.button
                key={tab.id}
                className={`${styles.tab} ${activeTab === tab.id ? styles.activeTab : ''}`}
                onClick={() => setActiveTab(tab.id)}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: index * 0.1 }}
                whileHover={{ x: 5 }}
              >
                <span className={styles.tabIcon}>{tab.icon}</span>
                <span className={styles.tabLabel}>{tab.label}</span>
              </motion.button>
            ))}
          </motion.div>

          <motion.div className={styles.tabContent} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.3 }}>
            {activeTab === 'servicemode' ? (
              <ServiceModeTab storeId={storeId} styles={styles} />
            ) : activeTab === 'upi' ? (
              <UpiSettingsTab storeId={storeId} styles={styles} />
            ) : (
              <form onSubmit={handleSubmit}>
                {activeTab === 'location' && (
                  <LocationTab
                    formData={formData}
                    handleInputChange={handleInputChange}
                    handleAutoDetectLocation={handleAutoDetectLocation}
                    detectingLocation={detectingLocation}
                  />
                )}
                {activeTab === 'hours' && (
                  <OperatingHoursTab
                    formData={formData}
                    handleInputChange={handleInputChange}
                    handleWorkingDaysChange={handleWorkingDaysChange}
                    handleOperatingHoursChange={handleOperatingHoursChange}
                  />
                )}
                {activeTab === 'queue' && (
                  <QueueSettingsTab formData={formData} handleInputChange={handleInputChange} />
                )}
                {activeTab === 'advanced' && (
                  <AdvancedTab formData={formData} handleInputChange={handleInputChange} router={router} />
                )}
              </form>
            )}
          </motion.div>
        </div>
      </main>
    </div>
  );
}

// ── Unchanged sub-components below ────────────────────────────────────────────

function LocationTab({ formData, handleInputChange, handleAutoDetectLocation, detectingLocation }) {
  return (
    <motion.div className={styles.section} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>Location Details</h2>
        <button type="button" className={styles.detectLocationBtn} onClick={handleAutoDetectLocation} disabled={detectingLocation}>
          {detectingLocation ? (<><span className={styles.spinner}></span>Detecting...</>) : (<><span className={styles.locationIcon}>📍</span>Auto-Detect Location</>)}
        </button>
      </div>
      <div className={styles.formGrid}>
        <div className={`${styles.formGroup} ${styles.fullWidth}`}>
          <label className={styles.label}>Address *</label>
          <textarea name="address" value={formData.address || ''} onChange={handleInputChange} className={styles.textarea} placeholder="Enter complete address" rows={3} required />
        </div>
        <div className={styles.formGroup}>
          <label className={styles.label}>City *</label>
          <input type="text" name="city" value={formData.city || ''} onChange={handleInputChange} className={styles.input} placeholder="City" required />
        </div>
        <div className={styles.formGroup}>
          <label className={styles.label}>State *</label>
          <input type="text" name="state" value={formData.state || ''} onChange={handleInputChange} className={styles.input} placeholder="State" required />
        </div>
        <div className={styles.formGroup}>
          <label className={styles.label}>Pincode *</label>
          <input type="text" name="pincode" value={formData.pincode || ''} onChange={handleInputChange} className={styles.input} placeholder="110001" required />
        </div>
        <div className={styles.formGroup}>
          <label className={styles.label}>Landmark</label>
          <input type="text" name="landmark" value={formData.landmark || ''} onChange={handleInputChange} className={styles.input} placeholder="Near..." />
        </div>
        <div className={styles.formGroup}>
          <label className={styles.label}>Latitude {formData.latitude && <span className={styles.coordBadge}>Detected</span>}</label>
          <input type="text" name="latitude" value={formData.latitude || ''} onChange={handleInputChange} className={styles.input} placeholder="28.6139" readOnly={detectingLocation} />
        </div>
        <div className={styles.formGroup}>
          <label className={styles.label}>Longitude {formData.longitude && <span className={styles.coordBadge}>Detected</span>}</label>
          <input type="text" name="longitude" value={formData.longitude || ''} onChange={handleInputChange} className={styles.input} placeholder="77.2090" readOnly={detectingLocation} />
        </div>
      </div>
      {formData.latitude && formData.longitude && (
        <div className={styles.mapPreview}>
          <p className={styles.mapText}>📍 Location: {formData.latitude}, {formData.longitude}</p>
        </div>
      )}
    </motion.div>
  );
}

function convertTo12Hour(time24) {
  if (!time24) return '';
  const [hours, minutes] = time24.split(':');
  const hour = parseInt(hours, 10);
  const period = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${hour12}:${minutes} ${period}`;
}

function OperatingHoursTab({ formData, handleInputChange, handleWorkingDaysChange, handleOperatingHoursChange }) {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const dayMap = { Mon: 'monday', Tue: 'tuesday', Wed: 'wednesday', Thu: 'thursday', Fri: 'friday', Sat: 'saturday', Sun: 'sunday' };

  return (
    <motion.div className={styles.section} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <h2 className={styles.sectionTitle}>Operating Hours</h2>
      <div className={styles.formGrid}>
        <div className={styles.formGroup}>
          <label className={styles.label}>General Opening Time</label>
          <div className={styles.timeInputWrapper}>
            <input type="time" name="opening_time" value={formData.opening_time || ''} onChange={handleInputChange} className={styles.input} />
            <span className={styles.timeDisplay}>{formData.opening_time && convertTo12Hour(formData.opening_time)}</span>
          </div>
        </div>
        <div className={styles.formGroup}>
          <label className={styles.label}>General Closing Time</label>
          <div className={styles.timeInputWrapper}>
            <input type="time" name="closing_time" value={formData.closing_time || ''} onChange={handleInputChange} className={styles.input} />
            <span className={styles.timeDisplay}>{formData.closing_time && convertTo12Hour(formData.closing_time)}</span>
          </div>
        </div>
      </div>
      <div className={styles.workingDaysSection}>
        <label className={styles.label}>Working Days</label>
        <div className={styles.dayButtons}>
          {days.map(day => (
            <button key={day} type="button" className={`${styles.dayButton} ${formData.working_days?.includes(day) ? styles.activeDayButton : ''}`} onClick={() => handleWorkingDaysChange(day)}>
              {day}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.detailedHours}>
        <h3 className={styles.subsectionTitle}>Detailed Hours by Day</h3>
        {Object.keys(dayMap).map(day => {
          const dayData = formData.operating_hours[dayMap[day]] || { open: '09:00', close: '21:00', closed: false };
          return (
            <div key={day} className={styles.dayHourRow}>
              <div className={styles.dayHourDay}>
                <input type="checkbox" id={`closed-${day}`} checked={!dayData.closed} onChange={(e) => handleOperatingHoursChange(dayMap[day], 'closed', !e.target.checked)} className={styles.checkbox} />
                <label htmlFor={`closed-${day}`}>{day}</label>
              </div>
              <div className={styles.dayHourInputs}>
                <div className={styles.timeInputGroup}>
                  <input type="time" value={dayData.open || '09:00'} onChange={(e) => handleOperatingHoursChange(dayMap[day], 'open', e.target.value)} className={styles.timeInput} disabled={dayData.closed} />
                  <span className={styles.timeLabel}>{!dayData.closed && convertTo12Hour(dayData.open || '09:00')}</span>
                </div>
                <span className={styles.timeSeparator}>to</span>
                <div className={styles.timeInputGroup}>
                  <input type="time" value={dayData.close || '21:00'} onChange={(e) => handleOperatingHoursChange(dayMap[day], 'close', e.target.value)} className={styles.timeInput} disabled={dayData.closed} />
                  <span className={styles.timeLabel}>{!dayData.closed && convertTo12Hour(dayData.close || '21:00')}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

function QueueSettingsTab({ formData, handleInputChange }) {
  return (
    <motion.div className={styles.section} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <h2 className={styles.sectionTitle}>Queue Management</h2>
      <div className={styles.formGrid}>
        <div className={styles.formGroup}>
          <label className={styles.label}>Max Tokens Per Hour</label>
          <input type="number" name="max_tokens_per_hour" value={formData.max_tokens_per_hour || 20} onChange={handleInputChange} className={styles.input} min="1" max="100" />
          <p className={styles.helpText}>Maximum number of tokens that can be issued per hour</p>
        </div>
        <div className={styles.formGroup}>
          <label className={styles.label}>Queue Capacity</label>
          <input type="number" name="queue_capacity" value={formData.queue_capacity || 50} onChange={handleInputChange} className={styles.input} min="1" max="500" />
          <p className={styles.helpText}>Total queue capacity</p>
        </div>
        <div className={styles.formGroup}>
          <label className={styles.label}>Avg Service Time (minutes)</label>
          <input type="number" name="avg_service_time" value={formData.avg_service_time || 15} onChange={handleInputChange} className={styles.input} min="1" max="120" />
          <p className={styles.helpText}>Average time to serve one customer</p>
        </div>
        <div className={styles.formGroup}>
          <label className={styles.label}>Estimated Service Time (minutes)</label>
          <input type="number" name="estimated_service_time" value={formData.estimated_service_time || 15} onChange={handleInputChange} className={styles.input} min="1" max="120" />
          <p className={styles.helpText}>Estimated time shown to customers</p>
        </div>
        <div className={styles.formGroup}>
          <label className={styles.label}>Notification Timing (minutes)</label>
          <input type="number" name="notification_timing" value={formData.notification_timing || 5} onChange={handleInputChange} className={styles.input} min="1" max="30" />
          <p className={styles.helpText}>Send notification X minutes before turn</p>
        </div>
        <div className={`${styles.formGroup} ${styles.fullWidth}`}>
          <label className={styles.switchLabel}>
            <input type="checkbox" name="auto_call_next" checked={formData.auto_call_next || false} onChange={handleInputChange} className={styles.switchInput} />
            <span className={styles.switch}></span>
            <span>Auto Call Next Customer</span>
          </label>
          <p className={styles.helpText}>Automatically notify next customer when previous is served</p>
        </div>
      </div>
    </motion.div>
  );
}

function AdvancedTab({ formData, handleInputChange, router }) {
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const handleDeleteAccount = async () => {
    if (!deletePassword) { setDeleteError('Please enter your password to confirm'); return; }
    setDeleteLoading(true);
    setDeleteError('');
    try {
      const result = await deleteAccount(deletePassword);
      if (result.success) {
        alert('Your account has been permanently deleted. You will now be redirected to the home page.');
        router.push('/');
      } else {
        setDeleteError(result.error || 'Failed to delete account');
      }
    } catch (error) {
      setDeleteError('An unexpected error occurred');
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <motion.div className={styles.section} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <h2 className={styles.sectionTitle}>Advanced Settings</h2>
      <div className={styles.formGrid}>
        <div className={`${styles.formGroup} ${styles.fullWidth}`}>
          <label className={styles.switchLabel}>
            <input type="checkbox" name="is_active" checked={formData.is_active || false} onChange={handleInputChange} className={styles.switchInput} />
            <span className={styles.switch}></span>
            <span>Store Active</span>
          </label>
          <p className={styles.helpText}>Make your store visible to customers</p>
        </div>
        <div className={`${styles.formGroup} ${styles.fullWidth}`}>
          <label className={styles.switchLabel}>
            <input type="checkbox" name="is_open" checked={formData.is_open || false} onChange={handleInputChange} className={styles.switchInput} />
            <span className={styles.switch}></span>
            <span>Store Currently Open</span>
          </label>
          <p className={styles.helpText}>Customers can join queue when store is open</p>
        </div>
        <div className={`${styles.formGroup} ${styles.fullWidth}`}>
          <div className={styles.dangerZone}>
            <h3>Danger Zone</h3>
            <p>Destructive actions that can affect your store operations</p>
            <button type="button" className={styles.dangerButton} onClick={() => { if (window.confirm('Are you sure you want to pause all queue operations?')) console.log('Pause queue operations'); }}>
              Pause All Queue Operations
            </button>
            <button type="button" className={styles.deleteAccountButton} onClick={() => setShowDeleteModal(true)}>
              🗑️ Delete Account Permanently
            </button>
          </div>
        </div>
      </div>
      {showDeleteModal && (
        <div className={styles.modalOverlay} onClick={() => setShowDeleteModal(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>Delete Account</h3>
            <p className={styles.modalWarning}>⚠️ <strong>Warning:</strong> This action is permanent and cannot be undone!</p>
            <p className={styles.modalText}>Deleting your account will permanently remove:</p>
            <ul className={styles.modalList}>
              <li>Your store and all its data</li>
              <li>All products and inventory</li>
              <li>Order history and customer records</li>
              <li>Queue management data</li>
              <li>Analytics and reports</li>
              <li>Payment settings and transaction history</li>
            </ul>
            <p className={styles.modalText}><strong>Enter your password to confirm deletion:</strong></p>
            <input type="password" value={deletePassword} onChange={(e) => { setDeletePassword(e.target.value); setDeleteError(''); }} className={styles.modalInput} placeholder="Enter your password" autoFocus />
            {deleteError && <p className={styles.modalError}>{deleteError}</p>}
            <div className={styles.modalActions}>
              <button type="button" onClick={() => { setShowDeleteModal(false); setDeletePassword(''); setDeleteError(''); }} className={styles.modalCancelButton} disabled={deleteLoading}>Cancel</button>
              <button type="button" onClick={handleDeleteAccount} className={styles.modalDeleteButton} disabled={deleteLoading}>{deleteLoading ? 'Deleting...' : 'Delete My Account'}</button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}