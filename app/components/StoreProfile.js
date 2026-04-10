'use client';

import { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import styles from './StoreProfile.module.css';

export default function StoreProfile() {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isEditing, setIsEditing] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);

  // Store Profile State
  const [storeData, setStoreData] = useState({
    // Basic Info
    storeName: 'NoQ Cafe & Restaurant',
    storeType: 'Restaurant',
    description: 'Authentic South Indian cuisine with modern twist. Fast service, great taste!',
    logo: null,
    
    // Contact
    phone: '+91 98765 43210',
    email: 'contact@noqcafe.com',
    website: 'www.noqcafe.com',
    
    // Location
    address: '123 MG Road',
    city: 'Bangalore',
    state: 'Karnataka',
    pincode: '560001',
    landmark: 'Near City Mall',
    
    // Operating Hours
    hours: {
      monday: { open: '09:00', close: '21:00', closed: false },
      tuesday: { open: '09:00', close: '21:00', closed: false },
      wednesday: { open: '09:00', close: '21:00', closed: false },
      thursday: { open: '09:00', close: '21:00', closed: false },
      friday: { open: '09:00', close: '22:00', closed: false },
      saturday: { open: '09:00', close: '22:00', closed: false },
      sunday: { open: '10:00', close: '21:00', closed: false },
    },
    
    // Queue Settings
    maxTokensPerHour: 20,
    avgServiceTime: 8,
    queueCapacity: 25,
    
    // Payment Settings
    paymentMethods: {
      cash: true,
      upi: true,
      card: true,
      wallet: true,
    },
    upiId: 'noqcafe@upi',
    
    // Bank Details
    bankName: 'HDFC Bank',
    accountNumber: 'XXXX XXXX 4523',
    ifscCode: 'HDFC0001234',
    accountHolder: 'NoQ Cafe',
  });

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (date) => {
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit',
      hour12: true 
    });
  };

  const formatDate = (date) => {
    return date.toLocaleDateString('en-US', { 
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const handleInputChange = (field, value) => {
    setStoreData(prev => ({ ...prev, [field]: value }));
  };

  const handleHoursChange = (day, field, value) => {
    setStoreData(prev => ({
      ...prev,
      hours: {
        ...prev.hours,
        [day]: { ...prev.hours[day], [field]: value }
      }
    }));
  };

  const handlePaymentToggle = (method) => {
    setStoreData(prev => ({
      ...prev,
      paymentMethods: {
        ...prev.paymentMethods,
        [method]: !prev.paymentMethods[method]
      }
    }));
  };

  const handleLogoUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setStoreData(prev => ({ ...prev, logo: reader.result }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = () => {
    // In production, save to backend
    alert('Store profile updated successfully!');
    setIsEditing(false);
  };

  const handleCancel = () => {
    // Reset changes or reload from backend
    setIsEditing(false);
  };

  return (
    <div className={styles.dashboard}>
      <Sidebar />

      <main className={styles.mainContent}>
        {/* Top Bar */}
        <header className={styles.topBar}>
          <div className={styles.topBarLeft}>
            <h1 className={styles.pageTitle}>Store Profile</h1>
            <div className={styles.dateTime}>
              <div className={styles.date}>{formatDate(currentTime)}</div>
              <div className={styles.time}>{formatTime(currentTime)}</div>
            </div>
          </div>
          <div className={styles.topBarRight}>
            <button 
              className={styles.previewBtn}
              onClick={() => setPreviewMode(!previewMode)}
            >
              {previewMode ? '✏️ Edit Mode' : '👁️ Preview'}
            </button>
            {isEditing ? (
              <>
                <button className={styles.cancelBtn} onClick={handleCancel}>
                  Cancel
                </button>
                <button className={styles.saveBtn} onClick={handleSave}>
                  💾 Save Changes
                </button>
              </>
            ) : (
              <button className={styles.editBtn} onClick={() => setIsEditing(true)}>
                ✏️ Edit Profile
              </button>
            )}
          </div>
        </header>

        {previewMode ? (
          /* Public Store Preview */
          <div className={styles.previewSection}>
            <div className={styles.previewCard}>
              <div className={styles.previewHeader}>
                {storeData.logo ? (
                  <img src={storeData.logo} alt="Store Logo" className={styles.previewLogo} />
                ) : (
                  <div className={styles.previewLogoPlaceholder}>🏪</div>
                )}
                <div className={styles.previewInfo}>
                  <h2 className={styles.previewStoreName}>{storeData.storeName}</h2>
                  <div className={styles.previewStoreType}>{storeData.storeType}</div>
                  <div className={styles.previewDescription}>{storeData.description}</div>
                </div>
              </div>

              <div className={styles.previewBody}>
                <div className={styles.previewSection}>
                  <h3 className={styles.previewSectionTitle}>📍 Location</h3>
                  <p className={styles.previewText}>
                    {storeData.address}, {storeData.landmark}<br />
                    {storeData.city}, {storeData.state} - {storeData.pincode}
                  </p>
                </div>

                <div className={styles.previewSection}>
                  <h3 className={styles.previewSectionTitle}>📞 Contact</h3>
                  <p className={styles.previewText}>
                    Phone: {storeData.phone}<br />
                    Email: {storeData.email}<br />
                    Website: {storeData.website}
                  </p>
                </div>

                <div className={styles.previewSection}>
                  <h3 className={styles.previewSectionTitle}>🕐 Opening Hours</h3>
                  <div className={styles.hoursPreview}>
                    {Object.entries(storeData.hours).map(([day, hours]) => (
                      <div key={day} className={styles.hourRow}>
                        <span className={styles.dayName}>{day.charAt(0).toUpperCase() + day.slice(1)}</span>
                        <span className={styles.hourTime}>
                          {hours.closed ? 'Closed' : `${hours.open} - ${hours.close}`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className={styles.previewSection}>
                  <h3 className={styles.previewSectionTitle}>💳 Accepted Payments</h3>
                  <div className={styles.paymentIcons}>
                    {storeData.paymentMethods.cash && <span className={styles.paymentIcon}>💵 Cash</span>}
                    {storeData.paymentMethods.upi && <span className={styles.paymentIcon}>📱 UPI</span>}
                    {storeData.paymentMethods.card && <span className={styles.paymentIcon}>💳 Card</span>}
                    {storeData.paymentMethods.wallet && <span className={styles.paymentIcon}>👛 Wallet</span>}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Edit Mode */
          <div className={styles.editSection}>
            {/* Basic Information */}
            <div className={styles.formCard}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>🏪 Basic Information</h2>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.logoUpload}>
                  {storeData.logo ? (
                    <img src={storeData.logo} alt="Store Logo" className={styles.logoPreview} />
                  ) : (
                    <div className={styles.logoPlaceholder}>
                      <span className={styles.logoIcon}>🏪</span>
                      <span className={styles.logoText}>No logo uploaded</span>
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    disabled={!isEditing}
                    className={styles.fileInput}
                    id="logoUpload"
                  />
                  <label htmlFor="logoUpload" className={styles.uploadBtn}>
                    📷 Upload Logo
                  </label>
                </div>

                <div className={styles.formGrid}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Store Name *</label>
                    <input
                      type="text"
                      value={storeData.storeName}
                      onChange={(e) => handleInputChange('storeName', e.target.value)}
                      disabled={!isEditing}
                      className={styles.formInput}
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Store Type *</label>
                    <select
                      value={storeData.storeType}
                      onChange={(e) => handleInputChange('storeType', e.target.value)}
                      disabled={!isEditing}
                      className={styles.formInput}
                    >
                      <option>Restaurant</option>
                      <option>Cafe</option>
                      <option>Bakery</option>
                      <option>Fast Food</option>
                      <option>Retail Store</option>
                      <option>Service Center</option>
                      <option>Other</option>
                    </select>
                  </div>

                  <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                    <label className={styles.formLabel}>Description</label>
                    <textarea
                      value={storeData.description}
                      onChange={(e) => handleInputChange('description', e.target.value)}
                      disabled={!isEditing}
                      className={styles.formTextarea}
                      rows={3}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Contact Information */}
            <div className={styles.formCard}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>📞 Contact Information</h2>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.formGrid}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Phone Number *</label>
                    <input
                      type="tel"
                      value={storeData.phone}
                      onChange={(e) => handleInputChange('phone', e.target.value)}
                      disabled={!isEditing}
                      className={styles.formInput}
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Email Address *</label>
                    <input
                      type="email"
                      value={storeData.email}
                      onChange={(e) => handleInputChange('email', e.target.value)}
                      disabled={!isEditing}
                      className={styles.formInput}
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Website</label>
                    <input
                      type="text"
                      value={storeData.website}
                      onChange={(e) => handleInputChange('website', e.target.value)}
                      disabled={!isEditing}
                      className={styles.formInput}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Location */}
            <div className={styles.formCard}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>📍 Location</h2>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.formGrid}>
                  <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                    <label className={styles.formLabel}>Address *</label>
                    <input
                      type="text"
                      value={storeData.address}
                      onChange={(e) => handleInputChange('address', e.target.value)}
                      disabled={!isEditing}
                      className={styles.formInput}
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>City *</label>
                    <input
                      type="text"
                      value={storeData.city}
                      onChange={(e) => handleInputChange('city', e.target.value)}
                      disabled={!isEditing}
                      className={styles.formInput}
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>State *</label>
                    <input
                      type="text"
                      value={storeData.state}
                      onChange={(e) => handleInputChange('state', e.target.value)}
                      disabled={!isEditing}
                      className={styles.formInput}
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>PIN Code *</label>
                    <input
                      type="text"
                      value={storeData.pincode}
                      onChange={(e) => handleInputChange('pincode', e.target.value)}
                      disabled={!isEditing}
                      className={styles.formInput}
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Landmark</label>
                    <input
                      type="text"
                      value={storeData.landmark}
                      onChange={(e) => handleInputChange('landmark', e.target.value)}
                      disabled={!isEditing}
                      className={styles.formInput}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Operating Hours */}
            <div className={styles.formCard}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>🕐 Operating Hours</h2>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.hoursGrid}>
                  {Object.entries(storeData.hours).map(([day, hours]) => (
                    <div key={day} className={styles.hourRow}>
                      <div className={styles.dayLabel}>
                        {day.charAt(0).toUpperCase() + day.slice(1)}
                      </div>
                      <div className={styles.timeInputs}>
                        <input
                          type="time"
                          value={hours.open}
                          onChange={(e) => handleHoursChange(day, 'open', e.target.value)}
                          disabled={!isEditing || hours.closed}
                          className={styles.timeInput}
                        />
                        <span>to</span>
                        <input
                          type="time"
                          value={hours.close}
                          onChange={(e) => handleHoursChange(day, 'close', e.target.value)}
                          disabled={!isEditing || hours.closed}
                          className={styles.timeInput}
                        />
                      </div>
                      <label className={styles.closedToggle}>
                        <input
                          type="checkbox"
                          checked={hours.closed}
                          onChange={(e) => handleHoursChange(day, 'closed', e.target.checked)}
                          disabled={!isEditing}
                        />
                        <span>Closed</span>
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Queue Settings */}
            <div className={styles.formCard}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>⚙️ Queue Settings</h2>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.formGrid}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Max Tokens Per Hour</label>
                    <input
                      type="number"
                      value={storeData.maxTokensPerHour}
                      onChange={(e) => handleInputChange('maxTokensPerHour', e.target.value)}
                      disabled={!isEditing}
                      className={styles.formInput}
                      min="1"
                      max="100"
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Avg Service Time (min)</label>
                    <input
                      type="number"
                      value={storeData.avgServiceTime}
                      onChange={(e) => handleInputChange('avgServiceTime', e.target.value)}
                      disabled={!isEditing}
                      className={styles.formInput}
                      min="1"
                      max="60"
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Queue Capacity</label>
                    <input
                      type="number"
                      value={storeData.queueCapacity}
                      onChange={(e) => handleInputChange('queueCapacity', e.target.value)}
                      disabled={!isEditing}
                      className={styles.formInput}
                      min="1"
                      max="100"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Payment Settings */}
            <div className={styles.formCard}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>💳 Payment Settings</h2>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.paymentMethods}>
                  <label className={styles.paymentMethod}>
                    <input
                      type="checkbox"
                      checked={storeData.paymentMethods.cash}
                      onChange={() => handlePaymentToggle('cash')}
                      disabled={!isEditing}
                    />
                    <span className={styles.paymentIcon}>💵</span>
                    <span>Cash</span>
                  </label>

                  <label className={styles.paymentMethod}>
                    <input
                      type="checkbox"
                      checked={storeData.paymentMethods.upi}
                      onChange={() => handlePaymentToggle('upi')}
                      disabled={!isEditing}
                    />
                    <span className={styles.paymentIcon}>📱</span>
                    <span>UPI</span>
                  </label>

                  <label className={styles.paymentMethod}>
                    <input
                      type="checkbox"
                      checked={storeData.paymentMethods.card}
                      onChange={() => handlePaymentToggle('card')}
                      disabled={!isEditing}
                    />
                    <span className={styles.paymentIcon}>💳</span>
                    <span>Card</span>
                  </label>

                  <label className={styles.paymentMethod}>
                    <input
                      type="checkbox"
                      checked={storeData.paymentMethods.wallet}
                      onChange={() => handlePaymentToggle('wallet')}
                      disabled={!isEditing}
                    />
                    <span className={styles.paymentIcon}>👛</span>
                    <span>Wallet</span>
                  </label>
                </div>

                {storeData.paymentMethods.upi && (
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>UPI ID</label>
                    <input
                      type="text"
                      value={storeData.upiId}
                      onChange={(e) => handleInputChange('upiId', e.target.value)}
                      disabled={!isEditing}
                      className={styles.formInput}
                      placeholder="yourname@upi"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Bank Details */}
            <div className={styles.formCard}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>🏦 Bank Details</h2>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.formGrid}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Bank Name</label>
                    <input
                      type="text"
                      value={storeData.bankName}
                      onChange={(e) => handleInputChange('bankName', e.target.value)}
                      disabled={!isEditing}
                      className={styles.formInput}
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Account Number</label>
                    <input
                      type="text"
                      value={storeData.accountNumber}
                      onChange={(e) => handleInputChange('accountNumber', e.target.value)}
                      disabled={!isEditing}
                      className={styles.formInput}
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>IFSC Code</label>
                    <input
                      type="text"
                      value={storeData.ifscCode}
                      onChange={(e) => handleInputChange('ifscCode', e.target.value)}
                      disabled={!isEditing}
                      className={styles.formInput}
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Account Holder Name</label>
                    <input
                      type="text"
                      value={storeData.accountHolder}
                      onChange={(e) => handleInputChange('accountHolder', e.target.value)}
                      disabled={!isEditing}
                      className={styles.formInput}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}