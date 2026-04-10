// lib/api/events.js  — FIXED
// Changes vs original:
//  1. getActiveEvents: added queue_mode, waiting_timeout_minutes to select
//  2. getActiveEvents: counts from queue_entries (queue_based) + event_registrations (registration)
//  3. getEventById: added queue_entries from queue_entries table (not just queue table)
//  4. subscribeToEventQueue: also listens to queue_entries table
import { supabase } from '../supabase/client'

function generateEventTokenPrefix() {
  const now = new Date()
  return `E${String(now.getDate()).padStart(2, '0')}${String(now.getMonth() + 1).padStart(2, '0')}`
}

async function createNotification({ userId, title, message, type, metadata }) {
  try {
    await supabase.from('notifications').insert({ user_id: userId, title, message, type, metadata })
  } catch (error) {
    console.error('Error creating notification:', error)
  }
}

export async function createEvent({
  name,
  description,
  location,
  venueDetails,
  startTime,
  endTime,
  eventType = 'general',
  queueMode = 'registration',
  maxCapacity = null,
  avgServiceTime = 5,
  autoCallNext = false,
  waitingTimeoutMinutes = 5,
  upiId = null,
}) {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) throw new Error('Not authenticated')
    if (!name || !location || !startTime || !endTime)
      throw new Error('Name, location, start time and end time are required')
    if (new Date(endTime) <= new Date(startTime))
      throw new Error('End time must be after start time')

    const { data: profile, error: profileError } = await supabase
      .from('profiles').select('id, user_type, full_name').eq('id', user.id).single()
    if (profileError || !profile) throw new Error('Profile not found')
    if (!['event_organizer', 'business'].includes(profile.user_type))
      throw new Error('Only event organizers and businesses can create events')

    const { data: event, error: eventError } = await supabase
      .from('events')
      .insert({
        name,
        description: description || null,
        location,
        venue_details: venueDetails || null,
        start_time: startTime,
        end_time: endTime,
        organizer_id: user.id,
        status: 'upcoming',
        event_type: eventType,
        queue_mode: queueMode,
        max_capacity: maxCapacity,
        avg_service_time: avgServiceTime,
        auto_call_next: autoCallNext,
        waiting_timeout_minutes: waitingTimeoutMinutes,
        upi_id: upiId || null,
      })
      .select().single()

    if (eventError) throw new Error(`Failed to create event: ${eventError.message}`)
    return { data: event, error: null }
  } catch (error) {
    console.error('❌ Error creating event:', error)
    return { data: null, error: error.message || 'Failed to create event' }
  }
}

// ── FIXED: includes queue_mode + waiting_timeout_minutes ──────────────────────
export async function getActiveEvents({ filter = 'all', limit = 50 } = {}) {
  try {
    let query = supabase
      .from('events')
      .select(`
        id, name, description, location, venue_details,
        start_time, end_time, status, event_type,
        queue_mode, waiting_timeout_minutes,
        max_capacity, avg_service_time, auto_call_next,
        created_at, organizer_id,
        profiles (full_name)
      `)
      .in('status', ['upcoming', 'active'])
      .order('start_time', { ascending: true })
      .limit(limit)

    if (filter === 'active') query = query.eq('status', 'active')
    else if (filter === 'upcoming') query = query.eq('status', 'upcoming')

    const { data, error } = await query
    if (error) throw error

    const eventsWithCounts = await Promise.all(
      (data || []).map(async (event) => {
        let liveCount = 0
        let regCount = 0

        if (event.queue_mode === 'queue_based') {
          // queue_based events: count from queue_entries
          const { count } = await supabase
            .from('queue_entries')
            .select('id', { count: 'exact', head: true })
            .eq('event_id', event.id)
            .in('status', ['waiting', 'called', 'in_service'])
          liveCount = count || 0
        } else {
          // registration events: count active queue entries from queue table
          const { count: qc } = await supabase
            .from('queue')
            .select('id', { count: 'exact', head: true })
            .eq('event_id', event.id)
            .in('status', ['waiting', 'in_service'])
          liveCount = qc || 0
        }

        // Registration count from event_registrations
        const { count: rc } = await supabase
          .from('event_registrations')
          .select('id', { count: 'exact', head: true })
          .eq('event_id', event.id)
          .in('status', ['registered', 'checked_in'])
        regCount = rc || 0

        return {
          ...event,
          organizer_name: event.profiles?.full_name || 'Organizer',
          live_queue_count: liveCount,
          registered_count: regCount,
        }
      })
    )

    return { data: eventsWithCounts, error: null }
  } catch (error) {
    console.error('❌ Error fetching active events:', error)
    return { data: [], error: error.message }
  }
}

