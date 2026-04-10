// lib/api/notifications.js  -- For Seller

import { supabase } from '@/lib/supabase/client';

/**
 * Get all notifications for the current user
 */
export async function getNotifications(filters = {}) {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      throw new Error('Not authenticated');
    }

    let query = supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    // Apply filters
    if (filters.isRead !== undefined) {
      query = query.eq('is_read', filters.isRead);
    }

    if (filters.type) {
      query = query.eq('type', filters.type);
    }

    if (filters.limit) {
      query = query.limit(filters.limit);
    }

    const { data, error } = await query;

    if (error) throw error;

    return {
      success: true,
      data: data || [],
    };
  } catch (error) {
    console.error('Get notifications error:', error);
    return {
      success: false,
      error: error.message || 'Failed to fetch notifications',
      data: [],
    };
  }
}

/**
 * Get unread notification count
 */
export async function getUnreadCount() {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return { success: true, count: 0 };
    }

    const { count, error } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_read', false);

    if (error) throw error;

    return {
      success: true,
      count: count || 0,
    };
  } catch (error) {
    console.error('Get unread count error:', error);
    return {
      success: true,
      count: 0,
    };
  }
}

/**
 * Mark notification as read
 */
export async function markAsRead(notificationId) {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      throw new Error('Not authenticated');
    }

    const { error } = await supabase
      .from('notifications')
      .update({
        is_read: true,
        read_at: new Date().toISOString(),
      })
      .eq('id', notificationId)
      .eq('user_id', user.id);

    if (error) throw error;

    return {
      success: true,
      message: 'Notification marked as read',
    };
  } catch (error) {
    console.error('Mark as read error:', error);
    return {
      success: false,
      error: error.message || 'Failed to mark notification as read',
    };
  }
}

/**
 * Mark all notifications as read
 */
export async function markAllAsRead() {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      throw new Error('Not authenticated');
    }

    const { error } = await supabase
      .from('notifications')
      .update({
        is_read: true,
        read_at: new Date().toISOString(),
      })
      .eq('user_id', user.id)
      .eq('is_read', false);

    if (error) throw error;

    return {
      success: true,
      message: 'All notifications marked as read',
    };
  } catch (error) {
    console.error('Mark all as read error:', error);
    return {
      success: false,
      error: error.message || 'Failed to mark all notifications as read',
    };
  }
}

/**
 * Delete notification
 */
export async function deleteNotification(notificationId) {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      throw new Error('Not authenticated');
    }

    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('id', notificationId)
      .eq('user_id', user.id);

    if (error) throw error;

    return {
      success: true,
      message: 'Notification deleted',
    };
  } catch (error) {
    console.error('Delete notification error:', error);
    return {
      success: false,
      error: error.message || 'Failed to delete notification',
    };
  }
}

/**
 * Delete all read notifications
 */
export async function deleteAllRead() {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      throw new Error('Not authenticated');
    }

    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('user_id', user.id)
      .eq('is_read', true);

    if (error) throw error;

    return {
      success: true,
      message: 'Read notifications deleted',
    };
  } catch (error) {
    console.error('Delete all read error:', error);
    return {
      success: false,
      error: error.message || 'Failed to delete read notifications',
    };
  }
}

/**
 * Create notification (for testing or manual creation)
 */
export async function createNotification(notificationData) {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      throw new Error('Not authenticated');
    }

    const { data, error } = await supabase
      .from('notifications')
      .insert([{
        user_id: user.id,
        title: notificationData.title,
        message: notificationData.message,
        type: notificationData.type || 'info',
        action_url: notificationData.action_url || null,
        metadata: notificationData.metadata || null,
      }])
      .select()
      .single();

    if (error) throw error;

    return {
      success: true,
      data: data,
      message: 'Notification created',
    };
  } catch (error) {
    console.error('Create notification error:', error);
    return {
      success: false,
      error: error.message || 'Failed to create notification',
    };
  }
}

/**
 * Subscribe to real-time notifications
 */
export function subscribeToNotifications(userId, callback) {
  const channel = supabase
    .channel('notifications_channel')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        console.log('New notification received:', payload);
        callback({ type: 'INSERT', notification: payload.new });
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        console.log('Notification updated:', payload);
        callback({ type: 'UPDATE', notification: payload.new });
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'DELETE',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        console.log('Notification deleted:', payload);
        callback({ type: 'DELETE', notification: payload.old });
      }
    )
    .subscribe();

  // Return cleanup function
  return () => {
    supabase.removeChannel(channel);
  };
}