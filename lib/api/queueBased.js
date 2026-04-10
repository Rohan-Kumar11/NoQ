// ─────────────────────────────────────────────────────────────────────────────
//  lib/api/queueBased.js  — Complete queue-based event API
//  Handles: join, fetch, cancel, call next, arrived, served, timeout, remove
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from '../supabase/client'

// ── Notification helper ──────────────────────────────────────────────────────
async function notify({ userId, title, message, type, metadata }) {
  try {
    await supabase
      .from('notifications')
      .insert({ user_id: userId, title, message, type, metadata })
  } catch (e) {
    console.error('notify error', e)
  }
}

// ── Token helpers ────────────────────────────────────────────────────────────
async function getNextTokenNumber(eventId) {
  const { count } = await supabase
    .from('queue_entries')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', eventId)
  return (count || 0) + 1
}

function tokenLabel(n) {
  return `Q${String(n).padStart(3, '0')}`
}

// ── Reorder active queue positions 1..N ─────────────────────────────────────
async function reorderQueuePositions(eventId) {
  try {
    // Try RPC first
    const { error: rpcError } = await supabase
      .rpc('reorder_queue_positions', { p_event_id: eventId })
    if (!rpcError) return

    // Fallback: manual reorder of waiting + called entries only
    const { data: activeEntries } = await supabase
      .from('queue_entries')
      .select('id')
      .eq('event_id', eventId)
      .in('status', ['waiting', 'called'])
      .order('position', { ascending: true })

    if (!activeEntries || activeEntries.length === 0) return

    for (let i = 0; i < activeEntries.length; i++) {
      await supabase
        .from('queue_entries')
        .update({ position: i + 1 })
        .eq('id', activeEntries[i].id)
    }
  } catch (e) {
    console.error('reorderQueuePositions error', e)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  JOIN QUEUE
// ─────────────────────────────────────────────────────────────────────────────
export async function joinQueueBasedEvent(eventId) {
  try {
    if (!eventId || eventId === 'undefined') throw new Error('Invalid event ID')

    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) throw new Error('Not authenticated')

    const { data: event, error: evErr } = await supabase
      .from('events')
      .select('id, name, status, queue_mode, max_capacity, waiting_timeout_minutes, avg_service_time')
      .eq('id', eventId)
      .single()
    if (evErr || !event) throw new Error('Event not found')
    if (event.queue_mode !== 'queue_based') throw new Error('This event is not queue-based')
    if (event.status !== 'active') throw new Error(`Queue is not open (status: ${event.status})`)

    // Block if already in queue
    const { data: existing } = await supabase
      .from('queue_entries')
      .select('id, token_number, status, position')
      .eq('event_id', eventId)
      .eq('user_id', user.id)
      .in('status', ['waiting', 'called', 'in_service'])
      .maybeSingle()
    if (existing) throw new Error(`Already in queue — token ${existing.token_number} (#${existing.position})`)

    // Capacity check
    if (event.max_capacity) {
      const { count: activeCount } = await supabase
        .from('queue_entries')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', eventId)
        .in('status', ['waiting', 'called', 'in_service'])
      if (activeCount >= event.max_capacity) throw new Error('Queue is at full capacity')
    }

    const tokenNum = await getNextTokenNumber(eventId)
    const token_number = tokenLabel(tokenNum)

    const { count: activeCount } = await supabase
      .from('queue_entries')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .in('status', ['waiting', 'called', 'in_service'])
    const position = (activeCount || 0) + 1

    const { data: entry, error: insertErr } = await supabase
      .from('queue_entries')
      .insert({
        event_id: eventId,
        user_id: user.id,
        token_number,
        position,
        original_position: position,
        status: 'waiting',
        joined_at: new Date().toISOString(),
        timeout_count: 0,
      })
      .select()
      .single()

    if (insertErr) {
      if (insertErr.code === '23505') throw new Error('You are already in the queue')
      throw new Error(`Failed to join queue: ${insertErr.message}`)
    }

    const estWait = position * (event.avg_service_time || 5)
    await notify({
      userId: user.id,
      title: '🎫 Joined Queue!',
      message: `Token ${token_number} — position #${position} at "${event.name}". Est. wait: ~${estWait} min.`,
      type: 'queue_joined',
      metadata: { event_id: eventId, token_number, position },
    })

    return { data: { ...entry, estimated_wait_minutes: estWait }, error: null }
  } catch (err) {
    console.error('❌ joinQueueBasedEvent', err)
    return { data: null, error: err.message }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  GET QUEUE ENTRIES (organiser view)
// ─────────────────────────────────────────────────────────────────────────────
export async function getQueueBasedEntries(eventId) {
  try {
    if (!eventId || eventId === 'undefined') throw new Error('Invalid event ID: ' + eventId)

    const { data: entries, error } = await supabase
      .from('queue_entries')
      .select('id, token_number, position, status, joined_at, called_at, timeout_at, served_at, timeout_count, user_id')
      .eq('event_id', eventId)
      .in('status', ['waiting', 'called', 'in_service'])
      .order('position', { ascending: true })
    if (error) throw error

    const userIds = [...new Set((entries || []).map(e => e.user_id).filter(Boolean))]
    let profileMap = {}
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, phone')
        .in('id', userIds)
      if (profiles) profiles.forEach(p => { profileMap[p.id] = p })
    }

    const merged = (entries || []).map(e => ({
      ...e,
      profiles: profileMap[e.user_id] || null,
    }))

    const waiting    = merged.filter(e => e.status === 'waiting')
    const called     = merged.filter(e => e.status === 'called')
    const in_service = merged.filter(e => e.status === 'in_service')

    return {
      data: {
        waiting,
        called,
        currentlyServing: in_service[0] || null,
        allActive: merged,
        queueSize: waiting.length,
      },
      error: null,
    }
  } catch (err) {
    console.error('❌ getQueueBasedEntries', err)
    return {
      data: { waiting: [], called: [], currentlyServing: null, allActive: [], queueSize: 0 },
      error: err.message,
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  GET USER'S OWN ENTRY
// ─────────────────────────────────────────────────────────────────────────────
export async function getMyQueueEntry(eventId) {
  try {
    if (!eventId || eventId === 'undefined') return { data: null, error: 'Invalid event ID' }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const { data, error } = await supabase
      .from('queue_entries')
      .select('id, token_number, position, status, joined_at, called_at, timeout_at, timeout_count')
      .eq('event_id', eventId)
      .eq('user_id', user.id)
      .in('status', ['waiting', 'called', 'in_service'])
      .maybeSingle()
    if (error) throw error

    return { data: data || null, error: null }
  } catch (err) {
    return { data: null, error: err.message }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  CANCEL OWN QUEUE ENTRY
// ─────────────────────────────────────────────────────────────────────────────
export async function cancelQueueEntry(eventId) {
  try {
    if (!eventId || eventId === 'undefined') throw new Error('Invalid event ID')

    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) throw new Error('Not authenticated')

    const { data: entry, error: fetchErr } = await supabase
      .from('queue_entries')
      .select('id, position, token_number, status')
      .eq('event_id', eventId)
      .eq('user_id', user.id)
      .in('status', ['waiting', 'called'])
      .maybeSingle()
    if (fetchErr) throw fetchErr
    if (!entry) throw new Error('You are not in the queue')

    const now = new Date().toISOString()
    const { error: updateErr } = await supabase
      .from('queue_entries')
      .update({ status: 'cancelled', cancelled_at: now })
      .eq('id', entry.id)
    if (updateErr) throw updateErr

    await reorderQueuePositions(eventId)
    return { data: { cancelled: true, token_number: entry.token_number }, error: null }
  } catch (err) {
    console.error('❌ cancelQueueEntry', err)
    return { data: null, error: err.message }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  ORGANISER: CALL NEXT TOKEN
// ─────────────────────────────────────────────────────────────────────────────
export async function callNextQueueToken(eventId) {
  try {
    if (!eventId || eventId === 'undefined') throw new Error('Invalid event ID')

    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) throw new Error('Not authenticated')

    const { data: event } = await supabase
      .from('events')
      .select('organizer_id, name, waiting_timeout_minutes, avg_service_time')
      .eq('id', eventId)
      .single()
    if (!event || event.organizer_id !== user.id) throw new Error('Not authorized')

    const { data: serving } = await supabase
      .from('queue_entries')
      .select('id, token_number')
      .eq('event_id', eventId)
      .eq('status', 'in_service')
      .maybeSingle()
    if (serving) {
      return { data: null, error: `${serving.token_number} is still being served. Mark as served first.` }
    }

    const { data: alreadyCalled } = await supabase
      .from('queue_entries')
      .select('id, token_number')
      .eq('event_id', eventId)
      .eq('status', 'called')
      .maybeSingle()
    if (alreadyCalled) {
      return { data: null, error: `${alreadyCalled.token_number} was called but hasn't arrived yet. Handle them first.` }
    }

    const { data: next, error: fetchErr } = await supabase
      .from('queue_entries')
      .select('*')
      .eq('event_id', eventId)
      .eq('status', 'waiting')
      .order('position', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (fetchErr) throw fetchErr
    if (!next) return { data: null, error: 'No one is waiting in the queue' }

    const now = new Date()
    const timeoutMinutes = event.waiting_timeout_minutes || 5
    const timeout_at = new Date(now.getTime() + timeoutMinutes * 60 * 1000).toISOString()

    const { data: updated, error: updateErr } = await supabase
      .from('queue_entries')
      .update({ status: 'called', called_at: now.toISOString(), timeout_at })
      .eq('id', next.id)
      .select()
      .single()
    if (updateErr) throw updateErr

    await notify({
      userId: next.user_id,
      title: '🔔 Your turn!',
      message: `Token ${next.token_number} — please proceed to "${event.name}" within ${timeoutMinutes} minutes.`,
      type: 'queue_called',
      metadata: { event_id: eventId, token_number: next.token_number, timeout_at },
    })

    return { data: updated, error: null }
  } catch (err) {
    console.error('❌ callNextQueueToken', err)
    return { data: null, error: err.message }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  ORGANISER: MARK ARRIVED (called → in_service)
// ─────────────────────────────────────────────────────────────────────────────
export async function markQueueEntryArrived(eventId, entryId) {
  try {
    if (!eventId || eventId === 'undefined') throw new Error('Invalid event ID')

    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) throw new Error('Not authenticated')

    const { data: event } = await supabase
      .from('events')
      .select('organizer_id')
      .eq('id', eventId)
      .single()
    if (!event || event.organizer_id !== user.id) throw new Error('Not authorized')

    const { data, error } = await supabase
      .from('queue_entries')
      .update({ status: 'in_service' })
      .eq('id', entryId)
      .eq('status', 'called')
      .select()
      .single()
    if (error) throw error

    return { data, error: null }
  } catch (err) {
    console.error('❌ markQueueEntryArrived', err)
    return { data: null, error: err.message }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  ORGANISER: MARK AS SERVED
// ─────────────────────────────────────────────────────────────────────────────
export async function markQueueEntryServed(eventId, entryId) {
  try {
    if (!eventId || eventId === 'undefined') throw new Error('Invalid event ID')

    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) throw new Error('Not authenticated')

    const { data: event } = await supabase
      .from('events')
      .select('organizer_id, name, auto_call_next')
      .eq('id', eventId)
      .single()
    if (!event || event.organizer_id !== user.id) throw new Error('Not authorized')

    const { data: entry } = await supabase
      .from('queue_entries')
      .select('user_id, token_number')
      .eq('id', entryId)
      .single()

    const now = new Date().toISOString()
    const { data, error } = await supabase
      .from('queue_entries')
      .update({ status: 'served', served_at: now })
      .eq('id', entryId)
      .select()
      .single()
    if (error) throw error

    if (entry?.user_id) {
      await notify({
        userId: entry.user_id,
        title: '✅ Served!',
        message: `Thank you for attending "${event.name}". Have a great day!`,
        type: 'queue_served',
        metadata: { event_id: eventId, token_number: entry.token_number },
      })
    }

    // No auto-call — organiser confirms next token manually
    return { data, error: null }
  } catch (err) {
    console.error('❌ markQueueEntryServed', err)
    return { data: null, error: err.message }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  ORGANISER: HANDLE TIMEOUT (no-show) — move person to END of queue
//
//  Fix: The original code set status='timed_out' and also tried to set
//  cancelled_at which caused confusion. Now we:
//  1. Mark the current called entry as 'timed_out' (no cancelled_at)
//  2. Get next token number and next available position
//  3. Re-insert the same user at the end with status='waiting'
//  4. Reorder all active positions so nothing is stale
// ─────────────────────────────────────────────────────────────────────────────
export async function handleQueueTimeout(eventId, entryId) {
  try {
    if (!eventId || eventId === 'undefined') throw new Error('Invalid event ID')
    if (!entryId) throw new Error('Invalid entry ID')

    console.log('⏰ handleQueueTimeout — eventId:', eventId, 'entryId:', entryId)

    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) throw new Error('Not authenticated')

    // Auth check
    const { data: event, error: eventErr } = await supabase
      .from('events')
      .select('organizer_id, name, waiting_timeout_minutes')
      .eq('id', eventId)
      .single()
    if (eventErr) throw new Error('Event fetch failed: ' + eventErr.message)
    if (!event || event.organizer_id !== user.id) throw new Error('Not authorized')

    // Fetch the entry being timed out
    const { data: entry, error: entryErr } = await supabase
      .from('queue_entries')
      .select('id, user_id, token_number, timeout_count, position, original_position, status')
      .eq('id', entryId)
      .single()
    if (entryErr) throw new Error('Entry fetch failed: ' + entryErr.message)
    if (!entry) throw new Error('Queue entry not found')
    if (entry.status !== 'called') throw new Error(`Entry is not in "called" state (current: ${entry.status})`)

    const now = new Date().toISOString()

    // Step 1: Mark current entry as timed_out
    // ✅ Only update fields that exist in the queue_entries schema
    const { error: timeoutErr } = await supabase
      .from('queue_entries')
      .update({
        status: 'timed_out',
        // cancelled_at is used for timed_out as per schema — it's the closest
        // "end time" field available; served_at is reserved for actual service
        cancelled_at: now,
      })
      .eq('id', entryId)
    if (timeoutErr) throw new Error('Failed to mark as timed_out: ' + timeoutErr.message)

    console.log('✅ Entry marked as timed_out:', entry.token_number)

    // Step 2: Get a fresh token number (total rows including just-timed-out one)
    const tokenNum = await getNextTokenNumber(eventId)
    const newTokenNumber = tokenLabel(tokenNum)

    // Step 3: Get current count of active entries (waiting + called + in_service)
    // to place the re-inserted entry at the very end
    const { count: activeCount, error: countErr } = await supabase
      .from('queue_entries')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .in('status', ['waiting', 'called', 'in_service'])
    if (countErr) throw new Error('Count fetch failed: ' + countErr.message)

    const newPosition = (activeCount || 0) + 1

    // Step 4: Re-insert user at end of queue with new token
    const newEntry = {
      event_id: eventId,
      user_id: entry.user_id,
      token_number: newTokenNumber,
      position: newPosition,
      // Keep original_position from the very first time they joined
      original_position: entry.timeout_count === 0
        ? entry.original_position ?? entry.position
        : entry.original_position ?? newPosition,
      status: 'waiting',
      joined_at: now,
      timeout_count: (entry.timeout_count || 0) + 1,
      // Do NOT include: called_at, timeout_at, served_at, cancelled_at
      // They default to null in the DB
    }

    console.log('📝 Re-inserting at position', newPosition, 'with token', newTokenNumber)

    const { data: inserted, error: insertErr } = await supabase
      .from('queue_entries')
      .insert(newEntry)
      .select()
      .single()
    if (insertErr) throw new Error('Re-insert failed: ' + insertErr.message)

    console.log('✅ Re-inserted successfully:', inserted.token_number)

    // Step 5: Notify the user
    await notify({
      userId: entry.user_id,
      title: '⏰ Moved to end of queue',
      message: `You didn't arrive in time at "${event.name}" and have been moved to position #${newPosition}. New token: ${newTokenNumber}.`,
      type: 'queue_timed_out',
      metadata: {
        event_id: eventId,
        old_token: entry.token_number,
        new_token: newTokenNumber,
        new_position: newPosition,
      },
    })

    // Step 6: Reorder remaining active positions cleanly
    await reorderQueuePositions(eventId)

    return { data: inserted, error: null }
  } catch (err) {
    console.error('❌ handleQueueTimeout', err)
    return { data: null, error: err.message }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  ORGANISER: REMOVE (skip/cancel) ANY ENTRY
// ─────────────────────────────────────────────────────────────────────────────
export async function removeQueueEntry(eventId, entryId) {
  try {
    if (!eventId || eventId === 'undefined') throw new Error('Invalid event ID')

    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) throw new Error('Not authenticated')

    const { data: event } = await supabase
      .from('events')
      .select('organizer_id')
      .eq('id', eventId)
      .single()
    if (!event || event.organizer_id !== user.id) throw new Error('Not authorized')

    const now = new Date().toISOString()
    const { data, error } = await supabase
      .from('queue_entries')
      .update({ status: 'cancelled', cancelled_at: now })
      .eq('id', entryId)
      .select()
      .single()
    if (error) throw error

    await reorderQueuePositions(eventId)
    return { data, error: null }
  } catch (err) {
    console.error('❌ removeQueueEntry', err)
    return { data: null, error: err.message }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  REALTIME SUBSCRIPTION
// ─────────────────────────────────────────────────────────────────────────────
export function subscribeToQueueEntries(eventId, { onChange, onError } = {}) {
  if (!eventId || eventId === 'undefined') {
    console.warn('subscribeToQueueEntries: invalid eventId', eventId)
    return () => {}
  }

  const channel = supabase
    .channel(`queue-entries-${eventId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'queue_entries', filter: `event_id=eq.${eventId}` },
      (payload) => { if (onChange) onChange(payload) }
    )
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR' && onError) onError(new Error('Realtime error'))
    })

  return () => channel.unsubscribe()
}

// ─────────────────────────────────────────────────────────────────────────────
//  ANALYTICS
// ─────────────────────────────────────────────────────────────────────────────
export async function getQueueBasedAnalytics(eventId) {
  try {
    if (!eventId || eventId === 'undefined') throw new Error('Invalid event ID')

    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) throw new Error('Not authenticated')

    const { data: event } = await supabase
      .from('events')
      .select('organizer_id, name, status')
      .eq('id', eventId)
      .single()
    if (!event || event.organizer_id !== user.id) throw new Error('Not authorized')

    const { data: all } = await supabase
      .from('queue_entries')
      .select('*')
      .eq('event_id', eventId)

    const entries = all || []
    return {
      data: {
        total_joined:      entries.length,
        total_served:      entries.filter(e => e.status === 'served').length,
        total_cancelled:   entries.filter(e => e.status === 'cancelled').length,
        total_timed_out:   entries.filter(e => e.status === 'timed_out').length,
        currently_waiting: entries.filter(e => e.status === 'waiting').length,
        currently_serving: entries.filter(e => e.status === 'in_service').length,
      },
      error: null,
    }
  } catch (err) {
    console.error('❌ getQueueBasedAnalytics', err)
    return { data: null, error: err.message }
  }
}