export async function getOrganizerEvents({ limit = 100 } = {}) {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) throw new Error('Not authenticated')
    const { data, error } = await supabase
      .from('events').select('*').eq('organizer_id', user.id)
      .order('start_time', { ascending: false }).limit(limit)
    if (error) throw error
    return { data: data || [], error: null }
  } catch (error) {
    return { data: [], error: error.message }
  }
}

// ── FIXED: getEventById — fetches from BOTH queue tables ─────────────────────
export async function getEventById(eventId) {
  try {
    if (!eventId) throw new Error('Event ID required')

    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('*, profiles (id, full_name, phone)')
      .eq('id', eventId)
      .single()
    if (eventError) throw new Error(`Event not found: ${eventError.message}`)

    let queueEntries = []
    let queueSize = 0
    let currentlyServing = null

    if (event.queue_mode === 'queue_based') {
      // Use queue_entries table
      const { data: entries } = await supabase
        .from('queue_entries')
        .select('id, token_number, status, position, joined_at')
        .eq('event_id', eventId)
        .in('status', ['waiting', 'called', 'in_service'])
        .order('position', { ascending: true })
      queueEntries = entries || []
      queueSize = queueEntries.filter(q => q.status === 'waiting').length
      currentlyServing = queueEntries.find(q => q.status === 'in_service') || null
    } else {
      // Use legacy queue table
      const { data: entries } = await supabase
        .from('queue')
        .select('id, token_number, status, customer_name, queue_position, wait_time_minutes, issued_at')
        .eq('event_id', eventId)
        .in('status', ['waiting', 'in_service', 'ready'])
        .order('queue_position', { ascending: true })
      queueEntries = entries || []
      queueSize = queueEntries.filter(q => q.status === 'waiting').length
      currentlyServing = queueEntries.find(q => q.status === 'in_service') || null
    }

    const { count: registeredCount } = await supabase
      .from('event_registrations')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .eq('status', 'registered')

    return {
      data: {
        ...event,
        organizer_name: event.profiles?.full_name || 'Organizer',
        queue_entries: queueEntries,
        queue_size: queueSize,
        currently_serving: currentlyServing,
        registered_count: registeredCount || 0,
      },
      error: null,
    }
  } catch (error) {
    console.error('❌ Error fetching event:', error)
    return { data: null, error: error.message }
  }
}

export async function updateEvent(eventId, updates) {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) throw new Error('Not authenticated')

    const { data: event } = await supabase
      .from('events').select('organizer_id, status').eq('id', eventId).single()
    if (!event) throw new Error('Event not found')
    if (event.organizer_id !== user.id) throw new Error('Not authorized to update this event')
    if (['completed', 'cancelled'].includes(event.status))
      throw new Error('Cannot update a completed or cancelled event')

    const allowedFields = [
      'name', 'description', 'location', 'venue_details', 'start_time',
      'end_time', 'event_type', 'max_capacity', 'avg_service_time',
      'auto_call_next', 'upi_id', 'queue_mode', 'waiting_timeout_minutes',
    ]
    const sanitized = {}
    allowedFields.forEach(f => { if (updates[f] !== undefined) sanitized[f] = updates[f] })

    const { data, error } = await supabase
      .from('events').update(sanitized).eq('id', eventId).select().single()
    if (error) throw error
    return { data, error: null }
  } catch (error) {
    return { data: null, error: error.message }
  }
}

