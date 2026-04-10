import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function POST(request) {
  try {
    const body = await request.json()
    const { password, accessToken } = body

    console.log('=== DELETE ACCOUNT REQUEST ===')
    console.log('Has password:', !!password)
    console.log('Has accessToken:', !!accessToken)

    if (!password) {
      return NextResponse.json(
        { success: false, error: 'Password is required' },
        { status: 400 }
      )
    }

    if (!accessToken) {
      return NextResponse.json(
        { success: false, error: 'Access token is required' },
        { status: 400 }
      )
    }

    // Create client with the access token
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    )

    // Get user from the provided token
    const { data: { user }, error: userError } = await supabase.auth.getUser(accessToken)

    console.log('User from token:', user?.id)
    console.log('User error:', userError)

    if (userError || !user) {
      return NextResponse.json(
        { success: false, error: 'Invalid session token' },
        { status: 401 }
      )
    }

    const userId = user.id
    const userEmail = user.email

    console.log('Verifying password for:', userEmail)

    // Verify password
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: userEmail,
      password: password,
    })

    if (verifyError) {
      console.error('Password verification failed:', verifyError.message)
      return NextResponse.json(
        { success: false, error: 'Invalid password. Please check your password and try again.' },
        { status: 401 }
      )
    }

    console.log('✅ Password verified')

    // Use service role client for deletion
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    console.log('🗑️ Starting data deletion for user:', userId)

    // Delete user data in order
    try {
      // Get user type first
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('user_type')
        .eq('id', userId)
        .single()

      console.log('User type:', profile?.user_type)

      // Delete common data (applies to both customer and business)
      console.log('Deleting common data...')
      await supabaseAdmin.from('activity_logs').delete().eq('user_id', userId)
      await supabaseAdmin.from('notifications').delete().eq('user_id', userId)
      await supabaseAdmin.from('buyer_order_notifications').delete().eq('user_id', userId)

      // Delete cart data (applies to both customer and business)
      console.log('Deleting cart data...')
      const { data: carts } = await supabaseAdmin.from('carts').select('id').eq('user_id', userId)
      if (carts && carts.length > 0) {
        const cartIds = carts.map(c => c.id)
        await supabaseAdmin.from('cart_items').delete().in('cart_id', cartIds)
      }
      await supabaseAdmin.from('carts').delete().eq('user_id', userId)

      // Delete business-specific data
      if (profile?.user_type === 'business') {
        console.log('Deleting business-specific data...')
        
        // Find the store(s) owned by this business
        const { data: stores } = await supabaseAdmin
          .from('stores')
          .select('id')
          .or(`owner_id.eq.${userId},business_id.eq.${userId}`)

        if (stores && stores.length > 0) {
          for (const store of stores) {
            console.log('Deleting data for store:', store.id)
            
            // Delete store-related data
            await supabaseAdmin.from('store_ratings').delete().eq('store_id', store.id)
            await supabaseAdmin.from('analytics').delete().eq('store_id', store.id)
            await supabaseAdmin.from('transactions').delete().eq('store_id', store.id)
            await supabaseAdmin.from('payouts').delete().eq('store_id', store.id)
            await supabaseAdmin.from('orders').delete().eq('store_id', store.id)
            await supabaseAdmin.from('queue').delete().eq('store_id', store.id)
            await supabaseAdmin.from('products').delete().eq('store_id', store.id)
            await supabaseAdmin.from('payment_settings').delete().eq('store_id', store.id)
            await supabaseAdmin.from('stores').delete().eq('id', store.id)
          }
        }

        // Delete business-level data
        await supabaseAdmin.from('payouts').delete().eq('business_id', userId)
        await supabaseAdmin.from('businesses').delete().eq('id', userId)
        
        console.log('✅ Business data deleted')
      }

      // Delete customer-specific data
      if (profile?.user_type === 'customer') {
        console.log('Deleting customer-specific data...')
        
        // Delete customer orders, queue entries, transactions
        await supabaseAdmin.from('store_ratings').delete().eq('customer_id', userId)
        await supabaseAdmin.from('orders').delete().eq('customer_id', userId)
        await supabaseAdmin.from('queue').delete().eq('customer_id', userId)
        await supabaseAdmin.from('transactions').delete().eq('customer_id', userId)
        await supabaseAdmin.from('customers').delete().eq('id', userId)
        
        console.log('✅ Customer data deleted')
      }

      // Delete profile (last table delete before auth)
      console.log('Deleting profile...')
      await supabaseAdmin.from('profiles').delete().eq('id', userId)

      console.log('✅ All database data deleted')

      // Delete from auth.users (final step)
      console.log('Deleting auth user...')
      const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(userId)

      if (deleteAuthError) {
        console.error('Failed to delete auth user:', deleteAuthError)
        throw new Error('Failed to delete authentication account: ' + deleteAuthError.message)
      }

      console.log('✅ Auth user deleted successfully')

      return NextResponse.json({
        success: true,
        message: 'Account deleted successfully. You can create a new account with this email in the future.',
      })

    } catch (deleteError) {
      console.error('💥 Deletion error:', deleteError)
      
      // Provide more specific error messages
      let errorMessage = 'Failed to delete account. Please try again or contact support.'
      
      if (deleteError.message) {
        if (deleteError.message.includes('foreign key')) {
          errorMessage = 'Unable to delete account due to existing references. Please contact support.'
        } else if (deleteError.message.includes('permission')) {
          errorMessage = 'Permission denied. Please contact support.'
        } else {
          errorMessage = deleteError.message
        }
      }
      
      return NextResponse.json(
        { success: false, error: errorMessage },
        { status: 500 }
      )
    }

  } catch (err) {
    console.error('💥 Route error:', err)
    return NextResponse.json(
      { success: false, error: err.message || 'An unexpected error occurred. Please try again.' },
      { status: 500 }
    )
  }
}