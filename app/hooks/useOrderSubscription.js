// app/hooks/useOrderSubscription.js 
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import toast from 'react-hot-toast';

/**
 * Custom hook for real-time order and queue updates
 * @param {string} orderId - The order ID to subscribe to
 * @param {string} queueId - The queue ID to subscribe to
 * @returns {Object} - { order, queue, loading, error }
 */
export function useOrderSubscription(orderId, queueId) {
  const [order, setOrder] = useState(null);
  const [queue, setQueue] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Initial load
  useEffect(() => {
    if (!orderId || !queueId) return;

    loadInitialData();
  }, [orderId, queueId]);

  // Real-time subscriptions
  useEffect(() => {
    if (!orderId || !queueId) return;

    const channels = [];

    // Subscribe to order updates
    const orderChannel = supabase
      .channel(`order-${orderId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `id=eq.${orderId}`
        },
        (payload) => {
          console.log('Order updated:', payload.new);
          setOrder(payload.new);

          // Show toast notifications
          const newStatus = payload.new.order_status;
          const oldStatus = payload.old?.order_status;

          if (newStatus !== oldStatus) {
            switch (newStatus) {
              case 'preparing':
                toast.success('🎉 Order Accepted! Being prepared...');
                break;
              case 'ready':
                toast.success('✅ Your order is ready for pickup!', { duration: 5000 });
                playNotificationSound();
                break;
              case 'completed':
                toast.success('Thank you! Order completed.');
                break;
              case 'cancelled':
                toast.error('Order was cancelled. Refund will be processed.');
                break;
            }
          }
        }
      )
      .subscribe();

    channels.push(orderChannel);

    // Subscribe to queue updates
    const queueChannel = supabase
      .channel(`queue-${queueId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'queue',
          filter: `id=eq.${queueId}`
        },
        (payload) => {
          console.log('Queue updated:', payload.new);
          setQueue(payload.new);

          // Show toast for wait time updates
          const newWaitTime = payload.new.wait_time_minutes;
          const oldWaitTime = payload.old?.wait_time_minutes;

          if (newWaitTime !== oldWaitTime && newWaitTime) {
            toast.success(`⏱️ Updated wait time: ${newWaitTime} minutes`);
          }

          // Show toast for status changes
          const newStatus = payload.new.status;
          const oldStatus = payload.old?.status;

          if (newStatus !== oldStatus) {
            switch (newStatus) {
              case 'in_service':
                toast.success('🎉 Your order is being prepared!');
                break;
              case 'ready':
                toast.success('✅ Your order is ready for pickup!', { duration: 5000 });
                playNotificationSound();
                break;
            }
          }
        }
      )
      .subscribe();

    channels.push(queueChannel);

    return () => {
      channels.forEach(channel => supabase.removeChannel(channel));
    };
  }, [orderId, queueId]);

  const loadInitialData = async () => {
    try {
      setLoading(true);

      // Fetch order
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .select(`
          *,
          stores (
            store_name,
            address,
            city,
            phone,
            logo_url
          ),
          queue (
            *
          )
        `)
        .eq('id', orderId)
        .single();

      if (orderError) throw orderError;

      setOrder(orderData);

      // Fetch queue
      const { data: queueData, error: queueError } = await supabase
        .from('queue')
        .select('*')
        .eq('id', queueId)
        .single();

      if (queueError) throw queueError;

      setQueue(queueData);

    } catch (err) {
      console.error('Error loading data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const playNotificationSound = () => {
    try {
      const audio = new Audio('/notification.mp3');
      audio.play().catch(err => console.log('Audio play failed:', err));
    } catch (e) {
      console.log('Notification sound unavailable');
    }
  };

  return { order, queue, loading, error, reload: loadInitialData };
}

/**
 * Custom hook for seller to monitor all orders in real-time
 * @param {string} storeId - The store ID
 * @returns {Object} - { orders, loading, error, reload }
 */
export function useStoreOrdersSubscription(storeId) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Initial load
  useEffect(() => {
    if (!storeId) return;
    loadOrders();
  }, [storeId]);

  // Real-time subscription
  useEffect(() => {
    if (!storeId) return;

    const channel = supabase
      .channel('store-orders')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `store_id=eq.${storeId}`
        },
        (payload) => {
          console.log('Store order update:', payload);

          if (payload.eventType === 'INSERT') {
            toast.success(`New Order! #${payload.new.order_number}`, {
              duration: 6000,
              icon: '🎉',
            });
          }

          // Reload all orders
          loadOrders();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [storeId]);

  const loadOrders = async () => {
    try {
      setLoading(true);

      const { data, error: fetchError } = await supabase
        .from('orders')
        .select(`
          *,
          queue (
            token_number,
            status,
            wait_time_minutes,
            estimated_time
          )
        `)
        .eq('store_id', storeId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (fetchError) throw fetchError;

      // Enrich with customer data
      if (data && data.length > 0) {
        const enrichedOrders = await Promise.all(
          data.map(async (order) => {
            try {
              const { data: profile } = await supabase
                .from('profiles')
                .select('full_name, phone')
                .eq('id', order.customer_id)
                .single();

              return { ...order, profiles: profile || null };
            } catch (err) {
              return { ...order, profiles: null };
            }
          })
        );

        setOrders(enrichedOrders);
      } else {
        setOrders(data || []);
      }

    } catch (err) {
      console.error('Error loading orders:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return { orders, loading, error, reload: loadOrders };
}