export async function getMyRegisteredEvents() {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) throw new Error('Not authenticated')

    const { data, error } = await supabase
      .from('event_registrations')
      .select(`
        id, status, registration_token, notes, created_at, event_id,
        events (
          id, name, description, location, venue_details, start_time, end_time,
          status, event_type, max_capacity, avg_service_time, queue_mode,
          organizer_id, profiles (full_name)
        )
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    if (error) throw error

    const result = (data || []).map(reg => {
      const ev = reg.events
      if (!ev) {
        return {
          registrationId: reg.id, registrationStatus: reg.status,
          registrationToken: reg.registration_token, registeredAt: reg.created_at,
          notes: reg.notes, id: reg.event_id, name: null, description: null,
          location: null, venue_details: null, start_time: null, end_time: null,
          status: 'cancelled', event_type: 'general', max_capacity: null,
          avg_service_time: null, organizer_id: null, organizer_name: 'Organizer',
          cancellation_reason: reg.notes || 'This event was cancelled by the organizer.',
        }
      }
      return {
        registrationId: reg.id, registrationStatus: reg.status,
        registrationToken: reg.registration_token, registeredAt: reg.created_at,
        notes: reg.notes, ...ev,
        organizer_name: ev.profiles?.full_name || 'Organizer',
        cancellation_reason: ev.status === 'cancelled'
          ? (reg.notes || 'This event was cancelled by the organizer.') : null,
      }
    })
    return { data: result, error: null }
  } catch (error) {
    return { data: [], error: error.message }
  }
}

export async function getMyEventQueueToken(eventId) {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }
    const { data, error } = await supabase
      .from('queue')
      .select('id, token_number, status, queue_position, wait_time_minutes, issued_at')
      .eq('event_id', eventId).eq('customer_id', user.id)
      .order('issued_at', { ascending: false }).limit(1).maybeSingle()
    if (error) throw error
    return { data: data || null, error: null }
  } catch (error) {
    return { data: null, error: error.message }
  }
}

export async function activateEvent(eventId) {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) throw new Error('Not authenticated')

    const { data: event } = await supabase
      .from('events').select('organizer_id, status, name').eq('id', eventId).single()
    if (!event) throw new Error('Event not found')
    if (event.organizer_id !== user.id) throw new Error('Not authorized')
    if (event.status !== 'upcoming') throw new Error(`Event is already ${event.status}`)

    const { data, error } = await supabase
      .from('events').update({ status: 'active' }).eq('id', eventId).select().single()
    if (error) throw error
    return { data, error: null }
  } catch (error) {
    return { data: null, error: error.message }
  }
}

export async function closeEvent(eventId) {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) throw new Error('Not authenticated')

    const { data: event } = await supabase
      .from('events').select('organizer_id, name, status, queue_mode').eq('id', eventId).single()
    if (!event) throw new Error('Event not found')
    if (event.organizer_id !== user.id) throw new Error('Not authorized to close this event')
    if (event.status === 'completed') throw new Error('Event is already completed')

    const now = new Date().toISOString()

    if (event.queue_mode === 'queue_based') {
      await supabase.from('queue_entries')
        .update({ status: 'cancelled', cancelled_at: now })
        .eq('event_id', eventId)
        .in('status', ['waiting', 'called', 'in_service'])
    } else {
      await supabase.from('queue')
        .update({ status: 'cancelled', updated_at: now })
        .eq('event_id', eventId)
        .in('status', ['waiting', 'in_service'])
    }

    const { data, error } = await supabase
      .from('events').update({ status: 'completed' }).eq('id', eventId).select().single()
    if (error) throw error
    return { data, error: null }
  } catch (error) {
    return { data: null, error: error.message }
  }
}

export async function cancelEvent(eventId, reason = 'Event cancelled by organizer') {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) throw new Error('Not authenticated')

    const { data: event } = await supabase
      .from('events').select('organizer_id, name, status').eq('id', eventId).single()
    if (!event) throw new Error('Event not found')
    if (event.organizer_id !== user.id) throw new Error('Not authorized')
    if (['completed', 'cancelled'].includes(event.status))
      throw new Error(`Event is already ${event.status}`)

    const now = new Date().toISOString()
    await supabase.from('queue').update({ status: 'cancelled', updated_at: now })
      .eq('event_id', eventId).in('status', ['waiting', 'in_service', 'ready'])
    await supabase.from('queue_entries').update({ status: 'cancelled', cancelled_at: now })
      .eq('event_id', eventId).in('status', ['waiting', 'called', 'in_service'])

    const { data, error } = await supabase
      .from('events').update({ status: 'cancelled' }).eq('id', eventId).select().single()
    if (error) throw error

    const { data: registrations } = await supabase
      .from('event_registrations').select('user_id')
      .eq('event_id', eventId).eq('status', 'registered')

    if (registrations && registrations.length > 0) {
      const notifications = registrations.map(r => ({
        user_id: r.user_id,
        title: '❌ Event Cancelled',
        message: `"${event.name}" has been cancelled. Reason: ${reason}`,
        type: 'event_cancelled',
        metadata: { event_id: eventId, event_name: event.name, reason },
      }))
      await supabase.from('notifications').insert(notifications)
      await supabase.from('event_registrations').update({ notes: reason }).eq('event_id', eventId)
    }
    return { data, error: null }
  } catch (error) {
    return { data: null, error: error.message }
  }
}

export async function registerForEvent(eventId) {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) throw new Error('Not authenticated')

    const { data: event } = await supabase
      .from('events').select('id, name, status, max_capacity').eq('id', eventId).single()
    if (!event) throw new Error('Event not found')
    if (!['upcoming', 'active'].includes(event.status))
      throw new Error('This event is not open for registration')

    if (event.max_capacity) {
      const { count } = await supabase
        .from('event_registrations').select('id', { count: 'exact', head: true })
        .eq('event_id', eventId).eq('status', 'registered')
      if (count >= event.max_capacity) throw new Error('This event is at full capacity')
    }

    const { data: existing } = await supabase
      .from('event_registrations').select('id, status')
      .eq('event_id', eventId).eq('user_id', user.id).maybeSingle()

    if (existing) {
      if (existing.status === 'registered') throw new Error('You are already registered for this event')
      if (existing.status === 'checked_in') throw new Error('You have already checked in to this event')
      const { data: updated, error: updateError } = await supabase
        .from('event_registrations').update({ status: 'registered' })
        .eq('id', existing.id).select().single()
      if (updateError) throw updateError
      return { data: updated, error: null }
    }

    const tokenSuffix = Math.random().toString(36).substring(2, 6).toUpperCase()
      + Math.random().toString(36).substring(2, 6).toUpperCase()
    const registrationToken = `REG-${tokenSuffix}`

    const { data: registration, error: regError } = await supabase
      .from('event_registrations')
      .insert({ event_id: eventId, user_id: user.id, status: 'registered', registration_token: registrationToken })
      .select().single()

    if (regError) {
      if (regError.code === '23505') throw new Error('You are already registered for this event')
      throw new Error(`Registration failed: ${regError.message}`)
    }

    await createNotification({
      userId: user.id, title: '🎉 Registered!',
      message: `You are registered for "${event.name}". Your token: ${registrationToken}`,
      type: 'event_registered',
      metadata: { event_id: eventId, event_name: event.name, token: registrationToken },
    })
    return { data: registration, error: null }
  } catch (error) {
    return { data: null, error: error.message }
  }
}

export async function cancelRegistration(eventId) {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) throw new Error('Not authenticated')
    const { data, error } = await supabase
      .from('event_registrations').update({ status: 'cancelled' })
      .eq('event_id', eventId).eq('user_id', user.id).select().single()
    if (error) throw error
    return { data, error: null }
  } catch (error) {
    return { data: null, error: error.message }
  }
}

export async function checkUserRegistration(eventId) {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: { isRegistered: false, registration: null }, error: null }
    const { data, error } = await supabase
      .from('event_registrations').select('*')
      .eq('event_id', eventId).eq('user_id', user.id).maybeSingle()
    if (error) throw error
    return {
      data: {
        isRegistered: data?.status === 'registered' || data?.status === 'checked_in',
        registration: data || null,
      },
      error: null,
    }
  } catch (error) {
    return { data: { isRegistered: false, registration: null }, error: error.message }
  }
}

export async function getEventRegistrations(eventId) {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) throw new Error('Not authenticated')

    const { data: event } = await supabase
      .from('events').select('organizer_id').eq('id', eventId).single()
    if (!event || event.organizer_id !== user.id) throw new Error('Not authorized')

    const { data, error } = await supabase
      .from('event_registrations')
      .select(`id, status, notes, created_at, user_id, registration_token, profiles (full_name, phone)`)
      .eq('event_id', eventId)
      .order('created_at', { ascending: true })

    if (error) throw error
    return { data: data || [], error: null }
  } catch (error) {
    return { data: [], error: error.message }
  }
}

export async function acceptRegistration(registrationId) {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) throw new Error('Not authenticated')

    const { data: reg, error: regFetchError } = await supabase
      .from('event_registrations')
      .select('id, status, event_id, user_id, registration_token, events(organizer_id, name)')
      .eq('id', registrationId)
      .single()

    if (regFetchError) throw new Error(regFetchError.message)
    if (!reg) throw new Error('Registration not found')
    if (!reg.events) throw new Error('Associated event not found')
    if (reg.events.organizer_id !== user.id) throw new Error('Not authorized')
    if (reg.status === 'checked_in') throw new Error('Registration is already accepted')

    const { data, error: updateError } = await supabase
      .from('event_registrations')
      .update({ status: 'checked_in' })
      .eq('id', registrationId)
      .select()
      .single()

    if (updateError) throw new Error(updateError.message)

    const tokenMsg = reg.registration_token
      ? ` Your registration token: ${reg.registration_token}`
      : ''
    await supabase.from('notifications').insert({
      user_id: reg.user_id,
      title: '✅ Registration Accepted!',
      message: `Your registration for "${reg.events.name}" has been confirmed!${tokenMsg}`,
      type: 'registration_accepted',
      metadata: { event_id: reg.event_id, registration_id: registrationId, token: reg.registration_token || null },
    })

    return { data, error: null }
  } catch (error) {
    return { data: null, error: error.message || 'Unknown error' }
  }
}

export async function rejectRegistration(registrationId, reason = 'Registration rejected by organizer') {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) throw new Error('Not authenticated')

    const { data: reg, error: regFetchError } = await supabase
      .from('event_registrations')
      .select('id, status, event_id, user_id, registration_token, events(organizer_id, name)')
      .eq('id', registrationId)
      .single()

    if (regFetchError) throw new Error(regFetchError.message)
    if (!reg) throw new Error('Registration not found')
    if (!reg.events) throw new Error('Associated event not found')
    if (reg.events.organizer_id !== user.id) throw new Error('Not authorized')
    if (reg.status === 'cancelled') throw new Error('Registration is already rejected')

    const { data, error: updateError } = await supabase
      .from('event_registrations')
      .update({ status: 'cancelled', notes: reason })
      .eq('id', registrationId)
      .select()
      .single()

    if (updateError) throw new Error(updateError.message)

    await supabase.from('notifications').insert({
      user_id: reg.user_id,
      title: '❌ Registration Not Accepted',
      message: `Your registration for "${reg.events.name}" was not approved. Reason: ${reason}`,
      type: 'registration_rejected',
      metadata: { event_id: reg.event_id, registration_id: registrationId, reason },
    })

    return { data, error: null }
  } catch (error) {
    return { data: null, error: error.message || 'Unknown error' }
  }
}

export async function joinEventQueue(eventId) {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) throw new Error('Not authenticated')

    const { data: event } = await supabase
      .from('events').select('id, name, status, avg_service_time, max_capacity')
      .eq('id', eventId).single()
    if (!event) throw new Error('Event not found')
    if (event.status !== 'active') throw new Error(`Queue is not open. Event status: ${event.status}`)

    const { data: existingEntry } = await supabase
      .from('queue').select('id, token_number, status')
      .eq('event_id', eventId).eq('customer_id', user.id)
      .in('status', ['waiting', 'in_service', 'ready']).maybeSingle()
    if (existingEntry) throw new Error(`You are already in the queue with token ${existingEntry.token_number}`)

    const { data: profile } = await supabase
      .from('profiles').select('full_name, phone').eq('id', user.id).single()

    const customerName = profile?.full_name || 'Attendee'
    const customerPhone = profile?.phone || null
    const avgServiceTime = event.avg_service_time || 5

    const { data: currentQueue } = await supabase
      .from('queue').select('id').eq('event_id', eventId).in('status', ['waiting', 'in_service'])

    const queuePosition = (currentQueue?.length || 0) + 1
    const estimatedWaitMinutes = queuePosition * avgServiceTime
    const estimatedTime = new Date(Date.now() + estimatedWaitMinutes * 60000).toISOString()
    const tokenPrefix = generateEventTokenPrefix()

    const { data: inserted, error: insertError } = await supabase
      .from('queue')
      .insert({
        event_id: eventId, store_id: null,
        customer_id: user.id, customer_name: customerName, customer_phone: customerPhone,
        token_number: `${tokenPrefix}${String(queuePosition).padStart(3, '0')}`,
        token_sequence: queuePosition, queue_position: queuePosition,
        status: 'waiting', wait_time_minutes: estimatedWaitMinutes,
        estimated_time: estimatedTime, issued_at: new Date().toISOString(),
        total_amount: 0, order_items: [],
      })
      .select().single()

    if (insertError) throw new Error(`Failed to join queue: ${insertError.message}`)

    await createNotification({
      userId: user.id, title: '🎫 You joined the queue!',
      message: `Your token is ${inserted.token_number} at "${event.name}". Estimated wait: ~${estimatedWaitMinutes} min.`,
      type: 'event_queue_joined',
      metadata: {
        event_id: eventId, event_name: event.name, queue_id: inserted.id,
        token_number: inserted.token_number, queue_position: queuePosition,
        estimated_wait: estimatedWaitMinutes,
      },
    })
    return { data: { ...inserted, position: queuePosition }, error: null }
  } catch (error) {
    return { data: null, error: error.message }
  }
}

export async function getEventQueue(eventId) {
  try {
    const { data: waitingQueue, error: queueError } = await supabase
      .from('queue')
      .select(`id, token_number, token_sequence, status, queue_position, customer_name,
               customer_phone, wait_time_minutes, estimated_time, issued_at,
               service_started_at, service_completed_at`)
      .eq('event_id', eventId).in('status', ['waiting', 'in_service', 'ready'])
      .order('queue_position', { ascending: true })
    if (queueError) throw queueError

    return {
      data: {
        currentlyServing: waitingQueue?.find(q => q.status === 'in_service') || null,
        waiting: waitingQueue?.filter(q => q.status === 'waiting') || [],
        ready: waitingQueue?.filter(q => q.status === 'ready') || [],
        queueSize: waitingQueue?.filter(q => q.status === 'waiting').length || 0,
        allEntries: waitingQueue || [],
      },
      error: null,
    }
  } catch (error) {
    return { data: { currentlyServing: null, waiting: [], ready: [], queueSize: 0, allEntries: [] }, error: error.message }
  }
}

export async function callNextEventToken(eventId) {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) throw new Error('Not authenticated')

    const { data: event } = await supabase
      .from('events').select('organizer_id, name, avg_service_time').eq('id', eventId).single()
    if (!event || event.organizer_id !== user.id) throw new Error('Not authorized')

    const { data: currentServing } = await supabase
      .from('queue').select('id, token_number').eq('event_id', eventId)
      .eq('status', 'in_service').maybeSingle()
    if (currentServing)
      return { data: null, error: `${currentServing.token_number} is still being served.` }

    const { data: next, error: fetchError } = await supabase
      .from('queue').select('*').eq('event_id', eventId).eq('status', 'waiting')
      .order('queue_position', { ascending: true }).limit(1).maybeSingle()
    if (fetchError) throw fetchError
    if (!next) return { data: null, error: 'No one is waiting in the queue' }

    const now = new Date().toISOString()
    const { data: updated, error: updateError } = await supabase
      .from('queue').update({ status: 'in_service', service_started_at: now, updated_at: now })
      .eq('id', next.id).select().single()
    if (updateError) throw updateError

    await createNotification({
      userId: next.customer_id, title: '🔔 Your turn!',
      message: `Token ${next.token_number} — it's your turn at "${event.name}". Please proceed.`,
      type: 'event_your_turn',
      metadata: { event_id: eventId, event_name: event.name, token_number: next.token_number, queue_id: next.id },
    })
    return { data: updated, error: null }
  } catch (error) {
    return { data: null, error: error.message }
  }
}

