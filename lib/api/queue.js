// lib/api/queue.js - Updated with queue-only shop support
// 
// ✅ Changes for queue-only shops:
// 1. getSellerStoreId() now returns store_type
// 2. markAsCompleted() → sets status to 'completed' directly (not 'ready')
// 3. autoCallNextIfEmpty() is safe but only called from product-shop paths
// 4. callNextByToken() → new function for queue-only manual token confirmation
// 5. markAsServed() unchanged — still used for product shops only
//
// ✅ Queue-only store types: clinic, saloon, salon
//    Token confirmation dropdown is shown ONLY for these types.
//    All other store types (restaurant, retail, food, grocery, lab, etc.)
//    are treated as product-based shops.
//
import { supabase } from '../supabase/client';
import toast from 'react-hot-toast';

// ─── Constants ───────────────────────────────────────────────────────────────

/**
 * Store types that use the token confirmation panel (queue-only / service-based).
 * Only clinic, saloon, and salon get the dropdown + manual confirm flow.
 * Every other store type is treated as a product-based shop.
 */
const QUEUE_ONLY_STORE_TYPES = ['clinic', 'saloon', 'salon'];

/**
 * Utility: check if a store_type is product-based.
 *
 * Returns TRUE  → product shop  (show order details, auto-call, "Call Next" button)
 * Returns FALSE → queue-only    (show token confirmation dropdown, manual confirm)
 *
 * Queue-only types: clinic | saloon | salon
 * Everything else is treated as a product-based shop.
 */
