// lib/api/payments.js - ACTUAL FIX based on your SQL results
import { supabase } from '../supabase/client';

/**
 * Get seller's store ID
 */
async function getSellerStoreId() {
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    throw new Error('Not authenticated');
  }

  const { data: store, error } = await supabase
    .from('stores')
    .select('id, business_id')
    .eq('owner_id', user.id)
    .single();

  if (error || !store) {
    throw new Error('Store not found');
  }

  return store;
}

/**
 * REAL FIX - Fetch transactions with customer names
 * Problem: Profiles exist but full_name is NULL or empty
 * Solution: Fall back to getting customer info from orders or queue tables
 */
export async function fetchTransactions({ period = 'today', limit = 100 } = {}) {
  try {
    const store = await getSellerStoreId();
    
    // Calculate date range
    const now = new Date();
    let startDate;

    switch (period) {
      case 'today':
        startDate = new Date(now.setHours(0, 0, 0, 0));
        break;
      case 'week':
        startDate = new Date(now.setDate(now.getDate() - 7));
        break;
      case 'month':
        startDate = new Date(now.setMonth(now.getMonth() - 1));
        break;
      default:
        startDate = new Date(now.setHours(0, 0, 0, 0));
    }

    // Fetch transactions with ALL related data including queue for customer name
    const { data: transactions, error: txnError } = await supabase
      .from('transactions')
      .select(`
        *,
        profiles!transactions_customer_id_fkey(
          id,
          full_name,
          phone
        ),
        orders!transactions_order_id_fkey(
          id,
          order_number,
          customer_id,
          queue:queue(
            customer_name,
            customer_phone
          )
        )
      `)
      .eq('store_id', store.id)
      .gte('initiated_at', startDate.toISOString())
      .order('initiated_at', { ascending: false })
      .limit(limit);

    if (txnError) {
      console.error('Transaction fetch error:', txnError);
      // Fallback to manual fetching
      return await fetchTransactionsManually(store.id, startDate, limit);
    }

    if (!transactions || transactions.length === 0) {
      return { data: [], error: null };
    }

    // Enrich transactions with customer names from multiple sources
    const enrichedTransactions = transactions.map(txn => {
      let customerName = 'Unknown Customer';
      
      // Priority 1: Get from profiles.full_name
      if (txn.profiles?.full_name) {
        customerName = txn.profiles.full_name;
      }
      // Priority 2: Get from queue.customer_name via orders
      else if (txn.orders?.queue?.customer_name) {
        customerName = txn.orders.queue.customer_name;
      }
      // Priority 3: Get from queue array (if it's an array)
      else if (Array.isArray(txn.orders?.queue) && txn.orders.queue[0]?.customer_name) {
        customerName = txn.orders.queue[0].customer_name;
      }
      // Priority 4: Use phone number if available
      else if (txn.profiles?.phone) {
        customerName = `Customer ${txn.profiles.phone.slice(-4)}`;
      }
      else if (txn.orders?.queue?.customer_phone) {
        customerName = `Customer ${txn.orders.queue.customer_phone.slice(-4)}`;
      }

      // Get order number
      let orderNumber = 'N/A';
      if (txn.orders?.order_number) {
        orderNumber = txn.orders.order_number;
      }

      return {
        ...txn,
        customer: customerName,
        orderId: orderNumber,
        // Clean up nested objects
        profiles: undefined,
        orders: undefined
      };
    });

    return { data: enrichedTransactions, error: null };
  } catch (error) {
    console.error('Error fetching transactions:', error);
    return { data: [], error: error.message };
  }
}

/**
 * Manual fetch fallback with multiple data sources for customer names
 */
