// lib/api/dashboard.js - Seller Dashboard Data Fetching
// Updated: Queue-aware functions for queue-only stores (clinic, salon, etc.)
import { supabase } from '../supabase/client';

/**
 * Get hourly activity data for today.
 * Product stores → queries orders.ordered_at
 * Queue-only stores → queries queue.issued_at
 */
export async function getHourlyActivity(storeId, isQueueOnly = false) {
  try {
    if (!storeId) throw new Error('Store ID required');

    const today = new Date();
    const startOfDay = new Date(today.setHours(0, 0, 0, 0)).toISOString();
    const endOfDay   = new Date(today.setHours(23, 59, 59, 999)).toISOString();

    const hourlyData = {};
    for (let hour = 0; hour < 24; hour++) {
      hourlyData[hour] = { hour: formatHour(hour), customers: 0, revenue: 0 };
    }

    if (isQueueOnly) {
      const { data: entries, error } = await supabase
        .from('queue')
        .select('issued_at')
        .eq('store_id', storeId)
        .neq('status', 'cancelled')
        .gte('issued_at', startOfDay)
        .lte('issued_at', endOfDay)
        .order('issued_at', { ascending: true });

      if (error) throw error;

      (entries || []).forEach(entry => {
        const hour = new Date(entry.issued_at).getHours();
        hourlyData[hour].customers += 1;
      });
    } else {
      const { data: orders, error } = await supabase
        .from('orders')
        .select('ordered_at, total_amount, payment_status')
        .eq('store_id', storeId)
        .gte('ordered_at', startOfDay)
        .lte('ordered_at', endOfDay)
        .order('ordered_at', { ascending: true });

      if (error) throw error;

      (orders || []).forEach(order => {
        const hour = new Date(order.ordered_at).getHours();
        hourlyData[hour].customers += 1;
        if (order.payment_status === 'paid') {
          hourlyData[hour].revenue += parseFloat(order.total_amount) || 0;
        }
      });
    }

    return { data: Object.values(hourlyData), error: null };
  } catch (error) {
    console.error('Error fetching hourly activity:', error);
    return { data: [], error: error.message };
  }
}

function formatHour(hour) {
  if (hour === 0)  return '12AM';
  if (hour < 12)  return `${hour}AM`;
  if (hour === 12) return '12PM';
  return `${hour - 12}PM`;
}

/**
 * Get recent orders — product-based stores only.
 */
export async function getRecentOrders(storeId, limit = 10) {
  try {
    if (!storeId) throw new Error('Store ID required');

    const { data: orders, error } = await supabase
      .from('orders')
      .select('id, order_number, total_amount, order_status, ordered_at, items, customer_id')
      .eq('store_id', storeId)
      .order('ordered_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    if (!orders || orders.length === 0) return { data: [], error: null };

    const enriched = await Promise.all(
      orders.map(async (order) => {
        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', order.customer_id)
            .single();

          return {
            id: order.id,
            customer: profile?.full_name || 'Guest',
            items: Array.isArray(order.items) ? order.items.length : 0,
            amount: order.total_amount,
            status: order.order_status,
            time: new Date(order.ordered_at).toLocaleTimeString('en-US', {
              hour: 'numeric', minute: '2-digit', hour12: true
            }),
            orderNumber: order.order_number
          };
        } catch {
          return {
            id: order.id,
            customer: 'Guest',
            items: Array.isArray(order.items) ? order.items.length : 0,
            amount: order.total_amount,
            status: order.order_status,
            time: new Date(order.ordered_at).toLocaleTimeString('en-US', {
              hour: 'numeric', minute: '2-digit', hour12: true
            }),
            orderNumber: order.order_number
          };
        }
      })
    );

    return { data: enriched, error: null };
  } catch (error) {
    console.error('Error fetching recent orders:', error);
    return { data: [], error: error.message };
  }
}

/**
 * Get recent queue entries — queue-only stores only.
 * Reads customer_name directly from the queue table (no join needed).
 */
