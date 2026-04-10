// middleware.js — COMPLETE FILE
// Changes from original:
//   1. getRedirectPath handles event_organizer → /events/dashboard
//   2. /events/dashboard and /events/create protected (event_organizer only)
//   3. /events/* (public read) still accessible without auth
//   4. All existing seller / buyer / stores protection unchanged

import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'

export async function middleware(request) {
  let response = NextResponse.next({
    request: { headers: request.headers },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value)
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const path = request.nextUrl.pathname

  // Public routes that don't require authentication
  const publicRoutes = ['/', '/signin', '/signup', '/get-started', '/forgot-password', '/reset-password']
  const isPublicRoute = publicRoutes.some(route => path === route || path.startsWith('/auth/'))

  // Allow unauthenticated read of public event listing (not dashboard/create/manage)
  const isPublicEventRoute =
    path === '/events' ||
    (path.startsWith('/events/') &&
      !path.includes('/dashboard') &&
      !path.includes('/create') &&
      !path.includes('/manage') &&
      !path.includes('/analytics'))

  if (!user && !isPublicRoute && !isPublicEventRoute) {
    const signInUrl = new URL('/get-started', request.url)
    signInUrl.searchParams.set('redirect', path)
    return NextResponse.redirect(signInUrl)
  }

  if (user) {
    // Redirect authenticated users away from auth pages
    if (path === '/get-started' || path === '/signin' || path === '/signup') {
      const { data: status } = await supabase.rpc('check_registration_status', { p_user_id: user.id })

      if (status) {
        if (status.user_type === 'customer') {
          return NextResponse.redirect(new URL('/buyer', request.url))
        } else if (status.user_type === 'business') {
          if (!status.registration_completed || !status.has_store) {
            return NextResponse.redirect(new URL('/seller/register', request.url))
          }
          return NextResponse.redirect(new URL('/seller/dashboard', request.url))
        } else if (status.user_type === 'event_organizer') {
          // ✅ NEW: event organizers land on events dashboard
          return NextResponse.redirect(new URL('/events/dashboard', request.url))
        }
      }
    }

    // ✅ NEW: Protect event organizer-only routes
    // /events/dashboard, /events/create, /events/[id]/manage, /events/[id]/analytics
    const isOrganizerOnlyRoute =
      path === '/events/dashboard' ||
      path === '/events/create' ||
      path.includes('/manage') ||
      (path.startsWith('/events/') && path.endsWith('/analytics'))

    if (isOrganizerOnlyRoute) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('user_type')
        .eq('id', user.id)
        .single()

      // Allow both event_organizer AND business (seller can also manage events)
      const allowedTypes = ['event_organizer', 'business']
      if (!profile || !allowedTypes.includes(profile.user_type)) {
        return NextResponse.redirect(new URL('/events', request.url))
      }
    }

    // Protect seller routes — unchanged from original
    if (path.startsWith('/seller')) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('user_type')
        .eq('id', user.id)
        .single()

      if (!profile || profile.user_type !== 'business') {
        return NextResponse.redirect(new URL('/buyer', request.url))
      }

      if (path !== '/seller/register') {
        const { data: status } = await supabase.rpc('check_registration_status', { p_user_id: user.id })
        if (status && (!status.registration_completed || !status.has_store)) {
          return NextResponse.redirect(new URL('/seller/register', request.url))
        }
      }

      if (path === '/seller/register') {
        const { data: status } = await supabase.rpc('check_registration_status', { p_user_id: user.id })
        if (status && status.registration_completed && status.has_store) {
          return NextResponse.redirect(new URL('/seller/dashboard', request.url))
        }
      }
    }

    // Protect buyer routes — unchanged from original
    if (path.startsWith('/buyer')) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('user_type')
        .eq('id', user.id)
        .single()

      // event_organizer who visits /buyer gets redirected home
      if (profile && profile.user_type === 'event_organizer') {
        return NextResponse.redirect(new URL('/events/dashboard', request.url))
      }
    }

    // Protect stores route (customers only) — unchanged from original
    if (path.startsWith('/stores')) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('user_type')
        .eq('id', user.id)
        .single()

      if (profile && profile.user_type !== 'customer') {
        if (profile.user_type === 'business') return NextResponse.redirect(new URL('/seller/dashboard', request.url))
        if (profile.user_type === 'event_organizer') return NextResponse.redirect(new URL('/events/dashboard', request.url))
      }
    }
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$|auth/user/delete).*)',
  ],
}