export async function markEventTokenServed(eventId, queueId) {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) throw new Error('Not authenticated')

    const { data: event } = await supabase
      .from('events').select('organizer_id, name, auto_call_next').eq('id', eventId).single()
    if (!event || event.organizer_id !== user.id) throw new Error('Not authorized')

    const { data: entry } = await supabase
      .from('queue').select('service_started_at, customer_id, token_number').eq('id', queueId).single()

    const now = new Date().toISOString()
    const actualDuration = entry?.service_started_at
      ? Math.round((new Date(now) - new Date(entry.service_started_at)) / 60000)
      : null

    const { data, error } = await supabase
      .from('queue')
      .update({ status: 'completed', service_completed_at: now, actual_service_duration: actualDuration, notified_at: now, updated_at: now })
      .eq('id', queueId).select().single()
    if (error) throw error

    if (entry?.customer_id) {
      await createNotification({
        userId: entry.customer_id, title: '✅ Service completed',
        message: `Thank you for attending "${event.name}".`,
        type: 'event_served',
        metadata: { event_id: eventId, event_name: event.name, token_number: entry.token_number },
      })
    }
    if (event.auto_call_next) await callNextEventToken(eventId)
    return { data, error: null }
  } catch (error) {
    return { data: null, error: error.message }
  }
}

