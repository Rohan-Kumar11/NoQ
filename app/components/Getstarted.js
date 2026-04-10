'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import Image from 'next/image'
import { signIn, signUpCustomer, signUpBusiness, signInWithGoogle, signUpEventOrganizer } from '@/lib/auth'
import Toast from './Toast'
import { useToast } from '../hooks/useToast'
import styles from './Getstarted.module.css'

export default function GetStarted() {
  const router = useRouter()
  const { toast, hideToast, success, error: showError } = useToast()
  const [isSignIn, setIsSignIn] = useState(true)
  const [userType, setUserType] = useState('customer') // 'customer' | 'business' | 'event_organizer'
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showVerificationDialog, setShowVerificationDialog] = useState(false)
  const [verificationEmail, setVerificationEmail] = useState('')
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    company: '',
    phone: '',
    password: '',
    preferredService: '',
    organizationType: '',
  })
  const [focusedField, setFocusedField] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      let result

      if (isSignIn) {
        result = await signIn(formData.email, formData.password)

        if (result.success) {
          success('Welcome back! Redirecting to dashboard...')
          setTimeout(() => {
            router.push(result.redirectTo || '/get-started')
          }, 1000)
        }
      } else {
        if (userType === 'customer') {
          result = await signUpCustomer({
            fullName: formData.fullName,
            email: formData.email,
            phone: formData.phone,
            password: formData.password,
            preferredService: formData.preferredService,
          })
        } else if (userType === 'business') {
          result = await signUpBusiness({
            fullName: formData.fullName,
            company: formData.company,
            email: formData.email,
            phone: formData.phone,
            password: formData.password,
          })
        } else if (userType === 'event_organizer') {
          result = await signUpEventOrganizer({
            fullName: formData.fullName,
            email: formData.email,
            phone: formData.phone,
            password: formData.password,
          })
        }

        if (result.success) {
          setVerificationEmail(formData.email)
          setShowVerificationDialog(true)
          success('Account created successfully! Check your email.')
        }
      }

      if (!result.success) {
        setError(result.error || 'An error occurred. Please try again.')
        showError(result.error || 'An error occurred. Please try again.')
      }
    } catch (err) {
      console.error('Form submission error:', err)
      const errorMessage = 'An unexpected error occurred. Please try again.'
      setError(errorMessage)
      showError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const handleVerificationDialogClose = () => {
    setShowVerificationDialog(false)
    setVerificationEmail('')
    setIsSignIn(true)
    resetForm()
    success('You can now sign in after verifying your email!')
  }

  const handleGoogleSignIn = async () => {
    setError('')
    setLoading(true)
    try {
      const result = await signInWithGoogle()
      if (!result.success) {
        const errorMsg = result.error || 'Failed to sign in with Google'
        setError(errorMsg)
        showError(errorMsg)
      }
    } catch (err) {
      console.error('Google sign in error:', err)
      const errorMsg = 'Failed to sign in with Google'
      setError(errorMsg)
      showError(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
    if (error) setError('')
  }

  const resetForm = () => {
    setFormData({
      fullName: '',
      email: '',
      company: '',
      phone: '',
      password: '',
      preferredService: '',
      organizationType: '',
    })
    setError('')
  }

  const handleModeSwitch = (mode) => {
    setIsSignIn(mode)
    resetForm()
  }

  const handleUserTypeSwitch = (type) => {
    setUserType(type)
    resetForm()
  }

  // Dynamic header text based on mode + type
  const getFormHeaderTitle = () => {
    if (isSignIn) return 'Welcome back'
    if (userType === 'customer') return 'Sign up as Customer'
    if (userType === 'business') return 'Sign up as Business'
    return 'Sign up as Organizer'
  }

  const getFormHeaderSubtitle = () => {
    if (isSignIn) return 'Sign in to your account'
    if (userType === 'customer') return 'Create your free account'
    if (userType === 'business') return 'No credit card required • 14-day free trial'
    return 'Manage queues for events, distributions & more'
  }

  // Verification dialog hint text per user type
  const getVerificationHint = () => {
    if (userType === 'event_organizer') return 'sign in and create your first event.'
    if (userType === 'business') return 'sign in and complete your store registration.'
    return 'sign in to start using NoQ.'
  }

  return (
    <div className={styles.container}>
      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.isVisible}
        onClose={hideToast}
        duration={toast.duration}
      />

      {/* Animated Background */}
      <div className={styles.backgroundElements}>
        <motion.div
          className={styles.circle1}
          animate={{ y: [0, -30, 0], x: [0, 20, 0] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className={styles.circle2}
          animate={{ y: [0, 40, 0], x: [0, -30, 0] }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className={styles.circle3}
          animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.5, 0.3] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      <div className={styles.contentWrapper}>
        {/* Left Panel */}
        <motion.div
          className={styles.leftPanel}
          initial={{ opacity: 0, x: -50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8 }}
        >
          <div className={styles.leftPanelContent}>
            <motion.a href="/" className={styles.logoLink} whileHover={{ scale: 1.05 }}>
              <Image
                src="/noq-logo_1.svg"
                alt="NoQ Logo"
                width={210}
                height={55}
                className={styles.logoImage}
                priority
              />
            </motion.a>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              Transform Your<br />
              <span className={styles.gradientText}>Customer Experience</span>
            </motion.h1>

            <motion.p
              className={styles.subtitle}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
            >
              Join thousands of businesses eliminating queues and delighting customers with NoQ's intelligent queue management.
            </motion.p>

            <motion.div
              className={styles.featuresList}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.6 }}
            >
              {[
                { icon: '⚡', text: '5-minute setup' },
                { icon: '📊', text: 'Real-time analytics' },
                { icon: '🔒', text: 'Enterprise security' },
                { icon: '💰', text: '340% ROI in year one' },
              ].map((feature, i) => (
                <motion.div
                  key={i}
                  className={styles.featureItem}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.5, delay: 0.8 + i * 0.1 }}
                >
                  <span className={styles.featureIcon}>{feature.icon}</span>
                  <span>{feature.text}</span>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </motion.div>

        {/* Right Panel - Form */}
        <motion.div
          className={styles.rightPanel}
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8 }}
        >
          <div className={styles.formContainer}>
            {/* Sign In / Sign Up Toggle */}
            <div className={styles.toggleContainer}>
              <button
                className={`${styles.toggleBtn} ${isSignIn ? styles.active : ''}`}
                onClick={() => handleModeSwitch(true)}
                disabled={loading}
              >
                Sign In
              </button>
              <button
                className={`${styles.toggleBtn} ${!isSignIn ? styles.active : ''}`}
                onClick={() => handleModeSwitch(false)}
                disabled={loading}
              >
                Sign Up
              </button>
              <motion.div
                className={styles.toggleIndicator}
                animate={{ x: isSignIn ? 0 : '100%' }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              />
            </div>

            {/* User Type Selection - Sign Up only */}
            {!isSignIn && (
              <motion.div
                className={styles.userTypeContainer}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                <button
                  className={`${styles.userTypeBtn} ${userType === 'customer' ? styles.active : ''}`}
                  onClick={() => handleUserTypeSwitch('customer')}
                  disabled={loading}
                >
                  <span className={styles.userTypeIcon}>👤</span>
                  <span>Customer</span>
                </button>
                <button
                  className={`${styles.userTypeBtn} ${userType === 'business' ? styles.active : ''}`}
                  onClick={() => handleUserTypeSwitch('business')}
                  disabled={loading}
                >
                  <span className={styles.userTypeIcon}>💼</span>
                  <span>Business</span>
                </button>
                {/* ── NEW: Event Organizer tab ── */}
                <button
                  className={`${styles.userTypeBtn} ${userType === 'event_organizer' ? styles.active : ''} ${styles.userTypeBtnEvent}`}
                  onClick={() => handleUserTypeSwitch('event_organizer')}
                  disabled={loading}
                >
                  <span className={styles.userTypeIcon}>🎪</span>
                  <span>Event</span>
                </button>
              </motion.div>
            )}

            {/* Form Header */}
            <motion.div
              className={styles.formHeader}
              key={`${isSignIn}-${userType}`}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
            >
              <h2>{getFormHeaderTitle()}</h2>
              <p>{getFormHeaderSubtitle()}</p>
            </motion.div>

            {/* Error Message */}
            {error && (
              <motion.div
                className={styles.errorMessage}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                {error}
              </motion.div>
            )}

            {/* Social Sign In */}
            <div className={styles.socialButtons}>
              <motion.button
                className={styles.socialBtn}
                onClick={handleGoogleSignIn}
                disabled={loading}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.98 }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Continue with Google
              </motion.button>
            </div>

            <div className={styles.divider}>
              <span>or</span>
            </div>

            {/* Forms */}
            <AnimatePresence mode="wait">
              <motion.form
                key={`${isSignIn}-${userType}-form`}
                className={styles.form}
                onSubmit={handleSubmit}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
              >
                {/* ── Sign In ── */}
                {isSignIn && (
                  <>
                    <FormField
                      label="Email Address" name="email" type="email"
                      placeholder="you@company.com" value={formData.email}
                      onChange={handleChange}
                      focused={focusedField === 'email'}
                      onFocus={() => setFocusedField('email')}
                      onBlur={() => setFocusedField(null)}
                      icon="📧" disabled={loading}
                    />
                    <FormField
                      label="Password" name="password" type="password"
                      placeholder="••••••••" value={formData.password}
                      onChange={handleChange}
                      focused={focusedField === 'password'}
                      onFocus={() => setFocusedField('password')}
                      onBlur={() => setFocusedField(null)}
                      icon="🔒" disabled={loading}
                    />
                    <div className={styles.forgotPassword}>
                      <a href="/forgot-password">Forgot password?</a>
                    </div>
                  </>
                )}

                {/* ── Customer Sign Up ── */}
                {!isSignIn && userType === 'customer' && (
                  <>
                    <FormField label="Full Name" name="fullName" type="text" placeholder="John Doe" value={formData.fullName} onChange={handleChange} focused={focusedField === 'fullName'} onFocus={() => setFocusedField('fullName')} onBlur={() => setFocusedField(null)} icon="👤" disabled={loading} />
                    <FormField label="Email Address" name="email" type="email" placeholder="you@example.com" value={formData.email} onChange={handleChange} focused={focusedField === 'email'} onFocus={() => setFocusedField('email')} onBlur={() => setFocusedField(null)} icon="📧" disabled={loading} />
                    <FormField label="Phone Number" name="phone" type="tel" placeholder="+91 XXXXX XXXXX" value={formData.phone} onChange={handleChange} focused={focusedField === 'phone'} onFocus={() => setFocusedField('phone')} onBlur={() => setFocusedField(null)} icon="📱" disabled={loading} />
                    <FormField label="Password" name="password" type="password" placeholder="••••••••" value={formData.password} onChange={handleChange} focused={focusedField === 'password'} onFocus={() => setFocusedField('password')} onBlur={() => setFocusedField(null)} icon="🔒" disabled={loading} />
                  </>
                )}

                {/* ── Business Sign Up ── */}
                {!isSignIn && userType === 'business' && (
                  <>
                    <FormField label="Full Name" name="fullName" type="text" placeholder="John Doe" value={formData.fullName} onChange={handleChange} focused={focusedField === 'fullName'} onFocus={() => setFocusedField('fullName')} onBlur={() => setFocusedField(null)} icon="👤" disabled={loading} />
                    <FormField label="Company Name" name="company" type="text" placeholder="Acme Inc." value={formData.company} onChange={handleChange} focused={focusedField === 'company'} onFocus={() => setFocusedField('company')} onBlur={() => setFocusedField(null)} icon="🏢" disabled={loading} />
                    <FormField label="Business Email" name="email" type="email" placeholder="you@company.com" value={formData.email} onChange={handleChange} focused={focusedField === 'email'} onFocus={() => setFocusedField('email')} onBlur={() => setFocusedField(null)} icon="📧" disabled={loading} />
                    <FormField label="Phone Number" name="phone" type="tel" placeholder="+91 XXXXX XXXXX" value={formData.phone} onChange={handleChange} focused={focusedField === 'phone'} onFocus={() => setFocusedField('phone')} onBlur={() => setFocusedField(null)} icon="📱" disabled={loading} />
                    <FormField label="Password" name="password" type="password" placeholder="••••••••" value={formData.password} onChange={handleChange} focused={focusedField === 'password'} onFocus={() => setFocusedField('password')} onBlur={() => setFocusedField(null)} icon="🔒" disabled={loading} />
                  </>
                )}

                {/* ── Event Organizer Sign Up ── */}
                {!isSignIn && userType === 'event_organizer' && (
                  <>
                    {/* Info banner */}
                    <motion.div
                      className={styles.eventInfoBanner}
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      <span className={styles.eventInfoIcon}>🎪</span>
                      <div>
                        <strong>Temporary event management</strong>
                        <p>Manage queues for food distributions, large dinners, mass registrations, conferences and more — without a permanent store.</p>
                      </div>
                    </motion.div>

                    <FormField label="Full Name" name="fullName" type="text" placeholder="Your full name" value={formData.fullName} onChange={handleChange} focused={focusedField === 'fullName'} onFocus={() => setFocusedField('fullName')} onBlur={() => setFocusedField(null)} icon="👤" disabled={loading} />
                    <FormField label="Email Address" name="email" type="email" placeholder="you@example.com" value={formData.email} onChange={handleChange} focused={focusedField === 'email'} onFocus={() => setFocusedField('email')} onBlur={() => setFocusedField(null)} icon="📧" disabled={loading} />
                    <FormField label="Phone Number" name="phone" type="tel" placeholder="+91 XXXXX XXXXX" value={formData.phone} onChange={handleChange} focused={focusedField === 'phone'} onFocus={() => setFocusedField('phone')} onBlur={() => setFocusedField(null)} icon="📱" disabled={loading} />

                    {/* Organization Type — select field, not a FormField */}
                    <div className={styles.formField}>
                      <label htmlFor="organizationType">Organization Type</label>
                      <div className={styles.inputWrapper}>
                        <span className={styles.inputIcon}>🏛️</span>
                        <select
                          id="organizationType"
                          name="organizationType"
                          className={styles.selectWithIcon}
                          value={formData.organizationType}
                          onChange={handleChange}
                          disabled={loading}
                        >
                          <option value="">Select (optional)...</option>
                          <option value="personal">Personal / Individual</option>
                          <option value="ngo">NGO / Trust / Charity</option>
                          <option value="corporate">Corporate</option>
                          <option value="government">Government / Municipality</option>
                          <option value="educational">School / College / University</option>
                          <option value="religious">Religious Organization</option>
                        </select>
                      </div>
                    </div>

                    <FormField label="Password" name="password" type="password" placeholder="Min. 8 characters" value={formData.password} onChange={handleChange} focused={focusedField === 'password'} onFocus={() => setFocusedField('password')} onBlur={() => setFocusedField(null)} icon="🔒" disabled={loading} />

                    {/* Feature chips */}
                    <div className={styles.eventFeatureChips}>
                      {['🍱 Food Distribution', '🍽️ Large Dinners', '📋 Registrations', '🎤 Conferences', '📅 General Events'].map(chip => (
                        <span key={chip} className={styles.eventChip}>{chip}</span>
                      ))}
                    </div>
                  </>
                )}

                {/* Submit */}
                <motion.button
                  type="submit"
                  className={`${styles.submitBtn} ${!isSignIn && userType === 'event_organizer' ? styles.submitBtnEvent : ''}`}
                  disabled={loading}
                  whileHover={{ scale: loading ? 1 : 1.02 }}
                  whileTap={{ scale: loading ? 1 : 0.98 }}
                >
                  {loading ? (
                    <span className={styles.loadingSpinner}>
                      <svg className={styles.spinner} viewBox="0 0 50 50">
                        <circle cx="25" cy="25" r="20" fill="none" strokeWidth="5"></circle>
                      </svg>
                      {isSignIn ? 'Signing in...' : 'Creating account...'}
                    </span>
                  ) : (
                    <>
                      {isSignIn
                        ? 'Sign In'
                        : userType === 'event_organizer'
                          ? 'Create Organizer Account'
                          : 'Start Free Trial'}
                      <span className={styles.btnArrow}>→</span>
                    </>
                  )}
                </motion.button>

                {!isSignIn && (
                  <p className={styles.terms}>
                    By signing up, you agree to our{' '}
                    <a href="#terms">Terms of Service</a> and{' '}
                    <a href="#privacy">Privacy Policy</a>
                  </p>
                )}

                <div className={styles.switchMode}>
                  <p>
                    {isSignIn ? "Don't have an account? " : 'Already have an account? '}
                    <button
                      type="button"
                      onClick={() => handleModeSwitch(!isSignIn)}
                      className={styles.switchModeBtn}
                      disabled={loading}
                    >
                      {isSignIn ? 'Sign up' : 'Sign in'}
                    </button>
                  </p>
                </div>
              </motion.form>
            </AnimatePresence>
          </div>
        </motion.div>
      </div>

      {/* Email Verification Dialog */}
      <AnimatePresence>
        {showVerificationDialog && (
          <>
            <motion.div
              className={styles.dialogBackdrop}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleVerificationDialogClose}
            />
            <motion.div
              className={styles.dialogContainer}
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: 'spring', duration: 0.5 }}
            >
              <div className={styles.dialog}>
                <motion.div
                  className={styles.dialogIcon}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
                >
                  <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
                    <circle cx="32" cy="32" r="32" fill="#10B981" fillOpacity="0.1" />
                    <path d="M32 16C23.16 16 16 23.16 16 32C16 40.84 23.16 48 32 48C40.84 48 48 40.84 48 32C48 23.16 40.84 16 32 16ZM32 44C25.37 44 20 38.63 20 32C20 25.37 25.37 20 32 20C38.63 20 44 25.37 44 32C44 38.63 38.63 44 32 44Z" fill="#10B981" />
                    <path d="M40 26L28 38L24 34" stroke="#10B981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </motion.div>

                <h2 className={styles.dialogTitle}>Check Your Email</h2>
                <p className={styles.dialogMessage}>We've sent a verification link to:</p>
                <p className={styles.dialogEmail}>{verificationEmail}</p>
                <p className={styles.dialogInstruction}>
                  Please click the link in the email to verify your account. Once verified,{' '}
                  {getVerificationHint()}
                </p>

                <div className={styles.dialogInfoBox}>
                  <span className={styles.infoIcon}>💡</span>
                  <p>Didn't receive the email? Check your spam folder or contact support.</p>
                </div>

                <motion.button
                  className={styles.dialogButton}
                  onClick={handleVerificationDialogClose}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  Got it, take me to Sign In
                  <span className={styles.btnArrow}>→</span>
                </motion.button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

function FormField({ label, name, type, placeholder, value, onChange, focused, onFocus, onBlur, icon, disabled }) {
  return (
    <motion.div
      className={`${styles.formField} ${focused ? styles.focused : ''}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <label htmlFor={name}>{label}</label>
      <div className={styles.inputWrapper}>
        <span className={styles.inputIcon}>{icon}</span>
        <input
          id={name}
          name={name}
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          onFocus={onFocus}
          onBlur={onBlur}
          disabled={disabled}
          required
        />
      </div>
    </motion.div>
  )
}