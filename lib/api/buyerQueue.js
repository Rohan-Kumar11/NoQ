// lib/api/buyerQueue.js
//
// Buyer-facing queue API functions.
// Kept separate from lib/api/queue.js (which is seller-facing) to avoid
// any accidental side-effects on seller logic.
//
import { supabase } from '../supabase/client';

/**
 * Store types that have product-based ordering.
 * Mirrors the same constant in lib/api/queue.js — single source of truth
 * could be a shared constants file if preferred.
 */
const PRODUCT_BASED_STORE_TYPES = ['restaurant', 'retail', 'food', 'grocery'];

export function isProductBasedStoreType(storeType) {
  return PRODUCT_BASED_STORE_TYPES.includes((storeType || '').toLowerCase());
}

/**
 * Cancel a queue entry from the buyer side.
 *
 * Rules (confirmed):
 * - Product shops  : allowed ONLY when status = 'waiting'
 *                    → cancels queue row + linked order row
 * - Queue-only shops: allowed ONLY when status = 'in_service'
 *                    → cancels queue row only (no linked order exists)
 *
 * @param {string} queueId   - UUID of the queue entry
 * @param {string} storeType - store_type value from stores table
 * @returns {{ success: boolean, error: string|null }}
 */
export async function cancelQueueEntry(queueId, storeType) {
  try {
    const isProductShop = isProductBasedStoreType(storeType);

    // 1. Fetch the current queue entry to validate its status
    const { data: entry, error: fetchError } = await supabase
      .from('queue')
      .select('id, status, store_id')
      .eq('id', queueId)
      .single();

    if (fetchError || !entry) {
      return { success: false, error: 'Queue entry not found.' };
    }

    // 2. Validate cancellable status based on shop type
    //    Product shops  → only 'waiting' is cancellable
    //    Queue-only     → only 'in_service' is cancellable
    const cancellableStatus = isProductShop ? 'waiting' : 'in_service';

    if (entry.status !== cancellableStatus) {
      if (isProductShop) {
        // e.g. already in_service, completed, cancelled
        return {
          success: false,
          error: entry.status === 'in_service'
            ? 'Your order is already being prepared and cannot be cancelled.'
            : `Cannot cancel an order with status: ${entry.status}.`
        };
      } else {
        // queue-only: only cancellable while in_service
        return {
          success: false,
          error: entry.status === 'waiting'
            ? 'You can only leave the queue once your service has started.'
            : `Cannot cancel a queue entry with status: ${entry.status}.`
        };
      }
    }

    const now = new Date().toISOString();

    // 3. Cancel the queue entry
    const { error: updateError } = await supabase
      .from('queue')
      .update({
        status: 'cancelled',
        updated_at: now
      })
      .eq('id', queueId);

    if (updateError) throw updateError;

    // 4. Product shops only: also cancel the linked order.
    //    Queue-only shops have no linked orders — skip entirely.
    //    (sync_queue_status_to_order trigger also fires, this is a safety belt.)
    if (isProductShop) {
      const { data: linkedOrder } = await supabase
        .from('orders')
        .select('id')
        .eq('queue_id', queueId)
        .maybeSingle();

      if (linkedOrder) {
        await supabase
          .from('orders')
          .update({
            order_status: 'cancelled',
            cancelled_at: now,
            cancellation_reason: 'Cancelled by customer',
            updated_at: now
          })
          .eq('id', linkedOrder.id);
      }
    }

    return { success: true, error: null };
  } catch (err) {
    console.error('❌ cancelQueueEntry error:', err);
    return { success: false, error: err.message || 'Failed to cancel. Please try again.' };
  }
}