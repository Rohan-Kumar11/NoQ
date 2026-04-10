'use client';
import { completeSellerRegistration } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import { useToast } from '../../hooks/useToast'

import { useState } from 'react';
import styles from './SellerRegistration.module.css';

// Helper to convert 12-hour time to 24-hour for storage
function to24Hour(hour, minute, period) {
  let h = parseInt(hour);
  if (period === 'PM' && h !== 12) h += 12;
  if (period === 'AM' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${minute}`;
}

// Helper to convert 24-hour time to 12-hour parts
function to12Hour(time24) {
  if (!time24) return { hour: '09', minute: '00', period: 'AM' };
  const [h, m] = time24.split(':');
  let hour = parseInt(h);
  const period = hour >= 12 ? 'PM' : 'AM';
  if (hour > 12) hour -= 12;
  if (hour === 0) hour = 12;
  return { hour: String(hour).padStart(2, '0'), minute: m || '00', period };
}

function TimePickerField({ label, name, value, onChange, error, required }) {
  const { hour, minute, period } = to12Hour(value);

  const hours = Array.from({ length: 12 }, (_, i) =>
    String(i + 1).padStart(2, '0')
  );
  const minutes = ['00', '15', '30', '45'];

  const handleChange = (field, val) => {
    const newHour = field === 'hour' ? val : hour;
    const newMinute = field === 'minute' ? val : minute;
    const newPeriod = field === 'period' ? val : period;
    onChange({
      target: {
        name,
        value: to24Hour(newHour, newMinute, newPeriod),
      },
    });
  };

  return (
    <div className={styles.formGroup}>
      <label className={styles.label}>
        {label} {required && <span className={styles.required}>*</span>}
      </label>
      <div className={`${styles.timePicker} ${error ? styles.timePickerError : ''}`}>
        <select
          className={styles.timeSelect}
          value={hour}
          onChange={(e) => handleChange('hour', e.target.value)}
        >
          {hours.map((h) => (
            <option key={h} value={h}>{h}</option>
          ))}
        </select>
        <span className={styles.timeSeparator}>:</span>
        <select
          className={styles.timeSelect}
          value={minute}
          onChange={(e) => handleChange('minute', e.target.value)}
        >
          {minutes.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <div className={styles.periodToggle}>
          <button
            type="button"
            className={`${styles.periodBtn} ${period === 'AM' ? styles.periodBtnActive : ''}`}
            onClick={() => handleChange('period', 'AM')}
          >
            AM
          </button>
          <button
            type="button"
            className={`${styles.periodBtn} ${period === 'PM' ? styles.periodBtnActive : ''}`}
            onClick={() => handleChange('period', 'PM')}
          >
            PM
          </button>
        </div>
      </div>
      {error && <span className={styles.error}>{error}</span>}
    </div>
  );
}

export default function SellerRegistration() {
  const router = useRouter()
  const { success, error: showError } = useToast()

  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    // Step 1: Owner Details
    ownerName: '',
    ownerEmail: '',
    ownerPhone: '',
    ownerAadhar: '',

    // Step 2: Store Details
    storeName: '',
    storeType: '',
    storeAddress: '',
    storeCity: '',
    storeState: '',
    storePincode: '',
    openingTime: '',
    closingTime: '',
    workingDays: [],

    // Step 3: Payment Setup
    paymentMethod: 'upi',
    upiId: '',
    bankAccountNumber: '',
    bankIfscCode: '',
    bankAccountHolder: '',
    bankName: '',

    // Default Queue Preferences (will be sent but not shown to user)
    maxTokensPerHour: 10,
    notificationTiming: 5,
    autoCallNext: true,
    estimatedServiceTime: 15,
  });

  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const steps = [
    { number: 1, title: 'Owner Details', icon: '👤' },
    { number: 2, title: 'Store Details', icon: '🏪' },
    { number: 3, title: 'Payment Setup', icon: '💳' },
  ];

  const storeTypes = [
    { label: 'Retail Store', value: 'retail', icon: '🛒', hasProducts: true },
    { label: 'Restaurant', value: 'restaurant', icon: '🍽️', hasProducts: true },
    { label: 'Café', value: 'café', icon: '☕', hasProducts: true },
    { label: 'Bakery', value: 'bakery', icon: '🥐', hasProducts: true },
    { label: 'Clinic', value: 'clinic', icon: '🏥', hasProducts: false },
    { label: 'Lab', value: 'lab', icon: '🧪', hasProducts: true },
    { label: 'Salon', value: 'salon', icon: '💇', hasProducts: false }
  ];

  const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const handleWorkingDaysToggle = (day) => {
    setFormData(prev => ({
      ...prev,
      workingDays: prev.workingDays.includes(day)
        ? prev.workingDays.filter(d => d !== day)
        : [...prev.workingDays, day]
    }));
  };

  const validateStep = (step) => {
    const newErrors = {};

    if (step === 1) {
      if (!formData.ownerName.trim()) newErrors.ownerName = 'Name is required';
      if (!formData.ownerEmail.trim()) {
        newErrors.ownerEmail = 'Email is required';
      } else if (!/\S+@\S+\.\S+/.test(formData.ownerEmail)) {
        newErrors.ownerEmail = 'Invalid email format';
      }
      if (!formData.ownerPhone.trim()) {
        newErrors.ownerPhone = 'Phone is required';
      } else if (!/^\d{10}$/.test(formData.ownerPhone)) {
        newErrors.ownerPhone = 'Phone must be 10 digits';
      }
      if (!formData.ownerAadhar.trim()) {
        newErrors.ownerAadhar = 'Aadhar number is required';
      } else if (!/^\d{12}$/.test(formData.ownerAadhar)) {
        newErrors.ownerAadhar = 'Aadhar must be 12 digits';
      }
    }

    if (step === 2) {
      if (!formData.storeName.trim()) newErrors.storeName = 'Store name is required';
      if (!formData.storeType) newErrors.storeType = 'Store type is required';
      if (!formData.storeAddress.trim()) newErrors.storeAddress = 'Address is required';
      if (!formData.storeCity.trim()) newErrors.storeCity = 'City is required';
      if (!formData.storeState.trim()) newErrors.storeState = 'State is required';
      if (!formData.storePincode.trim()) {
        newErrors.storePincode = 'Pincode is required';
      } else if (!/^\d{6}$/.test(formData.storePincode)) {
        newErrors.storePincode = 'Pincode must be 6 digits';
      }
      if (!formData.openingTime) newErrors.openingTime = 'Opening time is required';
      if (!formData.closingTime) newErrors.closingTime = 'Closing time is required';
      if (formData.workingDays.length === 0) newErrors.workingDays = 'Select at least one working day';
    }

    if (step === 3) {
      if (formData.paymentMethod === 'upi') {
        if (!formData.upiId.trim()) {
          newErrors.upiId = 'UPI ID is required';
        } else if (!/^[\w.-]+@[\w.-]+$/.test(formData.upiId)) {
          newErrors.upiId = 'Invalid UPI ID format';
        }
      } else if (formData.paymentMethod === 'bank') {
        if (!formData.bankAccountNumber.trim()) newErrors.bankAccountNumber = 'Account number is required';
        if (!formData.bankIfscCode.trim()) {
          newErrors.bankIfscCode = 'IFSC code is required';
        } else if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(formData.bankIfscCode)) {
          newErrors.bankIfscCode = 'Invalid IFSC format';
        }
        if (!formData.bankAccountHolder.trim()) newErrors.bankAccountHolder = 'Account holder name is required';
        if (!formData.bankName.trim()) newErrors.bankName = 'Bank name is required';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(prev + 1, 3));
    }
  };

  const handlePrevious = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (currentStep !== 3) {
      handleNext()
      return
    }

    if (!validateStep(3)) {
      showError('Please fill in all required fields correctly')
      return
    }

    setIsSubmitting(true)

    try {
      console.log('Submitting registration with data:', formData)

      const payload = {
        ...formData,
        maxTokensPerHour: Number(formData.maxTokensPerHour),
        estimatedServiceTime: Number(formData.estimatedServiceTime),
        notificationTiming: Number(formData.notificationTiming),
      }

      const result = await completeSellerRegistration(payload)

      console.log('Registration result:', result)

      if (result.success) {
        success('Registration completed! Redirecting to dashboard...')
        setTimeout(() => {
          router.push('/seller/dashboard')
        }, 1500)
      } else {
        showError(result.error || 'Registration failed. Please try again.')
      }
    } catch (error) {
      console.error('Registration error:', error)
      showError('An error occurred. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const progressPercentage = (currentStep / 3) * 100;

  return (
    <div className={styles.container}>
      <div className={styles.formWrapper}>
        <div className={styles.header}>
          <div className={styles.logo}>
            <span className={styles.logoIcon}>🎫</span>
            <h1 className={styles.logoText}>NoQ</h1>
          </div>
          <p className={styles.subtitle}>Seller Registration</p>
        </div>

        <div className={styles.progressSection}>
          <div className={styles.progressBar}>
            <div
              className={styles.progressFill}
              style={{ width: `${progressPercentage}%` }}
            ></div>
          </div>
          <div className={styles.steps}>
            {steps.map((step) => (
              <div
                key={step.number}
                className={`${styles.step} ${currentStep === step.number ? styles.stepActive : ''
                  } ${currentStep > step.number ? styles.stepCompleted : ''}`}
              >
                <div className={styles.stepIcon}>
                  {currentStep > step.number ? '✓' : step.icon}
                </div>
                <div className={styles.stepInfo}>
                  <span className={styles.stepNumber}>Step {step.number}</span>
                  <span className={styles.stepTitle}>{step.title}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <form
          onSubmit={currentStep === 3 ? handleSubmit : undefined}
          className={styles.form}
        >

          {/* Step 1: Owner Details */}
          {currentStep === 1 && (
            <div className={`${styles.stepContent} ${styles.fadeIn}`}>
              <h2 className={styles.stepHeading}>👤 Owner Details</h2>
              <p className={styles.stepDescription}>Let's start with your personal information</p>

              <div className={styles.formGrid}>
                <div className={styles.formGroup}>
                  <label htmlFor="ownerName" className={styles.label}>
                    Full Name <span className={styles.required}>*</span>
                  </label>
                  <input
                    type="text"
                    id="ownerName"
                    name="ownerName"
                    value={formData.ownerName}
                    onChange={handleInputChange}
                    className={`${styles.input} ${errors.ownerName ? styles.inputError : ''}`}
                    placeholder="John Doe"
                  />
                  {errors.ownerName && <span className={styles.error}>{errors.ownerName}</span>}
                </div>

                <div className={styles.formGroup}>
                  <label htmlFor="ownerEmail" className={styles.label}>
                    Email Address <span className={styles.required}>*</span>
                  </label>
                  <input
                    type="email"
                    id="ownerEmail"
                    name="ownerEmail"
                    value={formData.ownerEmail}
                    onChange={handleInputChange}
                    className={`${styles.input} ${errors.ownerEmail ? styles.inputError : ''}`}
                    placeholder="john@example.com"
                  />
                  {errors.ownerEmail && <span className={styles.error}>{errors.ownerEmail}</span>}
                </div>

                <div className={styles.formGroup}>
                  <label htmlFor="ownerPhone" className={styles.label}>
                    Phone Number <span className={styles.required}>*</span>
                  </label>
                  <input
                    type="tel"
                    id="ownerPhone"
                    name="ownerPhone"
                    value={formData.ownerPhone}
                    onChange={handleInputChange}
                    className={`${styles.input} ${errors.ownerPhone ? styles.inputError : ''}`}
                    placeholder="9876543210"
                    maxLength="10"
                  />
                  {errors.ownerPhone && <span className={styles.error}>{errors.ownerPhone}</span>}
                </div>

                <div className={styles.formGroup}>
                  <label htmlFor="ownerAadhar" className={styles.label}>
                    GST Number <span className={styles.required}>*</span>
                  </label>
                  <input
                    type="text"
                    id="ownerAadhar"
                    name="ownerAadhar"
                    value={formData.ownerAadhar}
                    onChange={handleInputChange}
                    className={`${styles.input} ${errors.ownerAadhar ? styles.inputError : ''}`}
                    placeholder="123456789012"
                    maxLength="12"
                  />
                  {errors.ownerAadhar && <span className={styles.error}>{errors.ownerAadhar}</span>}
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Store Details */}
          {currentStep === 2 && (
            <div className={`${styles.stepContent} ${styles.fadeIn}`}>
              <h2 className={styles.stepHeading}>🏪 Store Details</h2>
              <p className={styles.stepDescription}>Tell us about your business</p>

              <div className={styles.formGrid}>
                <div className={styles.formGroup}>
                  <label htmlFor="storeName" className={styles.label}>
                    Store Name <span className={styles.required}>*</span>
                  </label>
                  <input
                    type="text"
                    id="storeName"
                    name="storeName"
                    value={formData.storeName}
                    onChange={handleInputChange}
                    className={`${styles.input} ${errors.storeName ? styles.inputError : ''}`}
                    placeholder="Amazing Coffee Shop"
                  />
                  {errors.storeName && <span className={styles.error}>{errors.storeName}</span>}
                </div>

                <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                  <label className={styles.label}>
                    Store Type <span className={styles.required}>*</span>
                  </label>
                  <div className={styles.storeTypeGrid}>
                    {storeTypes.map((type) => (
                      <button
                        key={type.value}
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, storeType: type.value }))}
                        className={`${styles.storeTypeCard} ${
                          formData.storeType === type.value ? styles.storeTypeCardActive : ''
                        }`}
                      >
                        <span className={styles.storeTypeIcon}>{type.icon}</span>
                        <span className={styles.storeTypeLabel}>{type.label}</span>
                      </button>
                    ))}
                  </div>
                  {errors.storeType && <span className={styles.error}>{errors.storeType}</span>}
                </div>

                <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                  <label htmlFor="storeAddress" className={styles.label}>
                    Store Address <span className={styles.required}>*</span>
                  </label>
                  <input
                    type="text"
                    id="storeAddress"
                    name="storeAddress"
                    value={formData.storeAddress}
                    onChange={handleInputChange}
                    className={`${styles.input} ${errors.storeAddress ? styles.inputError : ''}`}
                    placeholder="123 Main Street, Building A"
                  />
                  {errors.storeAddress && <span className={styles.error}>{errors.storeAddress}</span>}
                </div>

                <div className={styles.formGroup}>
                  <label htmlFor="storeCity" className={styles.label}>
                    City <span className={styles.required}>*</span>
                  </label>
                  <input
                    type="text"
                    id="storeCity"
                    name="storeCity"
                    value={formData.storeCity}
                    onChange={handleInputChange}
                    className={`${styles.input} ${errors.storeCity ? styles.inputError : ''}`}
                    placeholder="Mumbai"
                  />
                  {errors.storeCity && <span className={styles.error}>{errors.storeCity}</span>}
                </div>

                <div className={styles.formGroup}>
                  <label htmlFor="storeState" className={styles.label}>
                    State <span className={styles.required}>*</span>
                  </label>
                  <input
                    type="text"
                    id="storeState"
                    name="storeState"
                    value={formData.storeState}
                    onChange={handleInputChange}
                    className={`${styles.input} ${errors.storeState ? styles.inputError : ''}`}
                    placeholder="Maharashtra"
                  />
                  {errors.storeState && <span className={styles.error}>{errors.storeState}</span>}
                </div>

                <div className={styles.formGroup}>
                  <label htmlFor="storePincode" className={styles.label}>
                    Pincode <span className={styles.required}>*</span>
                  </label>
                  <input
                    type="text"
                    id="storePincode"
                    name="storePincode"
                    value={formData.storePincode}
                    onChange={handleInputChange}
                    className={`${styles.input} ${errors.storePincode ? styles.inputError : ''}`}
                    placeholder="400001"
                    maxLength="6"
                  />
                  {errors.storePincode && <span className={styles.error}>{errors.storePincode}</span>}
                </div>

                {/* AM/PM Time Pickers */}
                <TimePickerField
                  label="Opening Time"
                  name="openingTime"
                  value={formData.openingTime}
                  onChange={handleInputChange}
                  error={errors.openingTime}
                  required
                />

                <TimePickerField
                  label="Closing Time"
                  name="closingTime"
                  value={formData.closingTime}
                  onChange={handleInputChange}
                  error={errors.closingTime}
                  required
                />

                <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                  <label className={styles.label}>
                    Working Days <span className={styles.required}>*</span>
                  </label>
                  <div className={styles.daysGrid}>
                    {weekDays.map(day => (
                      <button
                        key={day}
                        type="button"
                        onClick={() => handleWorkingDaysToggle(day)}
                        className={`${styles.dayButton} ${formData.workingDays.includes(day) ? styles.dayButtonActive : ''
                          }`}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                  {errors.workingDays && <span className={styles.error}>{errors.workingDays}</span>}
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Payment Setup */}
          {currentStep === 3 && (
            <div className={`${styles.stepContent} ${styles.fadeIn}`}>
              <h2 className={styles.stepHeading}>💳 Payment Setup</h2>
              <p className={styles.stepDescription}>Configure your payment details to complete registration</p>

              <div className={styles.paymentMethodSelector}>
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, paymentMethod: 'upi' }))}
                  className={`${styles.methodButton} ${formData.paymentMethod === 'upi' ? styles.methodButtonActive : ''
                    }`}
                >
                  <span className={styles.methodIcon}>📱</span>
                  <span>UPI</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, paymentMethod: 'bank' }))}
                  className={`${styles.methodButton} ${formData.paymentMethod === 'bank' ? styles.methodButtonActive : ''
                    }`}
                >
                  <span className={styles.methodIcon}>🏦</span>
                  <span>Bank Account</span>
                </button>
              </div>

              {formData.paymentMethod === 'upi' && (
                <div className={styles.formGrid}>
                  <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                    <label htmlFor="upiId" className={styles.label}>
                      UPI ID <span className={styles.required}>*</span>
                    </label>
                    <input
                      type="text"
                      id="upiId"
                      name="upiId"
                      value={formData.upiId}
                      onChange={handleInputChange}
                      className={`${styles.input} ${errors.upiId ? styles.inputError : ''}`}
                      placeholder="yourname@paytm"
                    />
                    {errors.upiId && <span className={styles.error}>{errors.upiId}</span>}
                    <p className={styles.hint}>Enter your UPI ID (e.g., name@bank)</p>
                  </div>
                </div>
              )}

              {formData.paymentMethod === 'bank' && (
                <div className={styles.formGrid}>
                  <div className={styles.formGroup}>
                    <label htmlFor="bankAccountHolder" className={styles.label}>
                      Account Holder Name <span className={styles.required}>*</span>
                    </label>
                    <input
                      type="text"
                      id="bankAccountHolder"
                      name="bankAccountHolder"
                      value={formData.bankAccountHolder}
                      onChange={handleInputChange}
                      className={`${styles.input} ${errors.bankAccountHolder ? styles.inputError : ''}`}
                      placeholder="John Doe"
                    />
                    {errors.bankAccountHolder && <span className={styles.error}>{errors.bankAccountHolder}</span>}
                  </div>

                  <div className={styles.formGroup}>
                    <label htmlFor="bankName" className={styles.label}>
                      Bank Name <span className={styles.required}>*</span>
                    </label>
                    <input
                      type="text"
                      id="bankName"
                      name="bankName"
                      value={formData.bankName}
                      onChange={handleInputChange}
                      className={`${styles.input} ${errors.bankName ? styles.inputError : ''}`}
                      placeholder="State Bank of India"
                    />
                    {errors.bankName && <span className={styles.error}>{errors.bankName}</span>}
                  </div>

                  <div className={styles.formGroup}>
                    <label htmlFor="bankAccountNumber" className={styles.label}>
                      Account Number <span className={styles.required}>*</span>
                    </label>
                    <input
                      type="text"
                      id="bankAccountNumber"
                      name="bankAccountNumber"
                      value={formData.bankAccountNumber}
                      onChange={handleInputChange}
                      className={`${styles.input} ${errors.bankAccountNumber ? styles.inputError : ''}`}
                      placeholder="1234567890"
                    />
                    {errors.bankAccountNumber && <span className={styles.error}>{errors.bankAccountNumber}</span>}
                  </div>

                  <div className={styles.formGroup}>
                    <label htmlFor="bankIfscCode" className={styles.label}>
                      IFSC Code <span className={styles.required}>*</span>
                    </label>
                    <input
                      type="text"
                      id="bankIfscCode"
                      name="bankIfscCode"
                      value={formData.bankIfscCode}
                      onChange={handleInputChange}
                      className={`${styles.input} ${errors.bankIfscCode ? styles.inputError : ''}`}
                      placeholder="SBIN0001234"
                      maxLength="11"
                    />
                    {errors.bankIfscCode && <span className={styles.error}>{errors.bankIfscCode}</span>}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Navigation Buttons */}
          <div className={styles.navigation}>
            {currentStep > 1 && (
              <button
                type="button"
                onClick={handlePrevious}
                className={styles.buttonSecondary}
                disabled={isSubmitting}
              >
                ← Previous
              </button>
            )}

            {currentStep < 3 ? (
              <button
                type="button"
                onClick={handleNext}
                className={styles.buttonPrimary}
              >
                Next →
              </button>
            ) : (
              <button
                type="submit"
                className={styles.buttonPrimary}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <span className={styles.spinner}></span>
                    Submitting...
                  </>
                ) : (
                  'Complete Registration'
                )}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}