export async function skipEventQueueEntry(eventId, queueId) {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) throw new Error('Not authenticated')

    const { data: event } = await supabase
      .from('events').select('organizer_id').eq('id', eventId).single()
    if (!event || event.organizer_id !== user.id) throw new Error('Not authorized')

    const now = new Date().toISOString()
    const { data, error } = await supabase
      .from('queue').update({ status: 'cancelled', updated_at: now })
      .eq('id', queueId).select().single()
    if (error) throw error
    return { data, error: null }
  } catch (error) {
    return { data: null, error: error.message }
  }
}

export async function getEventAnalytics(eventId) {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) throw new Error('Not authenticated')

    const { data: event } = await supabase
      .from('events').select('organizer_id, name, start_time, end_time, status, avg_service_time, queue_mode')
      .eq('id', eventId).single()
    if (!event || event.organizer_id !== user.id) throw new Error('Not authorized')

    let allEntries = []

    if (event.queue_mode === 'queue_based') {
      const { data } = await supabase.from('queue_entries').select('*').eq('event_id', eventId)
      allEntries = data || []
    } else {
      const { data } = await supabase.from('queue').select('*').eq('event_id', eventId)
      allEntries = data || []
    }

    const totalJoined = allEntries.length
    const totalServed = allEntries.filter(q => ['served', 'completed'].includes(q.status)).length
    const totalCancelled = allEntries.filter(q => q.status === 'cancelled').length
    const currentlyWaiting = allEntries.filter(q => q.status === 'waiting').length

    const { count: registeredCount } = await supabase
      .from('event_registrations').select('id', { count: 'exact', head: true })
      .eq('event_id', eventId).eq('status', 'registered')
    const { count: checkedInCount } = await supabase
      .from('event_registrations').select('id', { count: 'exact', head: true })
      .eq('event_id', eventId).eq('status', 'checked_in')

    return {
      data: {
        event_name: event.name, event_status: event.status,
        total_joined: totalJoined, total_served: totalServed,
        total_cancelled: totalCancelled, currently_waiting: currentlyWaiting,
        avg_service_time_minutes: event.avg_service_time,
        total_registered: (registeredCount || 0) + (checkedInCount || 0),
        total_checked_in: checkedInCount || 0,
        completion_rate: totalJoined > 0 ? Math.round((totalServed / totalJoined) * 100) : 0,
      },
      error: null,
    }
  } catch (error) {
    return { data: null, error: error.message }
  }
}

