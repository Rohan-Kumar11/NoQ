// lib/api/stores.js
import { supabase } from '../supabase/client';

/**
 * Fetch all active stores with optional filters
 */
export async function fetchStores({ 
  city = null, 
  storeType = null, 
  searchQuery = '', 
  lat = null, 
  lng = null,
  maxDistance = null 
} = {}) {
  try {
    let query = supabase
      .from('stores')
      .select(`
        *,
        businesses (
          company_name,
          owner_name,
          owner_email
        )
      `)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (city) {
      query = query.eq('city', city);
    }

    if (storeType && storeType !== 'All') {
      query = query.eq('store_type', storeType);
    }

    if (searchQuery && searchQuery.trim() !== '') {
      query = query.or(
        `store_name.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`
      );
    }

    const { data, error } = await query;

    if (error) {
      console.error('Supabase query error:', error);
      throw error;
    }

    if (!data) {
      return { data: [], error: null };
    }

    let storesWithDistance = data;
    if (lat && lng) {
      storesWithDistance = data.map(store => {
        if (store.latitude && store.longitude) {
          const distance = calculateDistance(
            lat, 
            lng, 
            parseFloat(store.latitude), 
            parseFloat(store.longitude)
          );
          return { ...store, distance: parseFloat(distance.toFixed(1)) };
        }
        return { ...store, distance: null };
      });

      if (maxDistance != null) {
        storesWithDistance = storesWithDistance.filter(
          store => store.distance === null || store.distance <= maxDistance
        );
      }

      storesWithDistance.sort((a, b) => {
        if (a.distance === null) return 1;
        if (b.distance === null) return -1;
        return a.distance - b.distance;
      });
    }

    return { data: storesWithDistance, error: null };
  } catch (error) {
    console.error('Error fetching stores:', error);
    return { data: [], error: error.message || 'Failed to fetch stores' };
  }
}

/**
 * Fetch a single store by ID
 */
export async function fetchStoreById(storeId) {
  try {
    if (!storeId) {
      throw new Error('Store ID is required');
    }

    const { data, error } = await supabase
      .from('stores')
      .select(`
        *,
        businesses (
          company_name,
          owner_name,
          owner_email
        )
      `)
      .eq('id', storeId)
      .eq('is_active', true)
      .single();

    if (error) {
      console.error('Supabase query error:', error);
      throw error;
    }

    return { data, error: null };
  } catch (error) {
    console.error('Error fetching store:', error);
    return { data: null, error: error.message || 'Failed to fetch store' };
  }
}

/**
 * Fetch current queue information for a store
 */
export async function fetchStoreQueueInfo(storeId) {
  try {
    if (!storeId) {
      return {
        data: { queueSize: 0, avgWaitTime: 0, totalInSystem: 0 },
        error: null
      };
    }

    const { data: queueEntries, error: queueError } = await supabase
      .from('queue')
      .select('id, status, wait_time_minutes')
      .eq('store_id', storeId)
      .in('status', ['waiting', 'called', 'in_service'])
      .order('token_sequence', { ascending: true });

    if (queueError) {
      console.error('Error fetching queue:', queueError);
      return {
        data: { queueSize: 0, avgWaitTime: 0, totalInSystem: 0 },
        error: null
      };
    }

    const queueSize = queueEntries?.filter(q => q.status === 'waiting').length || 0;
    const avgWaitTime = queueEntries && queueEntries.length > 0 
      ? Math.round(queueEntries.reduce((sum, q) => sum + (q.wait_time_minutes || 0), 0) / queueEntries.length)
      : 0;

    return {
      data: {
        queueSize,
        avgWaitTime,
        totalInSystem: queueEntries?.length || 0
      },
      error: null
    };
  } catch (error) {
    console.error('Error fetching queue info:', error);
    return {
      data: { queueSize: 0, avgWaitTime: 0, totalInSystem: 0 },
      error: null
    };
  }
}