export async function getRecentQueueEntries(storeId, limit = 5) {
  try {
    if (!storeId) throw new Error('Store ID required');

    const { data: entries, error } = await supabase
      .from('queue')
      .select('id, token_number, customer_name, status, issued_at, wait_time_minutes, actual_service_duration')
      .eq('store_id', storeId)
      .order('issued_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    const formatted = (entries || []).map(entry => ({
      id: entry.id,
      tokenNumber: entry.token_number,
      customer: entry.customer_name || 'Walk-in Customer',
      status: entry.status,
      time: new Date(entry.issued_at).toLocaleTimeString('en-US', {
        hour: 'numeric', minute: '2-digit', hour12: true
      }),
      waitTime: entry.wait_time_minutes || 0,
      actualDuration: entry.actual_service_duration || null
    }));

    return { data: formatted, error: null };
  } catch (error) {
    console.error('Error fetching recent queue entries:', error);
    return { data: [], error: error.message };
  }
}

/**
 * Get today's stats.
 * Queue-only → counts queue entries as "customers".
 * Product stores → counts orders + revenue.
 */
export async function getTodayStats(storeId, isQueueOnly = false) {
  try {
    if (!storeId) throw new Error('Store ID required');

    const today = new Date();
    const startOfDay      = new Date(today.setHours(0, 0, 0, 0)).toISOString();
    const endOfDay        = new Date(today.setHours(23, 59, 59, 999)).toISOString();
    const yesterday       = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const startOfYesterday = new Date(yesterday.setHours(0, 0, 0, 0)).toISOString();
    const endOfYesterday   = new Date(yesterday.setHours(23, 59, 59, 999)).toISOString();

    if (isQueueOnly) {
      const { data: todayQueue }     = await supabase.from('queue').select('id, status').eq('store_id', storeId).gte('issued_at', startOfDay).lte('issued_at', endOfDay);
      const { data: yesterdayQueue } = await supabase.from('queue').select('id, status').eq('store_id', storeId).gte('issued_at', startOfYesterday).lte('issued_at', endOfYesterday);

      const todayCount     = todayQueue?.length || 0;
      const yesterdayCount = yesterdayQueue?.length || 0;
      const customerChange = yesterdayCount > 0
        ? Math.round(((todayCount - yesterdayCount) / yesterdayCount) * 100) : 0;

      const completedToday = todayQueue?.filter(
        q => q.status === 'completed' || q.status === 'served'
      ).length || 0;
      const completionRate = todayCount > 0
        ? Math.round((completedToday / todayCount) * 100) : 0;

      const yesterdayCompleted = yesterdayQueue?.filter(
        q => q.status === 'completed' || q.status === 'served'
      ).length || 0;
      const yesterdayRate = yesterdayCount > 0
        ? Math.round((yesterdayCompleted / yesterdayCount) * 100) : 0;

      return {
        data: {
          today_customers: todayCount,
          customer_change: customerChange,
          today_orders: todayCount,   // kept for compat, not displayed
          order_change: customerChange,
          today_revenue: 0,
          revenue_change: 0,
          completion_rate: completionRate,
          completion_change: completionRate - yesterdayRate
        },
        error: null
      };
    } else {
      const { data: todayOrders }     = await supabase.from('orders').select('id, total_amount, payment_status').eq('store_id', storeId).gte('ordered_at', startOfDay).lte('ordered_at', endOfDay);
      const { data: yesterdayOrders } = await supabase.from('orders').select('id, total_amount, payment_status').eq('store_id', storeId).gte('ordered_at', startOfYesterday).lte('ordered_at', endOfYesterday);
      const { data: todayQueue }      = await supabase.from('queue').select('id, status').eq('store_id', storeId).gte('issued_at', startOfDay).lte('issued_at', endOfDay);
      const { data: yesterdayQueue }  = await supabase.from('queue').select('id, status').eq('store_id', storeId).gte('issued_at', startOfYesterday).lte('issued_at', endOfYesterday);

      const todayCount     = todayOrders?.length || 0;
      const yesterdayCount = yesterdayOrders?.length || 0;
      const orderChange    = yesterdayCount > 0
        ? Math.round(((todayCount - yesterdayCount) / yesterdayCount) * 100) : 0;

      const todayRevenue     = todayOrders?.reduce((s, o) => o.payment_status === 'paid' ? s + (parseFloat(o.total_amount) || 0) : s, 0) || 0;
      const yesterdayRevenue = yesterdayOrders?.reduce((s, o) => o.payment_status === 'paid' ? s + (parseFloat(o.total_amount) || 0) : s, 0) || 0;
      const revenueChange    = yesterdayRevenue > 0
        ? Math.round(((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100) : 0;

      const completedToday     = todayQueue?.filter(q => q.status === 'completed').length || 0;
      const completionRate     = todayQueue?.length > 0 ? Math.round((completedToday / todayQueue.length) * 100) : 0;
      const yesterdayCompleted = yesterdayQueue?.filter(q => q.status === 'completed').length || 0;
      const yesterdayRate      = yesterdayQueue?.length > 0 ? Math.round((yesterdayCompleted / yesterdayQueue.length) * 100) : 0;

      return {
        data: {
          today_orders: todayCount,
          order_change: orderChange,
          today_revenue: todayRevenue,
          revenue_change: revenueChange,
          today_customers: todayCount,
          customer_change: orderChange,
          completion_rate: completionRate,
          completion_change: completionRate - yesterdayRate
        },
        error: null
      };
    }
  } catch (error) {
    console.error('Error fetching today stats:', error);
    return {
      data: {
        today_orders: 0, order_change: 0, today_revenue: 0, revenue_change: 0,
        today_customers: 0, customer_change: 0, completion_rate: 0, completion_change: 0
      },
      error: error.message
    };
  }
}

/**
 * Get live queue statistics — works for all store types.
 */
export async function getQueueStats(storeId) {
  try {
    if (!storeId) throw new Error('Store ID required');

    const today      = new Date();
    const startOfDay = new Date(today.setHours(0, 0, 0, 0)).toISOString();
    const endOfDay   = new Date(today.setHours(23, 59, 59, 999)).toISOString();

    const { data: activeQueue } = await supabase
      .from('queue').select('id')
      .eq('store_id', storeId)
      .in('status', ['waiting', 'called', 'in_service', 'ready']);

    const { data: servedToday } = await supabase
      .from('queue').select('id')
      .eq('store_id', storeId)
      .eq('status', 'completed')
      .gte('service_completed_at', startOfDay)
      .lte('service_completed_at', endOfDay);

    return {
      data: { total_in_queue: activeQueue?.length || 0, served_today: servedToday?.length || 0 },
      error: null
    };
  } catch (error) {
    console.error('Error fetching queue stats:', error);
    return { data: { total_in_queue: 0, served_today: 0 }, error: error.message };
  }
}

/**
 * Subscribe to real-time dashboard updates. Returns cleanup function.
 */
export function subscribeToDashboardUpdates(storeId, callbacks) {
  const channels = [];

  if (callbacks.onOrderUpdate) {
    const ch = supabase.channel('dashboard-orders')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `store_id=eq.${storeId}` },
        (payload) => { console.log('Dashboard: Order update', payload); callbacks.onOrderUpdate(payload); }
      ).subscribe();
    channels.push(ch);
  }

  if (callbacks.onQueueUpdate) {
    const ch = supabase.channel('dashboard-queue')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'queue', filter: `store_id=eq.${storeId}` },
        (payload) => { console.log('Dashboard: Queue update', payload); callbacks.onQueueUpdate(payload); }
      ).subscribe();
    channels.push(ch);
  }

  return () => channels.forEach(ch => supabase.removeChannel(ch));
}