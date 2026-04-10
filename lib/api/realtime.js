// lib/api/realtime.js - Centralized Realtime Subscriptions - FIXED
import { supabase } from '../supabase/client';

/**
 * Subscribe to seller's queue updates (for seller dashboard)
 * @param {string} storeId - Store UUID
 * @param {object} callbacks - Event handlers
 * @returns {function} Cleanup function
 */
export function subscribeToSellerQueue(storeId, callbacks = {}) {
  const {
    onQueueUpdate = () => {},
    onOrderUpdate = () => {},
    onNewCustomer = () => {},
    onError = (err) => console.error('Realtime error:', err)
  } = callbacks;

  console.log('🔔 Setting up seller queue subscription for store:', storeId);

  // Validate storeId
  if (!storeId) {
    console.error('❌ Cannot subscribe: storeId is required');
    onError(new Error('Store ID is required for subscription'));
    return () => {}; // Return empty cleanup function
  }

  const channel = supabase
    .channel(`seller-queue-${storeId}`, {
      config: {
        broadcast: { self: true },
        presence: { key: storeId }
      }
    })
    
    // Listen to queue changes
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'queue',
        filter: `store_id=eq.${storeId}`
      },
      (payload) => {
        console.log('📡 Queue update:', payload);
        
        if (payload.eventType === 'INSERT') {
          onNewCustomer(payload.new);
        }
        
        onQueueUpdate(payload);
      }
    )
    
    // Listen to order changes
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'orders',
        filter: `store_id=eq.${storeId}`
      },
      (payload) => {
        console.log('📡 Order update:', payload);
        onOrderUpdate(payload);
      }
    )
    
    .subscribe((status, err) => {
      console.log('📊 Subscription status:', status);
      
      if (status === 'SUBSCRIBED') {
        console.log('✅ Seller queue subscription active');
      } else if (status === 'CHANNEL_ERROR') {
        console.error('❌ Channel error:', err);
        onError(err || new Error('Realtime channel error'));
      } else if (status === 'TIMED_OUT') {
        console.error('⏱️ Connection timed out');
        onError(new Error('Realtime connection timed out'));
      } else if (status === 'CLOSED') {
        console.log('🔌 Channel closed');
      }
    });

  // Return cleanup function
  return () => {
    console.log('🔌 Unsubscribing from seller queue');
    try {
      supabase.removeChannel(channel);
    } catch (error) {
      console.error('Error removing channel:', error);
    }
  };
}

/**
 * Subscribe to buyer's queue position (for buyer view)
 * @param {string} queueId - Queue entry UUID
 * @param {object} callbacks - Event handlers
 * @returns {function} Cleanup function
 */
export function subscribeToBuyerQueue(queueId, callbacks = {}) {
  const {
    onPositionUpdate = () => {},
    onStatusChange = () => {},
    onError = (err) => console.error('Realtime error:', err)
  } = callbacks;

  console.log('🔔 Setting up buyer queue subscription for:', queueId);

  // Validate queueId
  if (!queueId) {
    console.error('❌ Cannot subscribe: queueId is required');
    onError(new Error('Queue ID is required for subscription'));
    return () => {};
  }

  const channel = supabase
    .channel(`buyer-queue-${queueId}`, {
      config: {
        broadcast: { self: true }
      }
    })
    
    // Listen to this specific queue entry
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'queue',
        filter: `id=eq.${queueId}`
      },
      (payload) => {
        console.log('📡 Queue position update:', payload);
        
        const oldStatus = payload.old?.status;
        const newStatus = payload.new?.status;
        
        if (oldStatus !== newStatus && newStatus) {
          onStatusChange(newStatus, payload.new);
        }
        
        onPositionUpdate(payload.new);
      }
    )
    
    .subscribe((status, err) => {
      console.log('📊 Subscription status:', status);
      
      if (status === 'SUBSCRIBED') {
        console.log('✅ Buyer queue subscription active');
      } else if (status === 'CHANNEL_ERROR') {
        console.error('❌ Channel error:', err);
        onError(err || new Error('Realtime channel error'));
      } else if (status === 'TIMED_OUT') {
        console.error('⏱️ Connection timed out');
        onError(new Error('Realtime connection timed out'));
      }
    });

  // Return cleanup function
  return () => {
    console.log('🔌 Unsubscribing from buyer queue');
    try {
      supabase.removeChannel(channel);
    } catch (error) {
      console.error('Error removing channel:', error);
    }
  };
}

/**
 * Subscribe to ALL queue changes for a specific store (for buyer position tracking)
 * @param {string} storeId - Store UUID
 * @param {string} currentQueueId - Current buyer's queue ID
 * @param {object} callbacks - Event handlers
 * @returns {function} Cleanup function
 */