export function isProductBasedStore(storeType) {
  return !QUEUE_ONLY_STORE_TYPES.includes((storeType || '').toLowerCase());
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────

/**
 * Manually recalculate wait times for a store.
 * Non-critical — failures are logged but not thrown.
 */
async function recalculateWaitTimes(storeId) {
  try {
    if (!storeId) return;
    console.log('♻️ Recalculating wait times for store:', storeId);
    const { error } = await supabase.rpc('calculate_queue_wait_times', {
      store_id_param: storeId
    });
    if (error) {
      console.warn('⚠️ Wait time calculation warning:', error.message);
    } else {
      console.log('✅ Wait times recalculated successfully');
    }
  } catch (err) {
    console.warn('⚠️ Wait time recalculation failed:', err.message);
  }
}

// ─── Store / Auth ─────────────────────────────────────────────────────────────

/**
 * Get seller's store ID and metadata from authenticated user.
 * ✅ Now also returns store_type so the UI can gate queue-only logic.
 */
export async function getSellerStoreId() {
  try {
    console.log('🔍 === GET SELLER STORE ID START ===');

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new Error('User not authenticated');

    console.log('✅ User authenticated:', user.id, user.email);

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, user_type, full_name')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) throw new Error(`Profile not found: ${profileError?.message}`);

    const validTypes = ['seller', 'business'];
    if (!validTypes.includes(profile.user_type)) {
      throw new Error(`User is not a seller. Current type: ${profile.user_type}`);
    }

    const { data: businessesWithOwner, error: ownerError } = await supabase
      .from('businesses')
      .select('id, company_name, owner_id')
      .eq('owner_id', user.id)
      .limit(1);

    let businesses = businessesWithOwner;
    let businessError = ownerError;

    if (ownerError) {
      console.warn('⚠️ Could not filter by owner_id:', ownerError.message);
      const { data: fallbackBusinesses, error: fallbackError } = await supabase
        .from('businesses')
        .select('id, company_name')
        .limit(1);
      businesses = fallbackBusinesses;
      businessError = fallbackError;
    }

    if (businessError || !businesses || businesses.length === 0) {
      throw new Error('No business found. Please create a business first.');
    }

    const businessId = businesses[0].id;

    // ✅ Added store_type to the select
    const { data: store, error: storeError } = await supabase
      .from('stores')
      .select('id, store_name, store_type, avg_service_time, is_open, is_active')
      .eq('business_id', businessId)
      .single();

    if (storeError || !store) throw new Error('Store not found for this business');

    console.log('✅ Store found:', {
      id: store.id,
      name: store.store_name,
      type: store.store_type,
      is_open: store.is_open,
    });

    console.log('🎉 === GET SELLER STORE ID SUCCESS ===');
    return { data: store, error: null };

  } catch (error) {
    console.error('💥 === GET SELLER STORE ID FAILED ===', error.message);
    return { data: null, error: error.message };
  }
}

// ─── Queue Reads ──────────────────────────────────────────────────────────────

/**
 * Fetch current serving queue entry (in_service status)
 */
export async function getCurrentServingToken(storeId) {
  try {
    console.log('🔍 Getting current serving token for store:', storeId);

    const { data, error } = await supabase
      .from('queue')
      .select(`
        *,
        orders (
          id,
          order_number,
          items,
          total_amount,
          payment_status,
          order_status,
          ordered_at
        )
      `)
      .eq('store_id', storeId)
      .eq('status', 'in_service')
      .order('service_started_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') throw error;

    console.log('✅ Current serving token:', data?.token_number || 'None');
    return { data: data || null, error: null };
  } catch (error) {
    console.error('Error fetching current serving token:', error);
    return { data: null, error: error.message };
  }
}

/**
 * Fetch waiting queue list
 */
export async function getWaitingQueue(storeId) {
  try {
    console.log('🔍 Getting waiting queue for store:', storeId);

    const { data, error } = await supabase
      .from('queue')
      .select(`
        *,
        orders (
          id,
          order_number,
          payment_status
        )
      `)
      .eq('store_id', storeId)
      .eq('status', 'waiting')
      .order('queue_position', { ascending: true });

    if (error) throw error;

    console.log('✅ Waiting queue:', data?.length || 0, 'customers');
    return { data: data || [], error: null };
  } catch (error) {
    console.error('Error fetching waiting queue:', error);
    return { data: [], error: error.message };
  }
}

/**
 * Get queue statistics for today
 */
export async function getQueueStats(storeId) {
  try {
    const today = new Date();
    const startOfDay = new Date(today.setHours(0, 0, 0, 0)).toISOString();
    const endOfDay = new Date(today.setHours(23, 59, 59, 999)).toISOString();

    const { data: allQueue, error: queueError } = await supabase
      .from('queue')
      .select('id, status, wait_time_minutes')
      .eq('store_id', storeId)
      .gte('created_at', startOfDay)
      .lte('created_at', endOfDay);

    if (queueError) throw queueError;

    const { data: activeQueue, error: activeError } = await supabase
      .from('queue')
      .select('id, wait_time_minutes, status')
      .eq('store_id', storeId)
      .in('status', ['waiting', 'in_service']);

    if (activeError) throw activeError;

    const { data: cancelledOrders, error: ordersError } = await supabase
      .from('orders')
      .select('id')
      .eq('store_id', storeId)
      .eq('order_status', 'cancelled')
      .gte('created_at', startOfDay)
      .lte('created_at', endOfDay);

    if (ordersError) throw ordersError;

    const cancelledFromQueue = allQueue?.filter(q => q.status === 'cancelled').length || 0;
    const cancelledOrderIds = new Set(cancelledOrders?.map(o => o.id) || []);
    const queuedOrderIds = new Set();

    if (allQueue && allQueue.length > 0) {
      const { data: ordersWithQueue } = await supabase
        .from('orders')
        .select('id')
        .eq('store_id', storeId)
        .not('queue_id', 'is', null)
        .eq('order_status', 'cancelled')
        .gte('created_at', startOfDay)
        .lte('created_at', endOfDay);

      if (ordersWithQueue) {
        ordersWithQueue.forEach(o => queuedOrderIds.add(o.id));
      }
    }

    const cancelledWithoutQueue = Array.from(cancelledOrderIds).filter(id => !queuedOrderIds.has(id)).length;
    const totalCancelled = cancelledFromQueue + cancelledWithoutQueue;

    const stats = {
      totalInQueue: activeQueue?.length || 0,
      servedToday: allQueue?.filter(q =>
        q.status === 'completed' || q.status === 'served' || q.status === 'ready'
      ).length || 0,
      cancelledToday: totalCancelled,
      avgWaitTime: activeQueue && activeQueue.length > 0
        ? Math.round(activeQueue.reduce((sum, q) => sum + (q.wait_time_minutes || 0), 0) / activeQueue.length)
        : 0
    };

    return { data: stats, error: null };
  } catch (error) {
    console.error('Error fetching queue stats:', error);
    return {
      data: { totalInQueue: 0, servedToday: 0, cancelledToday: 0, avgWaitTime: 0 },
      error: error.message
    };
  }
}

// ─── Queue Actions (Product Shops) ───────────────────────────────────────────

/**
 * Call next customer from waiting queue — used by PRODUCT-BASED shops.
 * For queue-only shops (clinic / saloon), use callNextByToken() instead.
 */
export async function callNextCustomer(storeId) {
  try {
    console.log('📢 === CALLING NEXT CUSTOMER (product shop) ===');

    const { data: currentServing } = await supabase
      .from('queue')
      .select('id, token_number')
      .eq('store_id', storeId)
      .eq('status', 'in_service')
      .maybeSingle();

    if (currentServing) {
      return { data: null, error: 'Someone is already being served. Complete current service first.' };
    }

    const { data: nextInQueue, error: fetchError } = await supabase
      .from('queue')
      .select('*')
      .eq('store_id', storeId)
      .eq('status', 'waiting')
      .order('queue_position', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (fetchError) {
      if (fetchError.code === 'PGRST116') return { data: null, error: 'No customers in queue' };
      throw fetchError;
    }

    if (!nextInQueue) return { data: null, error: 'No customers in queue' };

    const now = new Date().toISOString();

    const { data: updated, error: updateError } = await supabase
      .from('queue')
      .update({
        status: 'in_service',
        service_started_at: now,
        updated_at: now
      })
      .eq('id', nextInQueue.id)
      .select()
      .single();

    if (updateError) throw updateError;

    console.log('✅ Customer moved to in_service:', updated.token_number);

    if (nextInQueue.id) {
      const { data: orders } = await supabase
        .from('orders')
        .select('id')
        .eq('queue_id', nextInQueue.id)
        .maybeSingle();

      if (orders) {
        await supabase
          .from('orders')
          .update({ order_status: 'preparing', updated_at: now })
          .eq('id', orders.id);
      }
    }

    await recalculateWaitTimes(storeId);
    return { data: updated, error: null };
  } catch (error) {
    console.error('💥 Error calling next customer:', error);
    return { data: null, error: error.message };
  }
}

/**
 * ✅ Call a specific customer by their queue entry ID — QUEUE-ONLY shops only.
 *    Applicable store types: clinic | saloon | salon
 *
 * The seller selects a token from the dropdown. This function:
 * 1. Validates the selected queue entry exists and is 'waiting'
 * 2. Ensures no one is already in_service
 * 3. Moves that exact entry to 'in_service'
 * 4. Does NOT auto-call anyone after — seller must confirm next token manually
 */
export async function callNextByToken(storeId, queueEntryId) {
  try {
    console.log('🎫 === CALL BY TOKEN (queue-only shop: clinic/saloon) ===');
    console.log('Entry ID:', queueEntryId);

    // Check no one is already being served
    const { data: currentServing } = await supabase
      .from('queue')
      .select('id, token_number')
      .eq('store_id', storeId)
      .eq('status', 'in_service')
      .maybeSingle();

    if (currentServing) {
      return {
        data: null,
        error: `${currentServing.token_number} is already being served. Mark them as served first.`
      };
    }

    // Fetch the selected queue entry
    const { data: entry, error: fetchError } = await supabase
      .from('queue')
      .select('*')
      .eq('id', queueEntryId)
      .eq('store_id', storeId)
      .eq('status', 'waiting')
      .maybeSingle();

    if (fetchError) throw fetchError;

    if (!entry) {
      return {
        data: null,
        error: 'Selected token is no longer in the waiting queue.'
      };
    }

    const now = new Date().toISOString();

    // Move to in_service
    const { data: updated, error: updateError } = await supabase
      .from('queue')
      .update({
        status: 'in_service',
        service_started_at: now,
        updated_at: now
      })
      .eq('id', entry.id)
      .select()
      .single();

    if (updateError) throw updateError;

    console.log('✅ Token confirmed and moved to in_service:', updated.token_number);

    await recalculateWaitTimes(storeId);

    return { data: updated, error: null };
  } catch (error) {
    console.error('💥 Error calling by token:', error);
    return { data: null, error: error.message };
  }
}

// ─── Queue Actions (Product Shops — Mark as Ready) ───────────────────────────

/**
 * Mark current customer as 'ready' — PRODUCT-BASED shops only.
 * Sets status = 'ready' (order is prepared, waiting for pickup).
 * Triggers auto-call next if enabled.
 */
export async function markAsServed(queueId, storeId) {
  try {
    console.log('✅ === MARKING AS READY (product shop) ===');

    const { data: currentEntry } = await supabase
      .from('queue')
      .select('service_started_at, store_id')
      .eq('id', queueId)
      .single();

    const now = new Date().toISOString();
    let actualDuration = null;

    if (currentEntry?.service_started_at) {
      const startTime = new Date(currentEntry.service_started_at);
      actualDuration = Math.round((new Date(now) - startTime) / 60000);
    }

    const { data, error } = await supabase
      .from('queue')
      .update({
        status: 'ready',
        service_completed_at: now,
        actual_service_duration: actualDuration,
        notified_at: now,
        updated_at: now
      })
      .eq('id', queueId)
      .select()
      .single();

    if (error) throw error;

    console.log('✅ Marked as ready:', data.token_number);

    // sync_queue_status_to_order trigger handles order update automatically
    // But we also do it explicitly for safety on product shops
    const { data: order } = await supabase
      .from('orders')
      .select('id')
      .eq('queue_id', queueId)
      .maybeSingle();

    if (order) {
      await supabase
        .from('orders')
        .update({ order_status: 'ready', updated_at: now })
        .eq('id', order.id);
    }

    const actualStoreId = storeId || currentEntry?.store_id;
    if (actualStoreId) {
      await recalculateWaitTimes(actualStoreId);
      // Auto-call is fine for product shops — gated by the store setting
      await autoCallNextIfEmpty(actualStoreId);
    }

    return { data, error: null };
  } catch (error) {
    console.error('💥 Error marking as ready:', error);
    return { data: null, error: error.message };
  }
}

// ─── Queue Actions (Queue-Only Shops — Mark as Completed) ────────────────────

/**
 * ✅ Mark current customer as 'completed' — QUEUE-ONLY shops only.
 *    Applicable store types: clinic | saloon | salon
 *
 * Key differences from markAsServed():
 * - Sets status = 'completed' (not 'ready') — service is fully done
 * - Does NOT auto-call next customer
 * - The trigger sync_queue_status_to_order will sync the order automatically
 * - Seller must manually confirm next token via the dropdown
 */
export async function markAsCompleted(queueId, storeId) {
  try {
    console.log('✅ === MARKING AS COMPLETED (queue-only: clinic/saloon) ===');
    console.log('Queue ID:', queueId);

    const { data: currentEntry } = await supabase
      .from('queue')
      .select('service_started_at, store_id, token_number')
      .eq('id', queueId)
      .single();

    const now = new Date().toISOString();
    let actualDuration = null;

    if (currentEntry?.service_started_at) {
      const startTime = new Date(currentEntry.service_started_at);
      actualDuration = Math.round((new Date(now) - startTime) / 60000);
    }

    // ✅ Set to 'completed' — full closure of this token
    const { data, error } = await supabase
      .from('queue')
      .update({
        status: 'completed',
        service_completed_at: now,
        actual_service_duration: actualDuration,
        notified_at: now,
        updated_at: now
      })
      .eq('id', queueId)
      .select()
      .single();

    if (error) throw error;

    console.log('✅ Marked as completed:', data.token_number);

    // Note: sync_queue_status_to_order trigger fires automatically on status change.
    // No manual order update needed here. The trigger handles it.

    const actualStoreId = storeId || currentEntry?.store_id;
    if (actualStoreId) {
      await recalculateWaitTimes(actualStoreId);
      // ✅ Do NOT call autoCallNextIfEmpty — seller must confirm next token manually
    }

    console.log('🎉 === MARK AS COMPLETED DONE — awaiting manual token confirmation ===');
    return { data, error: null };
  } catch (error) {
    console.error('💥 Error marking as completed:', error);
    return { data: null, error: error.message };
  }
}

// ─── Queue Actions (Shared) ───────────────────────────────────────────────────

/**
 * Skip/Cancel a queue entry — works for both shop types
 */
export async function skipQueueEntry(queueId, storeId) {
  try {
    console.log('⏭️ === SKIPPING QUEUE ENTRY ===');
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('queue')
      .update({ status: 'cancelled', updated_at: now })
      .eq('id', queueId)
      .select()
      .single();

    if (error) throw error;

    console.log('✅ Queue entry cancelled:', data.token_number);

    // Explicit order update for safety (trigger also handles this)
    const { data: order } = await supabase
      .from('orders')
      .select('id')
      .eq('queue_id', queueId)
      .maybeSingle();

    if (order) {
      await supabase
        .from('orders')
        .update({
          order_status: 'cancelled',
          cancelled_at: now,
          cancellation_reason: 'Skipped by seller',
          updated_at: now
        })
        .eq('id', order.id);
    }

    if (storeId) await recalculateWaitTimes(storeId);

    return { data, error: null };
  } catch (error) {
    console.error('Error skipping queue entry:', error);
    return { data: null, error: error.message };
  }
}

// ─── Store Settings ───────────────────────────────────────────────────────────

export async function getStoreSettings(storeId) {
  try {
    const { data, error } = await supabase
      .from('stores')
      .select('auto_call_next, is_open')
      .eq('id', storeId)
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching store settings:', error);
    return { data: { auto_call_next: false, is_open: true }, error: error.message };
  }
}

export async function toggleStoreStatus(storeId, isOpen) {
  try {
    const { data, error } = await supabase
      .from('stores')
      .update({ is_open: isOpen, updated_at: new Date().toISOString() })
      .eq('id', storeId)
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error toggling store status:', error);
    return { data: null, error: error.message };
  }
}

export async function updateQueueSettings(storeId, settings) {
  try {
    const { data, error } = await supabase
      .from('stores')
      .update({ auto_call_next: settings.autoCallNext, updated_at: new Date().toISOString() })
      .eq('id', storeId)
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error updating queue settings:', error);
    return { data: null, error: error.message };
  }
}

// ─── Auto-call (Product Shops Only) ──────────────────────────────────────────

/**
 * Auto-call next customer if no one is being served.
 * Only executes if store's auto_call_next setting is enabled.
 * Called only from product-shop code paths — never from queue-only paths.
 */
export async function autoCallNextIfEmpty(storeId) {
  try {
    console.log('🔄 Auto-checking if we should call next customer...');

    const { data: storeSettings } = await supabase
      .from('stores')
      .select('auto_call_next')
      .eq('id', storeId)
      .single();

    if (!storeSettings?.auto_call_next) {
      console.log('⏸️ Auto-call next is DISABLED — skipping');
      return { data: null, error: null };
    }

    const { data: serving } = await supabase
      .from('queue')
      .select('id')
      .eq('store_id', storeId)
      .eq('status', 'in_service')
      .maybeSingle();

    if (serving) {
      console.log('✅ Someone already being served, no auto-call needed');
      return { data: null, error: null };
    }

    const { data: waiting } = await supabase
      .from('queue')
      .select('id')
      .eq('store_id', storeId)
      .eq('status', 'waiting')
      .limit(1)
      .maybeSingle();

    if (!waiting) {
      console.log('✅ No one waiting, no auto-call needed');
      return { data: null, error: null };
    }

    console.log('📢 Auto-calling next customer...');
    const result = await callNextCustomer(storeId);

    if (result.data) {
      toast.success(`Auto-called: ${result.data.token_number}`, { icon: '🤖', duration: 3000 });
    }

    return result;
  } catch (error) {
    console.error('Error in auto-call:', error);
    return { data: null, error: error.message };
  }
}

/**
 * Check and auto-transition customers based on estimated time.
 * Only used by product-based shops with auto-call enabled.
 */
export async function checkAndAutoTransition(storeId) {
  try {
    console.log('⏰ === CHECKING AUTO-TRANSITION ===');

    const { data: storeSettings } = await supabase
      .from('stores')
      .select('auto_call_next, avg_service_time')
      .eq('id', storeId)
      .single();

    if (!storeSettings) return { data: null, error: null };

    const { data: currentServing } = await supabase
      .from('queue')
      .select('id, token_number, service_started_at, estimated_time, wait_time_minutes')
      .eq('store_id', storeId)
      .eq('status', 'in_service')
      .maybeSingle();

    if (!currentServing) return { data: null, error: null };

    const now = new Date();
    const serviceStarted = new Date(currentServing.service_started_at);
    const elapsedMinutes = Math.round((now - serviceStarted) / 60000);
    const expectedDuration = currentServing.wait_time_minutes || storeSettings.avg_service_time || 5;

    console.log('⏰ Time check:', {
      token: currentServing.token_number,
      elapsed: elapsedMinutes,
      expected: expectedDuration,
      timeUp: elapsedMinutes >= expectedDuration
    });

    if (elapsedMinutes >= expectedDuration) {
      console.log('⏰ Time is up for:', currentServing.token_number);

      const { data: updated, error: updateError } = await supabase
        .from('queue')
        .update({
          status: 'ready',
          service_completed_at: now.toISOString(),
          actual_service_duration: elapsedMinutes,
          notified_at: now.toISOString(),
          updated_at: now.toISOString()
        })
        .eq('id', currentServing.id)
        .select()
        .single();

      if (updateError) {
        console.error('❌ Error auto-transitioning:', updateError);
        return { shouldReload: false };
      }

      await recalculateWaitTimes(storeId);
      await callNextCustomer(storeId);

      return { shouldReload: true };
    }

    return { data: null, error: null, shouldReload: false };
  } catch (error) {
    console.error('💥 Error in auto-transition:', error);
    return { data: null, error: error.message };
  }
}

// ─── Buyer-Facing Queue Info ──────────────────────────────────────────────────

export async function getStoreCompleteQueueInfo(storeId) {
  try {
    const { data: queueList, error: queueError } = await supabase
      .from('queue')
      .select(`
        id,
        token_number,
        token_sequence,
        status,
        wait_time_minutes,
        estimated_time,
        priority,
        customer_name,
        service_started_at,
        calculated_wait_minutes
      `)
      .eq('store_id', storeId)
      .in('status', ['waiting', 'in_service', 'ready'])
      .order('queue_position', { ascending: true });

    if (queueError) throw queueError;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data: completedToday } = await supabase
      .from('queue')
      .select('service_started_at, service_completed_at, actual_service_duration')
      .eq('store_id', storeId)
      .eq('status', 'completed')
      .gte('created_at', today.toISOString())
      .not('service_started_at', 'is', null)
      .not('service_completed_at', 'is', null);

    let avgServiceTime = 5;
    if (completedToday && completedToday.length > 0) {
      const durations = completedToday.map(q => {
        if (q.actual_service_duration) return q.actual_service_duration;
        return Math.round((new Date(q.service_completed_at) - new Date(q.service_started_at)) / 60000);
      });
      avgServiceTime = Math.round(durations.reduce((sum, d) => sum + d, 0) / durations.length);
    }

    const currentlyServing = queueList.find(q => q.status === 'in_service');
    const waiting = queueList.filter(q => q.status === 'waiting');
    const ready = queueList.filter(q => q.status === 'ready');

    return {
      data: {
        queueSize: waiting.length,
        currentlyServing: currentlyServing || null,
        waiting: waiting.length,
        ready: ready.length,
        avgWaitTime: waiting.length > 0 ? waiting.length * avgServiceTime : 0,
        peopleInQueue: queueList.map((q, idx) => ({
          id: q.id,
          position: idx + 1,
          tokenNumber: q.token_number,
          status: q.status,
          priority: q.priority,
          estimatedWaitTime: q.calculated_wait_minutes || q.wait_time_minutes || 0,
          customerName: q.customer_name
        }))
      },
      error: null
    };
  } catch (error) {
    console.error('Error fetching complete queue info:', error);
    return {
      data: { queueSize: 0, avgWaitTime: 0, currentlyServing: null, waiting: 0, ready: 0, peopleInQueue: [] },
      error: error.message
    };
  }
}

export const fetchStoreQueueInfo = getStoreCompleteQueueInfo;