async function fetchTransactionsManually(storeId, startDate, limit) {
  try {
    console.log('Using manual fetch fallback...');

    // Step 1: Fetch transactions
    const { data: transactions, error: txnError } = await supabase
      .from('transactions')
      .select('*')
      .eq('store_id', storeId)
      .gte('initiated_at', startDate.toISOString())
      .order('initiated_at', { ascending: false })
      .limit(limit);

    if (txnError) throw txnError;
    if (!transactions || transactions.length === 0) {
      return { data: [], error: null };
    }

    // Step 2: Get all unique IDs
    const customerIds = [...new Set(transactions.map(t => t.customer_id).filter(Boolean))];
    const orderIds = [...new Set(transactions.map(t => t.order_id).filter(Boolean))];

    // Step 3: Fetch all related data in parallel
    const [
      { data: profiles },
      { data: orders },
      { data: queueEntries }
    ] = await Promise.all([
      // Fetch profiles
      supabase
        .from('profiles')
        .select('id, full_name, phone')
        .in('id', customerIds),
      
      // Fetch orders
      supabase
        .from('orders')
        .select('id, order_number, customer_id')
        .in('id', orderIds),
      
      // Fetch queue entries for customer names
      supabase
        .from('queue')
        .select('id, customer_name, customer_phone, customer_id')
        .in('customer_id', customerIds)
    ]);

    // Step 4: Create lookup maps
    const profileMap = new Map((profiles || []).map(p => [p.id, p]));
    const orderMap = new Map((orders || []).map(o => [o.id, o]));
    
    // Create customer name map from queue
    const queueNameMap = new Map();
    (queueEntries || []).forEach(q => {
      if (q.customer_name && !queueNameMap.has(q.customer_id)) {
        queueNameMap.set(q.customer_id, q.customer_name);
      }
    });

    // Step 5: Enrich transactions with customer names
    const enrichedTransactions = transactions.map(txn => {
      const profile = profileMap.get(txn.customer_id);
      const order = orderMap.get(txn.order_id);
      const queueName = queueNameMap.get(txn.customer_id);

      // Try multiple sources for customer name
      let customerName = 'Unknown Customer';
      
      if (profile?.full_name) {
        customerName = profile.full_name;
      } else if (queueName) {
        customerName = queueName;
      } else if (profile?.phone) {
        customerName = `Customer ${profile.phone.slice(-4)}`;
      } else {
        // Last resort: use customer ID last 4 chars
        customerName = `Customer ${txn.customer_id.slice(-4)}`;
      }

      return {
        ...txn,
        customer: customerName,
        orderId: order?.order_number || 'N/A'
      };
    });

    return { data: enrichedTransactions, error: null };
  } catch (error) {
    console.error('Error in manual fetch:', error);
    return { data: [], error: error.message };
  }
}

/**
 * Fetch payouts for seller
 */
