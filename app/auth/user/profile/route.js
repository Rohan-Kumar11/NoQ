// app/api/user/profile/route.js
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get complete profile using RPC function
    const { data: profile, error: profileError } = await supabase
      .rpc('get_user_profile', { user_id: user.id })

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 400 })
    }

    return NextResponse.json({ success: true, profile })

  } catch (error) {
    console.error('Get profile error:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}

export async function PATCH(request) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const updates = await request.json()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user type to determine which table to update
    const { data: profile } = await supabase
      .from('profiles')
      .select('user_type')
      .eq('id', user.id)
      .single()

    // Update profiles table
    if (updates.fullName || updates.phone) {
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          full_name: updates.fullName,
          phone: updates.phone
        })
        .eq('id', user.id)

      if (profileError) throw profileError
    }

    // Update user-type specific table
    if (profile.user_type === 'customer') {
      const customerUpdates = {}
      if (updates.preferredService) customerUpdates.preferred_service = updates.preferredService
      if (updates.notificationPreferences) customerUpdates.notification_preferences = updates.notificationPreferences

      if (Object.keys(customerUpdates).length > 0) {
        const { error } = await supabase
          .from('customers')
          .update(customerUpdates)
          .eq('id', user.id)

        if (error) throw error
      }
    } else if (profile.user_type === 'business') {
      const businessUpdates = {}
      if (updates.company) businessUpdates.company_name = updates.company
      if (updates.businessType) businessUpdates.business_type = updates.businessType
      if (updates.address) businessUpdates.address = updates.address

      if (Object.keys(businessUpdates).length > 0) {
        const { error } = await supabase
          .from('businesses')
          .update(businessUpdates)
          .eq('id', user.id)

        if (error) throw error
      }
    }

    return NextResponse.json({ success: true, message: 'Profile updated successfully' })

  } catch (error) {
    console.error('Update profile error:', error)
    return NextResponse.json(
      { error: 'Failed to update profile' },
      { status: 500 }
    )
  }
}