// lib/auth.js — COMPLETE FILE
// Changes from original:
//   1. Added signUpEventOrganizer()
//   2. Added completeEventOrganizerRegistration()
//   3. Updated getRedirectPath() to handle event_organizer → /events/dashboard

import { supabase } from './supabase'

/**
 * Complete seller registration using database function
 */
export async function completeSellerRegistration(registrationData) {
  try {
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) throw new Error('Not authenticated')

    const { data, error } = await supabase.rpc('complete_seller_registration', {
      p_owner_name: registrationData.ownerName,
      p_owner_email: registrationData.ownerEmail,
      p_owner_phone: registrationData.ownerPhone,
      p_owner_aadhar: registrationData.ownerAadhar,
      p_store_name: registrationData.storeName,
      p_store_type: registrationData.storeType,
      p_address: registrationData.storeAddress,
      p_city: registrationData.storeCity,
      p_state: registrationData.storeState,
      p_pincode: registrationData.storePincode,
      p_opening_time: registrationData.openingTime,
      p_closing_time: registrationData.closingTime,
      p_working_days: registrationData.workingDays,
      p_max_tokens_per_hour: registrationData.maxTokensPerHour,
      p_notification_timing: registrationData.notificationTiming,
      p_auto_call_next: registrationData.autoCallNext,
      p_estimated_service_time: registrationData.estimatedServiceTime,
      p_payment_method: registrationData.paymentMethod,
      p_upi_id: registrationData.paymentMethod === 'upi' ? registrationData.upiId : null,
      p_bank_account_number: registrationData.paymentMethod === 'bank' ? registrationData.bankAccountNumber : null,
      p_bank_ifsc_code: registrationData.paymentMethod === 'bank' ? registrationData.bankIfscCode : null,
      p_bank_account_holder: registrationData.paymentMethod === 'bank' ? registrationData.bankAccountHolder : null,
      p_bank_name: registrationData.paymentMethod === 'bank' ? registrationData.bankName : null,
    })

    if (error) {
      console.error('Database function error:', error)
      throw error
    }

    if (data && data.success) {
      return {
        success: true,
        data: { store_id: data.store_id, store_name: data.store_name },
        message: data.message || 'Registration completed successfully!',
      }
    }
    return { success: false, error: data?.error || 'Registration failed' }
  } catch (error) {
    console.error('Registration completion error:', error)
    return { success: false, error: error.message || 'Failed to complete registration' }
  }
}

/**
 * Sign in and check registration status for redirect
 */
export async function signIn(email, password) {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error

    if (data.user) {
      await supabase.rpc('track_login', { p_user_id: data.user.id })

      const { data: statusData } = await supabase
        .rpc('check_registration_status', { p_user_id: data.user.id })

      return {
        success: true,
        user: data.user,
        session: data.session,
        userType: statusData?.user_type,
        registrationCompleted: statusData?.registration_completed,
        hasStore: statusData?.has_store,
        redirectTo: getRedirectPath(statusData),
      }
    }
    return { success: false, error: 'Sign in failed' }
  } catch (error) {
    console.error('Sign in error:', error)
    return { success: false, error: error.message || 'An error occurred during sign in' }
  }
}

/**
 * Determine redirect path based on user status
 * ✅ UPDATED: handles event_organizer → /events/dashboard
 */
function getRedirectPath(status) {
  if (!status) return '/get-started'

  const { user_type, registration_completed, has_store } = status

  if (user_type === 'customer') return '/buyer'

  if (user_type === 'business') {
    if (!registration_completed || !has_store) return '/seller/register'
    return '/seller/dashboard'
  }

  // ✅ NEW: event organizer lands on events dashboard
  if (user_type === 'event_organizer') return '/events/dashboard'

  return '/get-started'
}

/**
 * Sign up customer
 */
export async function signUpCustomer({ fullName, email, phone, password, preferredService }) {
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          user_type: 'customer',
          full_name: fullName,
          phone,
          preferred_service: preferredService,
        },
      },
    })
    if (error) throw error
    return {
      success: true,
      user: data.user,
      message: 'Please check your email to verify your account',
    }
  } catch (error) {
    console.error('Sign up error:', error)
    return { success: false, error: error.message || 'An error occurred during sign up' }
  }
}

/**
 * Sign up business
 */
