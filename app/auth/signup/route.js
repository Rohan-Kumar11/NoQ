// app/api/auth/signup/route.js
// Optional server-side API route for signup with additional validation

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function POST(request) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const body = await request.json()
    
    const { userType, email, password, fullName, phone, ...additionalData } = body

    // Additional server-side validation
    if (!email || !password || !fullName || !userType) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      )
    }

    // Build metadata based on user type
    const metadata = {
      user_type: userType,
      full_name: fullName,
      phone
    }

    if (userType === 'business') {
      metadata.company_name = additionalData.company
      metadata.business_type = additionalData.businessType
      metadata.address = additionalData.address
      metadata.business_email = email
    } else if (userType === 'customer') {
      metadata.preferred_service = additionalData.preferredService
    }

    // Create user
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: metadata,
        emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`
      }
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      user: data.user,
      message: 'Account created successfully. Please check your email to verify your account.'
    })

  } catch (error) {
    console.error('Signup error:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}