export async function fetchPayouts({ limit = 50 } = {}) {
  try {
    const store = await getSellerStoreId();

    const { data, error } = await supabase
      .from('payouts')
      .select('*')
      .eq('business_id', store.business_id)
      .order('requested_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    return { data: data || [], error: null };
  } catch (error) {
    console.error('Error fetching payouts:', error);
    return { data: [], error: error.message };
  }
}

/**
 * Get payment settings for store
 */
export async function getPaymentSettings() {
  try {
    const store = await getSellerStoreId();

    const { data, error } = await supabase
      .from('payment_settings')
      .select('*')
      .eq('store_id', store.id)
      .single();

    if (error && error.code !== 'PGRST116') throw error;

    return { data: data || null, error: null };
  } catch (error) {
    console.error('Error fetching payment settings:', error);
    return { data: null, error: error.message };
  }
}

/**
 * Calculate financial summary
 */
export async function calculateFinancialSummary(period = 'today') {
  try {
    const store = await getSellerStoreId();

    // Get date range
    const now = new Date();
    let startDate;

    switch (period) {
      case 'today':
        startDate = new Date(now.setHours(0, 0, 0, 0));
        break;
      case 'week':
        startDate = new Date(now.setDate(now.getDate() - 7));
        break;
      case 'month':
        startDate = new Date(now.setMonth(now.getMonth() - 1));
        break;
    }

    // Fetch completed transactions
    const { data: transactions, error: txnError } = await supabase
      .from('transactions')
      .select('amount, status, completed_at')
      .eq('store_id', store.id)
      .eq('status', 'completed')
      .gte('completed_at', startDate.toISOString());

    if (txnError) throw txnError;

    // Fetch payouts
    const { data: payouts, error: payoutError } = await supabase
      .from('payouts')
      .select('amount, status')
      .eq('business_id', store.business_id);

    if (payoutError) throw payoutError;

    // Calculate totals
    const totalRevenue = (transactions || []).reduce((sum, t) => sum + parseFloat(t.amount), 0);
    const totalTransactions = transactions?.length || 0;
    const avgTransactionValue = totalTransactions > 0 ? totalRevenue / totalTransactions : 0;

    const pendingPayouts = (payouts || [])
      .filter(p => p.status === 'pending' || p.status === 'processing')
      .reduce((sum, p) => sum + parseFloat(p.amount), 0);

    const completedPayouts = (payouts || [])
      .filter(p => p.status === 'completed')
      .reduce((sum, p) => sum + parseFloat(p.amount), 0);

    const processingPayouts = (payouts || [])
      .filter(p => p.status === 'processing')
      .reduce((sum, p) => sum + parseFloat(p.amount), 0);

    return {
      data: {
        totalRevenue: Math.round(totalRevenue),
        totalTransactions,
        avgTransactionValue: Math.round(avgTransactionValue),
        pendingPayouts: Math.round(pendingPayouts),
        completedPayouts: Math.round(completedPayouts),
        processingPayouts: Math.round(processingPayouts)
      },
      error: null
    };
  } catch (error) {
    console.error('Error calculating summary:', error);
    return {
      data: {
        totalRevenue: 0,
        totalTransactions: 0,
        avgTransactionValue: 0,
        pendingPayouts: 0,
        completedPayouts: 0,
        processingPayouts: 0
      },
      error: error.message
    };
  }
}

/**
 * Get payment method distribution
 */
export async function getPaymentMethodStats(period = 'month') {
  try {
    const store = await getSellerStoreId();

    const now = new Date();
    let startDate;

    switch (period) {
      case 'today':
        startDate = new Date(now.setHours(0, 0, 0, 0));
        break;
      case 'week':
        startDate = new Date(now.setDate(now.getDate() - 7));
        break;
      case 'month':
        startDate = new Date(now.setMonth(now.getMonth() - 1));
        break;
    }

    const { data: transactions, error } = await supabase
      .from('transactions')
      .select('payment_method, amount')
      .eq('store_id', store.id)
      .eq('status', 'completed')
      .gte('completed_at', startDate.toISOString());

    if (error) throw error;

    // Group by payment method
    const methodStats = {};
    let totalAmount = 0;

    (transactions || []).forEach(txn => {
      const method = txn.payment_method || 'OTHER';
      if (!methodStats[method]) {
        methodStats[method] = { count: 0, amount: 0 };
      }
      methodStats[method].count++;
      methodStats[method].amount += parseFloat(txn.amount);
      totalAmount += parseFloat(txn.amount);
    });

    // Convert to array with percentages
    const methodArray = Object.entries(methodStats).map(([method, stats]) => ({
      method: method,
      amount: Math.round(stats.amount),
      count: stats.count,
      percentage: totalAmount > 0 ? Math.round((stats.amount / totalAmount) * 100) : 0
    }));

    return { data: methodArray, error: null };
  } catch (error) {
    console.error('Error getting payment method stats:', error);
    return { data: [], error: error.message };
  }
}

/**
 * Get daily revenue for chart (last 7 days)
 */
export async function getDailyRevenue() {
  try {
    const store = await getSellerStoreId();

    const now = new Date();
    const sevenDaysAgo = new Date(now.setDate(now.getDate() - 7));

    const { data: transactions, error } = await supabase
      .from('transactions')
      .select('amount, completed_at')
      .eq('store_id', store.id)
      .eq('status', 'completed')
      .gte('completed_at', sevenDaysAgo.toISOString());

    if (error) throw error;

    // Group by day
    const dailyData = {};
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    (transactions || []).forEach(txn => {
      const date = new Date(txn.completed_at);
      const dayName = days[date.getDay()];
      
      if (!dailyData[dayName]) {
        dailyData[dayName] = 0;
      }
      dailyData[dayName] += parseFloat(txn.amount);
    });

    // Convert to array
    const chartData = days.map(day => ({
      day,
      revenue: Math.round(dailyData[day] || 0)
    }));

    return { data: chartData, error: null };
  } catch (error) {
    console.error('Error getting daily revenue:', error);
    return { data: [], error: error.message };
  }
}

/**
 * Request a new payout
 */
export async function requestPayout(amount) {
  try {
    const store = await getSellerStoreId();

    // Get payment settings
    const { data: paymentSettings } = await getPaymentSettings();

    if (!paymentSettings) {
      throw new Error('Payment settings not configured');
    }

    const payoutId = `PAYOUT-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const { data, error } = await supabase
      .from('payouts')
      .insert({
        payout_id: payoutId,
        store_id: store.id,
        business_id: store.business_id,
        amount: parseFloat(amount),
        currency: 'INR',
        status: 'pending',
        bank_account_number: paymentSettings.bank_account_number,
        bank_ifsc_code: paymentSettings.bank_ifsc_code,
        bank_name: paymentSettings.bank_name,
        account_holder_name: paymentSettings.bank_account_holder,
        requested_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    return { data, error: null };
  } catch (error) {
    console.error('Error requesting payout:', error);
    return { data: null, error: error.message };
  }
}