export async function signUpBusiness({ fullName, company, email, phone, password, businessType, address }) {
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          user_type: 'business',
          full_name: fullName,
          phone,
          company_name: company,
          business_type: businessType,
          address,
          business_email: email,
        },
      },
    })
    if (error) throw error
    return {
      success: true,
      user: data.user,
      message: 'Please check your email to verify your account. After verification, complete your registration.',
    }
  } catch (error) {
    console.error('Sign up error:', error)
    return { success: false, error: error.message || 'An error occurred during sign up' }
  }
}

/**
 * ✅ NEW: Sign up event organizer
 * Matches the exact pattern of signUpCustomer / signUpBusiness.
 * No store registration required — profile is enough to start creating events.
 */
export async function signUpEventOrganizer({ fullName, email, phone, password }) {
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          user_type: 'event_organizer',
          full_name: fullName,
          phone,
        },
      },
    })
    if (error) throw error
    return {
      success: true,
      user: data.user,
      message: 'Account created! Check your email to verify, then sign in to create your first event.',
    }
  } catch (error) {
    console.error('Event organizer sign up error:', error)
    return { success: false, error: error.message || 'An error occurred during sign up' }
  }
}

/**
 * ✅ NEW: Complete event organizer registration after email verification.
 * Calls the complete_event_organizer_registration RPC to upsert the profile row.
 * Matches the pattern of completeSellerRegistration.
 */
export async function completeEventOrganizerRegistration() {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { data, error } = await supabase.rpc('complete_event_organizer_registration', {
      p_user_id: user.id,
      p_full_name: user.user_metadata?.full_name || '',
      p_phone: user.user_metadata?.phone || '',
    })

    if (error) throw error

    return data?.success
      ? { success: true, message: data.message }
      : { success: false, error: data?.error || 'Registration failed' }
  } catch (error) {
    console.error('Event organizer registration error:', error)
    return { success: false, error: error.message || 'Failed to complete registration' }
  }
}

/**
 * Check if user needs to complete registration
 */
export async function checkRegistrationStatus() {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Not authenticated' }

    const { data, error } = await supabase.rpc('check_registration_status', { p_user_id: user.id })
    if (error) throw error

    return {
      success: true,
      userType: data.user_type,
      registrationCompleted: data.registration_completed,
      hasStore: data.has_store,
      needsRegistration: data.user_type === 'business' && (!data.registration_completed || !data.has_store),
    }
  } catch (error) {
    console.error('Status check error:', error)
    return { success: false, error: error.message || 'Failed to check registration status' }
  }
}

/**
 * Get seller dashboard data
 */
export async function getSellerDashboard() {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { data, error } = await supabase.rpc('get_seller_dashboard', { p_seller_id: user.id })
    if (error) throw error
    return { success: true, data }
  } catch (error) {
    console.error('Dashboard fetch error:', error)
    return { success: false, error: error.message || 'Failed to fetch dashboard data' }
  }
}

/**
 * Get Store Details
 */
export async function getStoreDetails() {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { data, error } = await supabase
      .from('stores')
      .select('*, payment_settings (*)')
      .eq('business_id', user.id)
      .single()

    if (error) throw error
    return { success: true, data }
  } catch (error) {
    console.error('Store fetch error:', error)
    return { success: false, error: error.message || 'Failed to fetch store details' }
  }
}

/**
 * Update Store Profile
 */
export async function updateStoreProfile(updates) {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { data: store } = await supabase.from('stores').select('id').eq('business_id', user.id).single()
    if (!store) throw new Error('Store not found')

    const { error: storeError } = await supabase.from('stores').update(updates).eq('id', store.id)
    if (storeError) throw storeError

    return { success: true, message: 'Store profile updated successfully' }
  } catch (error) {
    console.error('Store update error:', error)
    return { success: false, error: error.message || 'Failed to update store profile' }
  }
}

/**
 * Get Products
 */
export async function getProducts() {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { data: store } = await supabase.from('stores').select('id').eq('business_id', user.id).single()
    if (!store) throw new Error('Store not found')

    const { data, error } = await supabase.from('products').select('*').eq('store_id', store.id).order('created_at', { ascending: false })
    if (error) throw error
    return { success: true, data: data || [] }
  } catch (error) {
    console.error('Products fetch error:', error)
    return { success: false, error: error.message || 'Failed to fetch products', data: [] }
  }
}

/**
 * Add Product
 */
