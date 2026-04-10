// lib/api/analytics.js
// Queue-aware analytics for both product-based and queue-only stores.
import { supabase } from '../supabase/client';

// ─────────────────────────────────────────────────────────────────────────────
// SHARED HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function getPeriodDates(period) {
  const now = new Date();
  const current  = new Date(now);
  const previous = new Date(now);

  if (period === 'today') {
    current.setHours(0, 0, 0, 0);
    previous.setDate(previous.getDate() - 1);
    previous.setHours(0, 0, 0, 0);
  } else if (period === 'week') {
    current.setDate(current.getDate() - 7);
    previous.setDate(previous.getDate() - 14);
  } else if (period === 'month') {
    current.setMonth(current.getMonth() - 1);
    previous.setMonth(previous.getMonth() - 2);
  } else if (period === 'year') {
    current.setFullYear(current.getFullYear() - 1);
    previous.setFullYear(previous.getFullYear() - 2);
  }

  return { currentStart: current, previousStart: previous, now };
}

function safeLog(label, error) {
  if (!error) return;
  const msg = error instanceof Error
    ? error.message
    : (typeof error === 'object' ? JSON.stringify(error) : String(error));
  console.warn(`[analytics] ${label}:`, msg);
}

// ─────────────────────────────────────────────────────────────────────────────
// STORE VISITS / WEBSITE TRAFFIC
// ─────────────────────────────────────────────────────────────────────────────