/**
 * Track a store visit — called on every store page load,
 * regardless of whether the buyer purchases anything.
 * Fire-and-forget: never blocks the UI.
 *
 * Deduplication strategy (two layers):
 * 1. sessionStorage key — drops duplicate calls within the same browser tab/session
 *    before they ever reach the database. This handles React Strict Mode's
 *    double-invocation of effects and any accidental double-calls in the same tab.
 * 2. The caller (StoreProducts) also guards with a useRef so the function is only
 *    called once per component mount regardless of re-renders.
 */
export async function trackStoreVisit(storeId, buyerId = null) {
  try {
    if (!storeId) return { error: 'Store ID required' };

    // ── Session-level deduplication ──────────────────────────────────────────
    // Key is per-store per-buyer so switching stores still counts correctly.
    // sessionStorage is cleared when the tab closes, so a genuine new session
    // (new tab or next day) will count as a fresh visit.
    if (typeof sessionStorage !== 'undefined') {
      const sessionKey = `visit_tracked_${storeId}_${buyerId ?? 'anon'}`;
      if (sessionStorage.getItem(sessionKey)) {
        return { success: true, deduped: true };
      }
      sessionStorage.setItem(sessionKey, '1');
    }

    const { error } = await supabase
      .from('store_visits')
      .insert({ store_id: storeId, buyer_id: buyerId });

    if (error) {
      console.error('Error tracking store visit:', error);
      return { error: error.message };
    }
    return { success: true };
  } catch (error) {
    console.error('trackStoreVisit error:', error);
    return { error: error.message };
  }
}

/**
 * Calculate distance between two coordinates using Haversine formula
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  
  return Math.round(distance * 10) / 10;
}

function toRad(degrees) {
  return degrees * (Math.PI / 180);
}

/**
 * Check if store is currently open
 */
export function isStoreOpen(store) {
  if (!store) return false;

  if (store.is_active === false) {
    return false;
  }

  if (store.is_open === false) {
    return false;
  }

  if (store.is_open === true) {
    return true;
  }

  if (!store.operating_hours) {
    return false;
  }

  try {
    const now = new Date();
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const today = days[now.getDay()];
    
    const todayHours = store.operating_hours[today];
    
    if (!todayHours || todayHours.closed) {
      return false;
    }

    const currentTime = now.getHours() * 60 + now.getMinutes();
    const [openHour, openMin] = todayHours.open.split(':').map(Number);
    const [closeHour, closeMin] = todayHours.close.split(':').map(Number);
    
    const openTime = openHour * 60 + openMin;
    const closeTime = closeHour * 60 + closeMin;

    return currentTime >= openTime && currentTime <= closeTime;
  } catch (error) {
    console.error('Error checking store hours:', error);
    return false;
  }
}

/**
 * Format store category for display
 */
export function formatStoreCategory(storeType) {
  if (!storeType) return 'Retail';
  
  const categories = {
    'grocery': 'Grocery',
    'food': 'Food',
    'electronics': 'Electronics',
    'fashion': 'Fashion',
    'healthcare': 'Healthcare',
    'books': 'Books',
    'pharmacy': 'Pharmacy',
    'restaurant': 'Restaurant',
    'cafe': 'Cafe',
    'retail': 'Retail'
  };

  return categories[storeType?.toLowerCase()] || storeType;
}

/**
 * Get all unique cities from stores
 */
export async function fetchStoreCities() {
  try {
    const { data, error } = await supabase
      .from('stores')
      .select('city')
      .eq('is_active', true);

    if (error) throw error;

    const cities = [...new Set(data?.map(s => s.city).filter(Boolean))];
    return { data: cities, error: null };
  } catch (error) {
    console.error('Error fetching cities:', error);
    return { data: [], error: error.message };
  }
}

/**
 * Get all unique store types
 */
export async function fetchStoreTypes() {
  try {
    const { data, error } = await supabase
      .from('stores')
      .select('store_type')
      .eq('is_active', true);

    if (error) throw error;

    const types = [...new Set(data?.map(s => s.store_type).filter(Boolean))];
    return { data: types, error: null };
  } catch (error) {
    console.error('Error fetching store types:', error);
    return { data: [], error: error.message };
  }
}