export async function addProduct(productData) {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { data: store } = await supabase.from('stores').select('id').eq('business_id', user.id).single()
    if (!store) throw new Error('Store not found')

    const { data, error } = await supabase.from('products').insert([{ store_id: store.id, ...productData }]).select().single()
    if (error) throw error
    return { success: true, data, message: 'Product added successfully' }
  } catch (error) {
    console.error('Product add error:', error)
    return { success: false, error: error.message || 'Failed to add product' }
  }
}

/**
 * Update Product
 */
export async function updateProduct(productId, updates) {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { error } = await supabase.from('products').update(updates).eq('id', productId)
    if (error) throw error
    return { success: true, message: 'Product updated successfully' }
  } catch (error) {
    console.error('Product update error:', error)
    return { success: false, error: error.message || 'Failed to update product' }
  }
}

/**
 * Delete Product
 */
export async function deleteProduct(productId) {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { error } = await supabase.from('products').delete().eq('id', productId)
    if (error) throw error
    return { success: true, message: 'Product deleted successfully' }
  } catch (error) {
    console.error('Product delete error:', error)
    return { success: false, error: error.message || 'Failed to delete product' }
  }
}

/**
 * Get Queue
 */
export async function getQueue() {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { data: store } = await supabase.from('stores').select('id').eq('business_id', user.id).single()
    if (!store) throw new Error('Store not found')

    const { data, error } = await supabase
      .from('queue').select('*').eq('store_id', store.id)
      .in('status', ['waiting', 'notified', 'serving'])
      .order('issued_at', { ascending: true })
    if (error) throw error
    return { success: true, data: data || [] }
  } catch (error) {
    console.error('Queue fetch error:', error)
    return { success: false, error: error.message || 'Failed to fetch queue', data: [] }
  }
}

/**
 * Update Queue Status
 */
export async function updateQueueStatus(queueId, status) {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const updates = { status }
    if (status === 'serving') updates.service_started_at = new Date().toISOString()
    else if (status === 'served') updates.service_completed_at = new Date().toISOString()
    else if (status === 'notified') updates.notified_at = new Date().toISOString()

    const { error } = await supabase.from('queue').update(updates).eq('id', queueId)
    if (error) throw error
    return { success: true, message: 'Queue status updated successfully' }
  } catch (error) {
    console.error('Queue update error:', error)
    return { success: false, error: error.message || 'Failed to update queue status' }
  }
}

/**
 * Get Orders
 */
export async function getOrders(filters = {}) {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { data: store } = await supabase.from('stores').select('id').eq('business_id', user.id).single()
    if (!store) throw new Error('Store not found')

    let query = supabase.from('orders').select('*').eq('store_id', store.id).order('ordered_at', { ascending: false })
    if (filters.status) query = query.eq('order_status', filters.status)
    if (filters.payment_status) query = query.eq('payment_status', filters.payment_status)
    if (filters.date) query = query.gte('ordered_at', `${filters.date}T00:00:00`).lte('ordered_at', `${filters.date}T23:59:59`)

    const { data, error } = await query
    if (error) throw error
    return { success: true, data: data || [] }
  } catch (error) {
    console.error('Orders fetch error:', error)
    return { success: false, error: error.message || 'Failed to fetch orders', data: [] }
  }
}

/**
 * Get Transactions
 */
export async function getTransactions(filters = {}) {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { data: store } = await supabase.from('stores').select('id').eq('business_id', user.id).single()
    if (!store) throw new Error('Store not found')

    let query = supabase.from('transactions').select('*').eq('store_id', store.id).order('initiated_at', { ascending: false })
    if (filters.status) query = query.eq('status', filters.status)
    if (filters.date) query = query.gte('initiated_at', `${filters.date}T00:00:00`).lte('initiated_at', `${filters.date}T23:59:59`)

    const { data, error } = await query
    if (error) throw error
    return { success: true, data: data || [] }
  } catch (error) {
    console.error('Transactions fetch error:', error)
    return { success: false, error: error.message || 'Failed to fetch transactions', data: [] }
  }
}

/**
 * Get Payouts
 */
export async function getPayouts() {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { data, error } = await supabase.from('payouts').select('*').eq('business_id', user.id).order('requested_at', { ascending: false })
    if (error) throw error
    return { success: true, data: data || [] }
  } catch (error) {
    console.error('Payouts fetch error:', error)
    return { success: false, error: error.message || 'Failed to fetch payouts', data: [] }
  }
}