export async function getStoreVisits(storeId, period = 'week') {
  try {
    if (!storeId) return { success: false, data: { totalVisits: 0, visitGrowth: 0 } };
    const { currentStart, previousStart } = getPeriodDates(period);

    const [currentRes, previousRes] = await Promise.all([
      supabase.from('store_visits').select('*', { count: 'exact', head: true }).eq('store_id', storeId).gte('visited_at', currentStart.toISOString()),
      supabase.from('store_visits').select('*', { count: 'exact', head: true }).eq('store_id', storeId).gte('visited_at', previousStart.toISOString()).lt('visited_at', currentStart.toISOString()),
    ]);

    if (currentRes.error) { safeLog('getStoreVisits/current', currentRes.error); return { success: true, data: { totalVisits: 0, visitGrowth: 0 } }; }

    const totalVisits = currentRes.count ?? 0;
    const prevVisits  = previousRes.count ?? 0;
    const visitGrowth = prevVisits > 0 ? Math.round(((totalVisits - prevVisits) / prevVisits) * 100) : 0;

    return { success: true, data: { totalVisits, visitGrowth } };
  } catch (error) {
    safeLog('getStoreVisits', error);
    return { success: false, data: { totalVisits: 0, visitGrowth: 0 } };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TRAFFIC OVER TIME
// ─────────────────────────────────────────────────────────────────────────────

export async function getTrafficOverTime(storeId, period = 'week') {
  try {
    if (!storeId) return { success: false, data: [] };
    const { currentStart } = getPeriodDates(period);

    const { data, error } = await supabase
      .from('store_visits')
      .select('visited_at, buyer_id')
      .eq('store_id', storeId)
      .gte('visited_at', currentStart.toISOString())
      .order('visited_at', { ascending: true });

    if (error) { safeLog('getTrafficOverTime', error); return { success: true, data: [] }; }

    const byDay = {};
    (data || []).forEach(v => {
      const dateKey = new Date(v.visited_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
      if (!byDay[dateKey]) byDay[dateKey] = { date: dateKey, visits: 0, uniqueVisitors: new Set() };
      byDay[dateKey].visits += 1;
      if (v.buyer_id) byDay[dateKey].uniqueVisitors.add(v.buyer_id);
    });

    const result = Object.values(byDay).map(d => ({
      date: d.date,
      visits: d.visits,
      uniqueVisitors: d.uniqueVisitors.size,
    }));

    return { success: true, data: result };
  } catch (error) {
    safeLog('getTrafficOverTime', error);
    return { success: false, data: [] };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CONVERSION RATE
// ─────────────────────────────────────────────────────────────────────────────

export async function getConversionRate(storeId, period = 'week', isQueueOnly = false) {
  try {
    if (!storeId) return { success: false, data: { conversionRate: 0, conversionGrowth: 0, totalVisits: 0, conversions: 0, funnelData: [] } };
    const { currentStart, previousStart } = getPeriodDates(period);

    const [visitsRes, prevVisitsRes] = await Promise.all([
      supabase.from('store_visits').select('*', { count: 'exact', head: true }).eq('store_id', storeId).gte('visited_at', currentStart.toISOString()),
      supabase.from('store_visits').select('*', { count: 'exact', head: true }).eq('store_id', storeId).gte('visited_at', previousStart.toISOString()).lt('visited_at', currentStart.toISOString()),
    ]);

    const totalVisits = visitsRes.count ?? 0;
    const prevVisits  = prevVisitsRes.count ?? 0;

    let conversions = 0, prevConversions = 0;

    if (isQueueOnly) {
      const [curQ, prevQ] = await Promise.all([
        supabase.from('queue').select('*', { count: 'exact', head: true }).eq('store_id', storeId).gte('issued_at', currentStart.toISOString()),
        supabase.from('queue').select('*', { count: 'exact', head: true }).eq('store_id', storeId).gte('issued_at', previousStart.toISOString()).lt('issued_at', currentStart.toISOString()),
      ]);
      conversions     = curQ.count  ?? 0;
      prevConversions = prevQ.count ?? 0;
    } else {
      const [curO, prevO] = await Promise.all([
        supabase.from('orders').select('*', { count: 'exact', head: true }).eq('store_id', storeId).gte('created_at', currentStart.toISOString()),
        supabase.from('orders').select('*', { count: 'exact', head: true }).eq('store_id', storeId).gte('created_at', previousStart.toISOString()).lt('created_at', currentStart.toISOString()),
      ]);
      conversions     = curO.count  ?? 0;
      prevConversions = prevO.count ?? 0;
    }

    const conversionRate     = totalVisits > 0 ? parseFloat(((conversions / totalVisits) * 100).toFixed(1)) : 0;
    const prevConversionRate = prevVisits  > 0 ? parseFloat(((prevConversions / prevVisits) * 100).toFixed(1)) : 0;
    const conversionGrowth   = prevConversionRate > 0 ? Math.round(((conversionRate - prevConversionRate) / prevConversionRate) * 100) : 0;

    const { data: visitsByDay } = await supabase.from('store_visits').select('visited_at').eq('store_id', storeId).gte('visited_at', currentStart.toISOString()).order('visited_at', { ascending: true });
    const table     = isQueueOnly ? 'queue' : 'orders';
    const dateField = isQueueOnly ? 'issued_at' : 'created_at';
    const { data: convByDay } = await supabase.from(table).select(dateField).eq('store_id', storeId).gte(dateField, currentStart.toISOString()).order(dateField, { ascending: true });

    const visitMap = {}, convMap = {};
    (visitsByDay || []).forEach(v => {
      const k = new Date(v.visited_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
      visitMap[k] = (visitMap[k] || 0) + 1;
    });
    (convByDay || []).forEach(c => {
      const k = new Date(c[dateField]).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
      convMap[k] = (convMap[k] || 0) + 1;
    });

    const allDates   = [...new Set([...Object.keys(visitMap), ...Object.keys(convMap)])];
    const funnelData = allDates.map(date => ({
      date,
      visits:      visitMap[date] || 0,
      conversions: convMap[date]  || 0,
      rate: visitMap[date] > 0 ? parseFloat(((convMap[date] || 0) / visitMap[date] * 100).toFixed(1)) : 0,
    }));

    return {
      success: true,
      data: { conversionRate, prevConversionRate, conversionGrowth, totalVisits, conversions, funnelData }
    };
  } catch (error) {
    safeLog('getConversionRate', error);
    return { success: false, data: { conversionRate: 0, conversionGrowth: 0, totalVisits: 0, conversions: 0, funnelData: [] } };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SALES TREND OVER TIME
// ─────────────────────────────────────────────────────────────────────────────

export async function getSalesTrend(storeId, period = 'week') {
  try {
    if (!storeId) return { success: false, data: [] };
    const { currentStart } = getPeriodDates(period);

    const { data, error } = await supabase
      .from('orders')
      .select('created_at, total_amount, items')
      .eq('store_id', storeId)
      .gte('created_at', currentStart.toISOString())
      .order('created_at', { ascending: true });

    if (error) { safeLog('getSalesTrend', error); return { success: true, data: [] }; }

    const byDay = {};
    (data || []).forEach(order => {
      const dateKey = new Date(order.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
      if (!byDay[dateKey]) byDay[dateKey] = { date: dateKey, revenue: 0, orders: 0, itemsSold: 0 };
      byDay[dateKey].revenue   += parseFloat(order.total_amount) || 0;
      byDay[dateKey].orders    += 1;
      byDay[dateKey].itemsSold += (order.items || []).reduce((s, i) => s + (i.quantity || 1), 0);
    });

    const result = Object.values(byDay).map(d => ({
      ...d,
      revenue:       Math.round(d.revenue),
      avgOrderValue: d.orders > 0 ? Math.round(d.revenue / d.orders) : 0,
    }));

    return { success: true, data: result };
  } catch (error) {
    safeLog('getSalesTrend', error);
    return { success: false, data: [] };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CUSTOMER DEMOGRAPHICS  ← FIXED
// ─────────────────────────────────────────────────────────────────────────────

export async function getCustomerDemographics(storeId, period = 'week') {
  const EMPTY = {
    newCustomers: 0,
    returningCustomers: 0,
    avgSpendPerCustomer: 0,
    spendDistribution: [],
    scatterData: [],
    retentionRate: 0,
  };

  try {
    if (!storeId) return { success: false, data: EMPTY };

    const { currentStart } = getPeriodDates(period);

    // Current period orders
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('buyer_id, created_at, total_amount')
      .eq('store_id', storeId)
      .gte('created_at', currentStart.toISOString());

    if (ordersError) {
      safeLog('getCustomerDemographics/orders', ordersError);
      return { success: true, data: EMPTY };
    }

    // Historical orders before current period
    const { data: allOrders, error: allError } = await supabase
      .from('orders')
      .select('buyer_id, created_at')
      .eq('store_id', storeId)
      .lt('created_at', currentStart.toISOString());

    if (allError) {
      safeLog('getCustomerDemographics/allOrders', allError);
    }

    const returningBuyers = new Set(
      (allOrders ?? []).map(o => o.buyer_id).filter(Boolean)
    );

    let newCustomers = 0;
    let returningCustomers = 0;
    const customerSpend = {};

    for (const o of (orders ?? [])) {
      if (!o.buyer_id) continue;
      if (returningBuyers.has(o.buyer_id)) returningCustomers++;
      else newCustomers++;
      customerSpend[o.buyer_id] = (customerSpend[o.buyer_id] ?? 0) + (parseFloat(o.total_amount) || 0);
    }

    const spendValues = Object.values(customerSpend);
    const avgSpendPerCustomer =
      spendValues.length > 0
        ? Math.round(spendValues.reduce((a, b) => a + b, 0) / spendValues.length)
        : 0;

    const spendBuckets = { '₹0–500': 0, '₹500–1k': 0, '₹1k–2k': 0, '₹2k–5k': 0, '₹5k+': 0 };
    for (const v of spendValues) {
      if (v < 500)       spendBuckets['₹0–500']++;
      else if (v < 1000) spendBuckets['₹500–1k']++;
      else if (v < 2000) spendBuckets['₹1k–2k']++;
      else if (v < 5000) spendBuckets['₹2k–5k']++;
      else               spendBuckets['₹5k+']++;
    }

    const spendDistribution = Object.entries(spendBuckets).map(([range, count]) => ({ range, count }));

    const perCustomer = {};
    for (const o of (orders ?? [])) {
      if (!o.buyer_id) continue;
      if (!perCustomer[o.buyer_id]) perCustomer[o.buyer_id] = { orders: 0, spend: 0 };
      perCustomer[o.buyer_id].orders++;
      perCustomer[o.buyer_id].spend += parseFloat(o.total_amount) || 0;
    }

    const scatterData = Object.values(perCustomer).map(v => ({
      x: v.orders,
      y: Math.round(v.spend),
    }));

    const total = newCustomers + returningCustomers;
    const retentionRate = total > 0 ? Math.round((returningCustomers / total) * 100) : 0;

    return {
      success: true,
      data: { newCustomers, returningCustomers, avgSpendPerCustomer, spendDistribution, scatterData, retentionRate },
    };
  } catch (error) {
    safeLog('getCustomerDemographics', error);
    return { success: false, data: EMPTY };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PRODUCT PERFORMANCE
// ─────────────────────────────────────────────────────────────────────────────

export async function getProductPerformance(storeId, period = 'week') {
  try {
    if (!storeId) return { success: false, data: { products: [], categories: [], scatterData: [] } };
    const { currentStart } = getPeriodDates(period);

    const { data, error } = await supabase
      .from('orders')
      .select('items, created_at')
      .eq('store_id', storeId)
      .gte('created_at', currentStart.toISOString());

    if (error) { safeLog('getProductPerformance', error); return { success: true, data: { products: [], categories: [], scatterData: [] } }; }

    const productMap = {};
    (data || []).forEach(order => {
      (order.items || []).forEach(item => {
        const id       = item.productId || item.id || item.product_id || 'unknown';
        const name     = item.name || item.product_name || 'Unknown';
        const category = item.category || item.product_category || 'Other';
        const qty      = item.quantity || 1;
        const price    = parseFloat(item.price || item.product_price || 0);
        if (!productMap[id]) productMap[id] = { id, name, category, sold: 0, revenue: 0, orders: 0 };
        productMap[id].sold    += qty;
        productMap[id].revenue += qty * price;
        productMap[id].orders  += 1;
      });
    });

    const products     = Object.values(productMap).sort((a, b) => b.revenue - a.revenue);
    const totalRevenue = products.reduce((s, p) => s + p.revenue, 0) || 1;
    products.forEach(p => {
      p.revenueShare = Math.round((p.revenue / totalRevenue) * 100);
      p.revenue      = Math.round(p.revenue);
    });

    const catMap = {};
    products.forEach(p => {
      if (!catMap[p.category]) catMap[p.category] = { category: p.category, revenue: 0, sold: 0, count: 0 };
      catMap[p.category].revenue += p.revenue;
      catMap[p.category].sold    += p.sold;
      catMap[p.category].count   += 1;
    });

    const scatterData = products.map(p => ({
      name:     p.name.length > 14 ? p.name.slice(0, 14) + '…' : p.name,
      x:        p.sold > 0 ? Math.round(p.revenue / p.sold) : 0,
      y:        p.sold,
      revenue:  p.revenue,
      category: p.category,
    }));

    return {
      success: true,
      data: { products: products.slice(0, 10), categories: Object.values(catMap).sort((a, b) => b.revenue - a.revenue), scatterData }
    };
  } catch (error) {
    safeLog('getProductPerformance', error);
    return { success: false, data: { products: [], categories: [], scatterData: [] } };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DRILL DOWN HEATMAP
// ─────────────────────────────────────────────────────────────────────────────

export async function getDrillDownHeatmap(storeId, period = 'week', isQueueOnly = false) {
  try {
    if (!storeId) return { success: false, data: { heatmapData: [], days: [], hours: [], maxValue: 1 } };
    const { currentStart } = getPeriodDates(period);
    const days  = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const hours = Array.from({ length: 13 }, (_, i) => i + 9);

    const table     = isQueueOnly ? 'queue' : 'orders';
    const dateField = isQueueOnly ? 'issued_at' : 'created_at';

    const { data, error } = await supabase.from(table).select(dateField).eq('store_id', storeId).gte(dateField, currentStart.toISOString());
    if (error) { safeLog('getDrillDownHeatmap', error); return { success: true, data: { heatmapData: [], days, hours, maxValue: 1 } }; }

    const matrix = {};
    days.forEach(d => { matrix[d] = {}; hours.forEach(h => { matrix[d][h] = 0; }); });

    (data || []).forEach(row => {
      const dt  = new Date(row[dateField]);
      const day = days[dt.getDay()];
      const hr  = dt.getHours();
      if (matrix[day] && matrix[day][hr] !== undefined) matrix[day][hr]++;
    });

    const heatmapData = [];
    days.forEach(day => { hours.forEach(hour => { heatmapData.push({ day, hour, value: matrix[day][hour] }); }); });
    const maxValue = Math.max(...heatmapData.map(d => d.value), 1);

    return { success: true, data: { heatmapData, days, hours, maxValue } };
  } catch (error) {
    safeLog('getDrillDownHeatmap', error);
    return { success: false, data: { heatmapData: [], days: [], hours: [], maxValue: 1 } };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// INSIGHTS
// ─────────────────────────────────────────────────────────────────────────────

export function generateInsights({ stats, conversionData, demographics, productPerf }) {
  const insights = [];

  if (stats?.totalVisits > 0) {
    if (stats.visitGrowth > 20)
      insights.push({ type: 'positive', icon: '📈', title: 'Traffic Surge', body: `Store visits are up ${stats.visitGrowth}% vs last period — your visibility is growing.` });
    else if (stats.visitGrowth < -10)
      insights.push({ type: 'warning', icon: '📉', title: 'Traffic Drop', body: `Visits dropped ${Math.abs(stats.visitGrowth)}%. Consider promotions or updating store listings.` });
  }

  if (conversionData?.conversionRate !== undefined) {
    if (conversionData.conversionRate < 5 && stats?.totalVisits > 20)
      insights.push({ type: 'warning', icon: '🎯', title: 'Low Conversion', body: `Only ${conversionData.conversionRate}% of visitors convert. Review product pricing and availability.` });
    else if (conversionData.conversionRate > 20)
      insights.push({ type: 'positive', icon: '✅', title: 'Strong Conversion', body: `${conversionData.conversionRate}% conversion rate — your store is highly compelling to visitors.` });
  }

  if (stats?.revenueGrowth > 0)
    insights.push({ type: 'positive', icon: '💰', title: 'Revenue Growing', body: `Revenue is up ${stats.revenueGrowth}% this period. Strong momentum!` });
  else if (stats?.revenueGrowth < -15)
    insights.push({ type: 'warning', icon: '⚠️', title: 'Revenue Decline', body: `Revenue fell ${Math.abs(stats.revenueGrowth)}%. Investigate top product availability.` });

  if (demographics?.retentionRate > 40)
    insights.push({ type: 'positive', icon: '🔄', title: 'High Retention', body: `${demographics.retentionRate}% of buyers are returning customers — excellent loyalty!` });
  else if (demographics?.retentionRate < 15 && demographics?.newCustomers > 5)
    insights.push({ type: 'neutral', icon: '👥', title: 'Mostly New Visitors', body: 'Most buyers are first-time. Focus on post-purchase follow-up to build loyalty.' });

  if (productPerf?.products?.length > 0) {
    const top = productPerf.products[0];
    insights.push({ type: 'neutral', icon: '🏆', title: 'Top Performer', body: `"${top.name}" leads with ₹${top.revenue.toLocaleString()} revenue (${top.revenueShare}% of total).` });
  }

  if (stats?.avgServiceTime > 0) {
    if (stats.avgServiceTime <= 8)
      insights.push({ type: 'positive', icon: '⚡', title: 'Fast Service', body: `Average service time is just ${stats.avgServiceTime} min — customers appreciate the speed.` });
    else if (stats.avgServiceTime > 20)
      insights.push({ type: 'warning', icon: '🐌', title: 'Slow Service', body: `${stats.avgServiceTime} min avg service time may cause drop-offs. Consider optimizing workflow.` });
  }

  if (stats?.averageRating > 0) {
    if (parseFloat(stats.averageRating) >= 4.5)
      insights.push({ type: 'positive', icon: '⭐', title: 'Excellent Rating', body: `${stats.averageRating}/5 average rating shows outstanding customer satisfaction.` });
    else if (parseFloat(stats.averageRating) < 3.5)
      insights.push({ type: 'warning', icon: '⚠️', title: 'Rating Needs Work', body: `${stats.averageRating}/5 rating. Read recent reviews to find improvement areas.` });
  }

  if (insights.length === 0)
    insights.push({ type: 'neutral', icon: '📊', title: 'Keep Building Data', body: 'More activity will unlock personalized insights. Keep engaging with customers!' });

  return insights;
}

// ─────────────────────────────────────────────────────────────────────────────
// WEEKLY ANALYTICS
// ─────────────────────────────────────────────────────────────────────────────

export async function getWeeklyAnalytics(storeId, isQueueOnly = false) {
  try {
    if (!storeId) return { success: false, data: [] };
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const weeklyData = {};

    if (isQueueOnly) {
      const { data, error } = await supabase.from('queue').select('issued_at, actual_service_duration, status').eq('store_id', storeId).gte('issued_at', sevenDaysAgo.toISOString()).order('issued_at', { ascending: true });
      if (error) { safeLog('getWeeklyAnalytics/queue', error); return { success: true, data: [] }; }
      (data || []).forEach(entry => {
        const dayName = days[new Date(entry.issued_at).getDay()];
        if (!weeklyData[dayName]) weeklyData[dayName] = { day: dayName, customers: 0, revenue: 0, avgTime: 0, _times: [], completed: 0 };
        weeklyData[dayName].customers += 1;
        if (entry.actual_service_duration) weeklyData[dayName]._times.push(entry.actual_service_duration);
        if (entry.status === 'completed' || entry.status === 'served') weeklyData[dayName].completed += 1;
      });
      Object.values(weeklyData).forEach(d => {
        d.avgTime = d._times.length > 0 ? Math.round(d._times.reduce((s, t) => s + t, 0) / d._times.length) : 0;
        delete d._times;
      });
    } else {
      const { data, error } = await supabase.from('orders').select('created_at, total_amount').eq('store_id', storeId).gte('created_at', sevenDaysAgo.toISOString()).order('created_at', { ascending: true });
      if (error) { safeLog('getWeeklyAnalytics/orders', error); return { success: true, data: [] }; }
      (data || []).forEach(order => {
        const dayName = days[new Date(order.created_at).getDay()];
        if (!weeklyData[dayName]) weeklyData[dayName] = { day: dayName, customers: 0, revenue: 0, avgTime: 0 };
        weeklyData[dayName].customers += 1;
        weeklyData[dayName].revenue   += parseFloat(order.total_amount) || 0;
      });
    }

    return { success: true, data: Object.values(weeklyData) };
  } catch (error) {
    safeLog('getWeeklyAnalytics', error);
    return { success: false, data: [] };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HOURLY ANALYTICS
// ─────────────────────────────────────────────────────────────────────────────

export async function getHourlyAnalytics(storeId, isQueueOnly = false) {
  try {
    if (!storeId) return { success: false, data: [] };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const hourlyData = {};
    for (let i = 9; i <= 21; i++) hourlyData[i] = { hour: `${i}:00`, customers: 0 };

    if (isQueueOnly) {
      const { data, error } = await supabase.from('queue').select('issued_at').eq('store_id', storeId).neq('status', 'cancelled').gte('issued_at', today.toISOString()).order('issued_at', { ascending: true });
      if (error) { safeLog('getHourlyAnalytics/queue', error); return { success: true, data: Object.values(hourlyData) }; }
      (data || []).forEach(entry => { const hour = new Date(entry.issued_at).getHours(); if (hourlyData[hour]) hourlyData[hour].customers += 1; });
    } else {
      const { data, error } = await supabase.from('orders').select('created_at').eq('store_id', storeId).gte('created_at', today.toISOString()).order('created_at', { ascending: true });
      if (error) { safeLog('getHourlyAnalytics/orders', error); return { success: true, data: Object.values(hourlyData) }; }
      (data || []).forEach(order => { const hour = new Date(order.created_at).getHours(); if (hourlyData[hour]) hourlyData[hour].customers += 1; });
    }

    return { success: true, data: Object.values(hourlyData) };
  } catch (error) {
    safeLog('getHourlyAnalytics', error);
    return { success: false, data: [] };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PEAK HOURS ANALYTICS
// ─────────────────────────────────────────────────────────────────────────────

export async function getPeakHoursAnalytics(storeId, period = 'week', isQueueOnly = false) {
  try {
    if (!storeId) return { success: false, data: [], peakTime: 'N/A' };
    const { currentStart } = getPeriodDates(period);
    let rows = [];

    if (isQueueOnly) {
      const { data, error } = await supabase.from('queue').select('issued_at').eq('store_id', storeId).neq('status', 'cancelled').gte('issued_at', currentStart.toISOString());
      if (error) { safeLog('getPeakHoursAnalytics/queue', error); return { success: true, data: [], peakTime: 'N/A' }; }
      rows = (data || []).map(r => new Date(r.issued_at).getHours());
    } else {
      const { data, error } = await supabase.from('orders').select('created_at').eq('store_id', storeId).gte('created_at', currentStart.toISOString());
      if (error) { safeLog('getPeakHoursAnalytics/orders', error); return { success: true, data: [], peakTime: 'N/A' }; }
      rows = (data || []).map(r => new Date(r.created_at).getHours());
    }

    const hourCounts = {};
    let maxCount = 0, peakHour = null;
    rows.forEach(hour => {
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
      if (hourCounts[hour] > maxCount) { maxCount = hourCounts[hour]; peakHour = hour; }
    });

    const total = rows.length || 1;
    const sortedHours = Object.entries(hourCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([hour, count]) => ({
        time: `${hour}:00–${parseInt(hour) + 1}:00`,
        count,
        percentage: Math.round((count / total) * 100),
      }));

    return { success: true, data: sortedHours, peakTime: peakHour !== null ? `${peakHour}:00–${parseInt(peakHour) + 1}:00` : 'N/A' };
  } catch (error) {
    safeLog('getPeakHoursAnalytics', error);
    return { success: false, data: [], peakTime: 'N/A' };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SERVICE TIME DISTRIBUTION
// ─────────────────────────────────────────────────────────────────────────────

export async function getServiceTimeDistribution(storeId, period = 'week') {
  try {
    if (!storeId) return { success: false, data: [] };
    const { currentStart } = getPeriodDates(period);
    const { data, error } = await supabase.from('queue').select('actual_service_duration').eq('store_id', storeId).eq('status', 'completed').gte('created_at', currentStart.toISOString());
    if (error) { safeLog('getServiceTimeDistribution', error); return { success: true, data: [] }; }

    const ranges = { '0–5 min': 0, '5–10 min': 0, '10–15 min': 0, '15–20 min': 0, '20+ min': 0 };
    (data || []).forEach(entry => {
      const t = entry.actual_service_duration || 0;
      if (t <= 5)       ranges['0–5 min']++;
      else if (t <= 10) ranges['5–10 min']++;
      else if (t <= 15) ranges['10–15 min']++;
      else if (t <= 20) ranges['15–20 min']++;
      else              ranges['20+ min']++;
    });

    const total = data?.length || 1;
    return {
      success: true,
      data: Object.entries(ranges).map(([range, count]) => ({ range, count, percentage: Math.round((count / total) * 100) }))
    };
  } catch (error) {
    safeLog('getServiceTimeDistribution', error);
    return { success: false, data: [] };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TOP PRODUCTS
// ─────────────────────────────────────────────────────────────────────────────

export async function getTopProducts(storeId, period = 'week', limit = 5) {
  try {
    if (!storeId) return { success: false, data: [] };
    const { currentStart } = getPeriodDates(period);
    const { data, error } = await supabase.from('orders').select('items, created_at').eq('store_id', storeId).gte('created_at', currentStart.toISOString());
    if (error) { safeLog('getTopProducts', error); return { success: true, data: [] }; }

    const productStats = {};
    (data || []).forEach(order => {
      (order.items || []).forEach(item => {
        const id    = item.productId || item.id || item.product_id;
        const name  = item.name || item.product_name || 'Unknown';
        const qty   = item.quantity || 1;
        const price = parseFloat(item.price || item.product_price || 0);
        if (!productStats[id]) productStats[id] = { name, sold: 0, revenue: 0 };
        productStats[id].sold    += qty;
        productStats[id].revenue += qty * price;
      });
    });

    const top = Object.values(productStats).sort((a, b) => b.revenue - a.revenue).slice(0, limit);
    const totalRevenue = top.reduce((s, p) => s + p.revenue, 0) || 1;
    top.forEach(p => { p.percentage = Math.round((p.revenue / totalRevenue) * 100); });
    return { success: true, data: top };
  } catch (error) {
    safeLog('getTopProducts', error);
    return { success: false, data: [] };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DAILY SERVICE BREAKDOWN
// ─────────────────────────────────────────────────────────────────────────────

export async function getDailyServiceBreakdown(storeId, period = 'week') {
  try {
    if (!storeId) return { success: false, data: [] };
    const { currentStart } = getPeriodDates(period);
    const { data, error } = await supabase.from('queue').select('issued_at, status, actual_service_duration').eq('store_id', storeId).gte('issued_at', currentStart.toISOString()).order('issued_at', { ascending: true });
    if (error) { safeLog('getDailyServiceBreakdown', error); return { success: true, data: [] }; }

    const byDay = {};
    (data || []).forEach(entry => {
      const dateKey = new Date(entry.issued_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
      if (!byDay[dateKey]) byDay[dateKey] = { date: dateKey, customers: 0, completed: 0, _times: [] };
      byDay[dateKey].customers += 1;
      if (entry.status === 'completed' || entry.status === 'served') byDay[dateKey].completed += 1;
      if (entry.actual_service_duration) byDay[dateKey]._times.push(entry.actual_service_duration);
    });

    return {
      success: true,
      data: Object.values(byDay).map(d => ({
        date: d.date,
        customers: d.customers,
        completed: d.completed,
        completionRate: d.customers > 0 ? Math.round((d.completed / d.customers) * 100) : 0,
        avgServiceTime: d._times.length > 0 ? Math.round(d._times.reduce((s, t) => s + t, 0) / d._times.length) : 0,
      }))
    };
  } catch (error) {
    safeLog('getDailyServiceBreakdown', error);
    return { success: false, data: [] };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STORE RATINGS
// ─────────────────────────────────────────────────────────────────────────────

export async function getStoreReviewRatings(storeId, period = 'week') {
  const EMPTY = { averageRating: 0, totalReviews: 0, ratingDistribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 } };
  try {
    if (!storeId) return { success: false, data: EMPTY };
    const { currentStart } = getPeriodDates(period);
    const { data: reviews, error } = await supabase.from('store_ratings').select('rating, created_at').eq('store_id', storeId).gte('created_at', currentStart.toISOString());
    if (error) { safeLog('getStoreReviewRatings', error); return { success: true, data: EMPTY }; }
    if (!reviews || reviews.length === 0) return { success: true, data: EMPTY };

    const totalReviews = reviews.length;
    const sumRating    = reviews.reduce((s, r) => s + (r.rating || 0), 0);
    const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    reviews.forEach(r => { if (r.rating >= 1 && r.rating <= 5) distribution[r.rating]++; });

    return { success: true, data: { averageRating: (sumRating / totalReviews).toFixed(1), totalReviews, ratingDistribution: distribution } };
  } catch (error) {
    safeLog('getStoreReviewRatings', error);
    return { success: false, data: EMPTY };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// OVERALL STATS
// ─────────────────────────────────────────────────────────────────────────────

export async function getOverallStats(storeId, period = 'week', isQueueOnly = false) {
  const EMPTY = {
    totalCustomers: 0, customersServed: 0, totalRevenue: 0, avgServiceTime: 0,
    customerGrowth: 0, revenueGrowth: 0, efficiencyScore: 0,
    averageRating: 0, totalReviews: 0,
    ratingDistribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
    totalVisits: 0, visitGrowth: 0,
  };

  try {
    if (!storeId) return { success: false, data: EMPTY };
    const { currentStart, previousStart } = getPeriodDates(period);

    if (isQueueOnly) {
      const [
        { data: current,  error: e1 },
        { data: previous, error: e2 },
        { data: queueEntries, error: e3 },
        reviewRatings,
        visitsResult,
      ] = await Promise.all([
        supabase.from('queue').select('id, status').eq('store_id', storeId).gte('issued_at', currentStart.toISOString()),
        supabase.from('queue').select('id').eq('store_id', storeId).gte('issued_at', previousStart.toISOString()).lt('issued_at', currentStart.toISOString()),
        supabase.from('queue').select('actual_service_duration').eq('store_id', storeId).eq('status', 'completed').gte('created_at', currentStart.toISOString()),
        getStoreReviewRatings(storeId, period),
        getStoreVisits(storeId, period),
      ]);

      if (e1) safeLog('getOverallStats/queue/current', e1);
      if (e2) safeLog('getOverallStats/queue/previous', e2);
      if (e3) safeLog('getOverallStats/queue/entries', e3);

      const totalCustomers    = current?.length    || 0;
      const previousCustomers = previous?.length   || 0;
      const servedCount       = current?.filter(e => e.status === 'completed' || e.status === 'served').length || 0;
      const customerGrowth    = previousCustomers > 0 ? Math.round(((totalCustomers - previousCustomers) / previousCustomers) * 100) : 0;
      const avgServiceTime    = (queueEntries?.length ?? 0) > 0
        ? Math.round(queueEntries.reduce((s, e) => s + (e.actual_service_duration || 0), 0) / queueEntries.length) : 0;

      return {
        success: true,
        data: {
          totalCustomers, customersServed: servedCount, totalRevenue: 0, avgServiceTime,
          customerGrowth, revenueGrowth: 0,
          efficiencyScore: avgServiceTime <= 10 ? 95 : avgServiceTime <= 15 ? 85 : 70,
          averageRating: reviewRatings.data.averageRating,
          totalReviews: reviewRatings.data.totalReviews,
          ratingDistribution: reviewRatings.data.ratingDistribution,
          totalVisits: visitsResult.data.totalVisits,
          visitGrowth: visitsResult.data.visitGrowth,
        }
      };
    } else {
      const [
        { data: currentOrders,  error: e1 },
        { data: previousOrders, error: e2 },
        { data: queueEntries,   error: e3 },
        reviewRatings,
        visitsResult,
      ] = await Promise.all([
        supabase.from('orders').select('total_amount').eq('store_id', storeId).gte('created_at', currentStart.toISOString()),
        supabase.from('orders').select('total_amount').eq('store_id', storeId).gte('created_at', previousStart.toISOString()).lt('created_at', currentStart.toISOString()),
        supabase.from('queue').select('actual_service_duration').eq('store_id', storeId).eq('status', 'completed').gte('created_at', currentStart.toISOString()),
        getStoreReviewRatings(storeId, period),
        getStoreVisits(storeId, period),
      ]);

      if (e1) safeLog('getOverallStats/orders/current', e1);
      if (e2) safeLog('getOverallStats/orders/previous', e2);
      if (e3) safeLog('getOverallStats/queue/entries', e3);

      const totalCustomers    = currentOrders?.length  || 0;
      const previousCustomers = previousOrders?.length || 0;
      const totalRevenue      = (currentOrders  || []).reduce((s, o) => s + (parseFloat(o.total_amount) || 0), 0);
      const previousRevenue   = (previousOrders || []).reduce((s, o) => s + (parseFloat(o.total_amount) || 0), 0);
      const customerGrowth    = previousCustomers > 0 ? Math.round(((totalCustomers - previousCustomers) / previousCustomers) * 100) : 0;
      const revenueGrowth     = previousRevenue   > 0 ? Math.round(((totalRevenue - previousRevenue) / previousRevenue) * 100) : 0;
      const avgServiceTime    = (queueEntries?.length ?? 0) > 0
        ? Math.round(queueEntries.reduce((s, e) => s + (e.actual_service_duration || 0), 0) / queueEntries.length) : 0;

      return {
        success: true,
        data: {
          totalCustomers, customersServed: totalCustomers,
          totalRevenue: Math.round(totalRevenue), avgServiceTime,
          customerGrowth, revenueGrowth,
          efficiencyScore: avgServiceTime <= 10 ? 95 : avgServiceTime <= 15 ? 85 : 70,
          averageRating: reviewRatings.data.averageRating,
          totalReviews: reviewRatings.data.totalReviews,
          ratingDistribution: reviewRatings.data.ratingDistribution,
          totalVisits: visitsResult.data.totalVisits,
          visitGrowth: visitsResult.data.visitGrowth,
        }
      };
    }
  } catch (error) {
    safeLog('getOverallStats', error);
    return { success: false, data: EMPTY };
  }
}