// ── FIXED: subscribeToEventQueue — listens to BOTH tables ─────────────────────
export function subscribeToEventQueue(eventId, { onQueueUpdate, onNewAttendee, onError } = {}) {
  const channel = supabase
    .channel(`event-queue-${eventId}`)
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'queue', filter: `event_id=eq.${eventId}` },
      (payload) => {
        if (payload.eventType === 'INSERT' && onNewAttendee) onNewAttendee(payload.new)
        if (onQueueUpdate) onQueueUpdate(payload)
      }
    )
    // ── NEW: also watch queue_entries for queue_based events ──
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'queue_entries', filter: `event_id=eq.${eventId}` },
      (payload) => {
        if (payload.eventType === 'INSERT' && onNewAttendee) onNewAttendee(payload.new)
        if (onQueueUpdate) onQueueUpdate(payload)
      }
    )
    .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'events', filter: `id=eq.${eventId}` },
      (payload) => { if (onQueueUpdate) onQueueUpdate(payload) }
    )
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR' && onError)
        onError(new Error('Realtime channel error for event queue'))
    })
  return () => channel.unsubscribe()
}

export async function getUserEventQueueEntry(eventId) {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }
    const { data, error } = await supabase
      .from('queue').select('*').eq('event_id', eventId).eq('customer_id', user.id)
      .in('status', ['waiting', 'in_service', 'ready', 'completed'])
      .order('issued_at', { ascending: false }).limit(1).maybeSingle()
    if (error) throw error
    return { data: data || null, error: null }
  } catch (error) {
    return { data: null, error: error.message }
  }
}