/**
 * Sign in with Google
 */
export async function signInWithGoogle() {
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) throw error
    return { success: true }
  } catch (error) {
    console.error('Google sign in error:', error)
    return { success: false, error: error.message || 'Failed to sign in with Google' }
  }
}

/**
 * Sign out
 */
export async function signOut() {
  try {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
    return { success: true }
  } catch (error) {
    console.error('Sign out error:', error)
    return { success: false, error: error.message || 'Failed to sign out' }
  }
}

/**
 * Reset password
 */
export async function resetPassword(email) {
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (error) throw error
    return { success: true, message: 'Password reset email sent' }
  } catch (error) {
    console.error('Password reset error:', error)
    return { success: false, error: error.message || 'Failed to send reset email' }
  }
}

/**
 * Update password
 */
export async function updatePassword(newPassword) {
  try {
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) throw error
    return { success: true, message: 'Password updated successfully' }
  } catch (error) {
    console.error('Password update error:', error)
    return { success: false, error: error.message || 'Failed to update password' }
  }
}

/**
 * Get current user profile
 */
export async function getCurrentUserProfile() {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Not authenticated' }

    const { data, error } = await supabase.rpc('get_user_profile', { user_id: user.id })
    if (error) throw error
    return { success: true, profile: data }
  } catch (error) {
    console.error('Profile fetch error:', error)
    return { success: false, error: error.message || 'Failed to fetch profile' }
  }
}

/**
 * Update customer profile
 */
export async function updateCustomerProfile(updates) {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    if (updates.fullName || updates.phone) {
      const { error: profileError } = await supabase.from('profiles').update({ full_name: updates.fullName, phone: updates.phone }).eq('id', user.id)
      if (profileError) throw profileError
    }

    if (updates.preferredService || updates.notificationPreferences) {
      const { error: customerError } = await supabase.from('customers').update({ preferred_service: updates.preferredService, notification_preferences: updates.notificationPreferences }).eq('id', user.id)
      if (customerError) throw customerError
    }

    return { success: true, message: 'Profile updated successfully' }
  } catch (error) {
    console.error('Profile update error:', error)
    return { success: false, error: error.message || 'Failed to update profile' }
  }
}

/**
 * Update business profile
 */
export async function updateBusinessProfile(updates) {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    if (updates.fullName || updates.phone) {
      const { error: profileError } = await supabase.from('profiles').update({ full_name: updates.fullName, phone: updates.phone }).eq('id', user.id)
      if (profileError) throw profileError
    }

    if (updates.companyName || updates.businessType || updates.address || updates.businessEmail) {
      const { error: businessError } = await supabase.from('businesses').update({ company_name: updates.companyName, business_type: updates.businessType, address: updates.address, business_email: updates.businessEmail }).eq('id', user.id)
      if (businessError) throw businessError
    }

    return { success: true, message: 'Profile updated successfully' }
  } catch (error) {
    console.error('Profile update error:', error)
    return { success: false, error: error.message || 'Failed to update profile' }
  }
}

/**
 * Get Analytics Data
 */
export async function getAnalytics(dateRange = {}) {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { data: store } = await supabase.from('stores').select('id').eq('business_id', user.id).single()
    if (!store) throw new Error('Store not found')

    let query = supabase.from('analytics').select('*').eq('store_id', store.id).order('date', { ascending: false })
    if (dateRange.from) query = query.gte('date', dateRange.from)
    if (dateRange.to) query = query.lte('date', dateRange.to)

    const { data, error } = await query
    if (error) throw error
    return { success: true, data: data || [] }
  } catch (error) {
    console.error('Analytics fetch error:', error)
    return { success: false, error: error.message || 'Failed to fetch analytics', data: [] }
  }
}

/**
 * Delete user account and all associated data
 */
export async function deleteAccount(password) {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return { success: false, error: 'Not authenticated' }

    const response = await fetch('/auth/user/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, accessToken: session.access_token }),
    })
    const result = await response.json()
    if (!response.ok || !result.success) return { success: false, error: result.error || 'Failed to delete account' }

    await supabase.auth.signOut()
    return { success: true, message: 'Account deleted successfully' }
  } catch (error) {
    console.error('Delete account error:', error)
    return { success: false, error: error.message || 'Failed to delete account' }
  }
}