export function subscribeToBuyerStoreQueue(storeId, currentQueueId, callbacks = {}) {
  const {
    onQueuePositionChange = () => {},
    onStatusChange = () => {},
    onError = (err) => console.error('Realtime error:', err)
  } = callbacks;

  console.log('🔔 Setting up buyer store-wide queue subscription for store:', storeId);
  console.log('📍 Current buyer queue ID:', currentQueueId);

  // Validate inputs
  if (!storeId || !currentQueueId) {
    console.error('❌ Cannot subscribe: storeId and currentQueueId are required');
    onError(new Error('Store ID and Queue ID are required for subscription'));
    return () => {};
  }

  const channel = supabase
    .channel(`buyer-store-queue-${storeId}-${currentQueueId}`, {
      config: {
        broadcast: { self: true }
      }
    })
    
    // Listen to ALL queue changes in this store
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'queue',
        filter: `store_id=eq.${storeId}`
      },
      (payload) => {
        console.log('📡 Store queue update:', payload);
        
        // If MY queue entry was updated
        if (payload.new?.id === currentQueueId || payload.old?.id === currentQueueId) {
          const oldStatus = payload.old?.status;
          const newStatus = payload.new?.status;
          
          console.log('📢 MY queue entry changed:', { oldStatus, newStatus });
          
          if (oldStatus !== newStatus && newStatus) {
            onStatusChange(newStatus, payload.new);
          }
        }
        
        // Any queue change in this store affects position calculation
        onQueuePositionChange(payload);
      }
    )
    
    .subscribe((status, err) => {
      console.log('📊 Subscription status:', status);
      
      if (status === 'SUBSCRIBED') {
        console.log('✅ Buyer store queue subscription active');
      } else if (status === 'CHANNEL_ERROR') {
        console.error('❌ Channel error:', err);
        onError(err || new Error('Realtime channel error'));
      } else if (status === 'TIMED_OUT') {
        console.error('⏱️ Connection timed out');
        onError(new Error('Realtime connection timed out'));
      }
    });

  return () => {
    console.log('🔌 Unsubscribing from buyer store queue');
    try {
      supabase.removeChannel(channel);
    } catch (error) {
      console.error('Error removing channel:', error);
    }
  };
}

/**
 * Subscribe to store-wide queue updates (for live stats)
 * @param {string} storeId - Store UUID
 * @param {function} callback - Update handler
 * @returns {function} Cleanup function
 */
export function subscribeToQueueStats(storeId, callback) {
  console.log('🔔 Setting up queue stats subscription');

  if (!storeId) {
    console.error('❌ Cannot subscribe: storeId is required');
    return () => {};
  }

  const channel = supabase
    .channel(`queue-stats-${storeId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'queue',
        filter: `store_id=eq.${storeId}`
      },
      () => {
        // Trigger stats refresh
        callback();
      }
    )
    .subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        console.log('✅ Queue stats subscription active');
      } else if (status === 'CHANNEL_ERROR') {
        console.error('❌ Stats channel error:', err);
      }
    });

  return () => {
    try {
      supabase.removeChannel(channel);
    } catch (error) {
      console.error('Error removing channel:', error);
    }
  };
}

/**
 * Subscribe to notifications for a user
 * @param {string} userId - User UUID
 * @param {function} callback - Notification handler
 * @returns {function} Cleanup function
 */
export function subscribeToNotifications(userId, callback) {
  console.log('🔔 Setting up notifications subscription');

  if (!userId) {
    console.error('❌ Cannot subscribe: userId is required');
    return () => {};
  }

  const channel = supabase
    .channel(`notifications-${userId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`
      },
      (payload) => {
        console.log('📬 New notification:', payload.new);
        callback(payload.new);
      }
    )
    .subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        console.log('✅ Notifications subscription active');
      } else if (status === 'CHANNEL_ERROR') {
        console.error('❌ Notifications channel error:', err);
      }
    });

  return () => {
    try {
      supabase.removeChannel(channel);
    } catch (error) {
      console.error('Error removing channel:', error);
    }
  };
}

/**
 * Check if realtime is connected
 * @returns {Promise<boolean>}
 */
export async function checkRealtimeConnection() {
  try {
    const testChannel = supabase.channel('connection-test');
    
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        try {
          supabase.removeChannel(testChannel);
        } catch (err) {
          console.error('Error removing test channel:', err);
        }
        resolve(false);
      }, 5000);

      testChannel.subscribe((status) => {
        clearTimeout(timeout);
        const isConnected = status === 'SUBSCRIBED';
        console.log('🔍 Connection test result:', isConnected);
        try {
          supabase.removeChannel(testChannel);
        } catch (err) {
          console.error('Error removing test channel:', err);
        }
        resolve(isConnected);
      });
    });
  } catch (error) {
    console.error('Realtime connection check failed:', error);
    return false;
  }
}

/**
 * Broadcast an event to all subscribers (optional - for future use)
 * @param {string} channelName - Channel to broadcast on
 * @param {string} event - Event name
 * @param {object} payload - Data to broadcast
 */
export async function broadcastEvent(channelName, event, payload) {
  try {
    const channel = supabase.channel(channelName);
    
    await channel.subscribe();
    await channel.send({
      type: 'broadcast',
      event,
      payload
    });
    
    supabase.removeChannel(channel);
  } catch (error) {
    console.error('Broadcast event failed:', error);
    throw error;
  }
}

export default {
  subscribeToSellerQueue,
  subscribeToBuyerQueue,
  subscribeToBuyerStoreQueue,
  subscribeToQueueStats,
  subscribeToNotifications,
  checkRealtimeConnection,
  broadcastEvent
};