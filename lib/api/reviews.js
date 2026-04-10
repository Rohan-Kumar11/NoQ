// lib/api/reviews.js - STORE_RATINGS TABLE VERSION
import { supabase } from '../supabase/client';

/**
 * Submit a rating/review for a store
 * Uses UPSERT to handle the unique constraint (one rating per customer per store)
 */
export async function submitStoreRating(storeId, customerId, ratingData) {
  try {
    const { rating, comment } = ratingData;

    // Validate rating
    if (!rating || rating < 1 || rating > 5) {
      throw new Error('Rating must be between 1 and 5');
    }

    // Upsert the rating (insert or update if exists)
    const { data, error } = await supabase
      .from('store_ratings')
      .upsert({
        store_id: storeId,
        customer_id: customerId,
        rating: rating,
        review_text: comment || null,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'store_id,customer_id'
      })
      .select()
      .single();

    if (error) throw error;

    return {
      success: true,
      data: data,
      message: 'Rating submitted successfully'
    };
  } catch (error) {
    console.error('Error submitting rating:', error);
    return {
      success: false,
      error: error.message,
      message: 'Failed to submit rating'
    };
  }
}

/**
 * Get reviews for a specific store
 */
export async function getStoreReviews(storeId, limit = 10, offset = 0) {
  try {
    const { data, error, count } = await supabase
      .from('store_ratings')
      .select(`
        id,
        rating,
        review_text,
        created_at,
        updated_at,
        profiles!store_ratings_customer_id_fkey (
          full_name
        )
      `, { count: 'exact' })
      .eq('store_id', storeId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    return {
      success: true,
      data: data || [],
      total: count || 0
    };
  } catch (error) {
    console.error('Error fetching store reviews:', error);
    return {
      success: false,
      error: error.message,
      data: [],
      total: 0
    };
  }
}

/**
 * Check if a customer has already rated a store
 */
export async function checkCustomerRating(storeId, customerId) {
  try {
    const { data, error } = await supabase
      .from('store_ratings')
      .select('rating, review_text, created_at, updated_at')
      .eq('store_id', storeId)
      .eq('customer_id', customerId)
      .maybeSingle();

    if (error) throw error;

    return {
      success: true,
      hasRated: data !== null,
      rating: data
    };
  } catch (error) {
    console.error('Error checking rating:', error);
    return {
      success: false,
      error: error.message,
      hasRated: false,
      rating: null
    };
  }
}

/**
 * Get stores that a customer has visited/ordered from but hasn't rated
 */
export async function getUnratedStoresForCustomer(customerId) {
  try {
    // Get all stores the customer has ordered from
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select(`
        store_id,
        stores!orders_store_id_fkey (
          id,
          store_name,
          store_type,
          logo_url,
          average_rating
        )
      `)
      .eq('customer_id', customerId)
      .in('order_status', ['completed', 'delivered'])
      .order('created_at', { ascending: false });

    if (ordersError) throw ordersError;

    // Get stores the customer has already rated
    const { data: ratings, error: ratingsError } = await supabase
      .from('store_ratings')
      .select('store_id, rating, review_text')
      .eq('customer_id', customerId);

    if (ratingsError) throw ratingsError;

    // Create a map of rated stores
    const ratedStoreIds = new Set(ratings.map(r => r.store_id));
    const ratedStoresMap = new Map(ratings.map(r => [r.store_id, r]));

    // Get unique stores
    const storeMap = new Map();
    orders.forEach(order => {
      if (order.stores && !storeMap.has(order.store_id)) {
        storeMap.set(order.store_id, {
          id: order.stores.id,
          storeName: order.stores.store_name,
          storeType: order.stores.store_type,
          logoUrl: order.stores.logo_url,
          averageRating: parseFloat(order.stores.average_rating || 0),
          hasRated: ratedStoreIds.has(order.store_id),
          myRating: ratedStoresMap.get(order.store_id) || null
        });
      }
    });

    const stores = Array.from(storeMap.values());
    const unrated = stores.filter(s => !s.hasRated);
    const rated = stores.filter(s => s.hasRated);

    return {
      success: true,
      data: {
        unrated,
        rated
      }
    };
  } catch (error) {
    console.error('Error fetching unrated stores:', error);
    return {
      success: false,
      error: error.message,
      data: {
        unrated: [],
        rated: []
      }
    };
  }
}

/**
 * Get average ratings for a store (from stores table which has triggers)
 */
export async function getStoreAverageRatings(storeId) {
  try {
    const { data, error } = await supabase
      .from('stores')
      .select('average_rating, total_ratings')
      .eq('id', storeId)
      .single();

    if (error) throw error;

    return {
      success: true,
      data: {
        averageRating: parseFloat(data.average_rating || 0).toFixed(1),
        totalReviews: data.total_ratings || 0
      }
    };
  } catch (error) {
    console.error('Error fetching average ratings:', error);
    return {
      success: false,
      error: error.message,
      data: {
        averageRating: 0,
        totalReviews: 0
      }
    };
  }
}

/**
 * Delete a rating (if customer wants to remove their review)
 */
export async function deleteStoreRating(storeId, customerId) {
  try {
    const { error } = await supabase
      .from('store_ratings')
      .delete()
      .eq('store_id', storeId)
      .eq('customer_id', customerId);

    if (error) throw error;

    return {
      success: true,
      message: 'Rating deleted successfully'
    };
  } catch (error) {
    console.error('Error deleting rating:', error);
    return {
      success: false,
      error: error.message,
      message: 'Failed to delete rating'
    };
  }
}

/**
 * Get customer's own rating for a store
 */
export async function getCustomerStoreRating(storeId, customerId) {
  try {
    const { data, error } = await supabase
      .from('store_ratings')
      .select('*')
      .eq('store_id', storeId)
      .eq('customer_id', customerId)
      .maybeSingle();

    if (error) throw error;

    return {
      success: true,
      data: data
    };
  } catch (error) {
    console.error('Error fetching customer rating:', error);
    return {
      success: false,
      error: error.message,
      data: null
    };
  }
}

/**
 * Get rating distribution for a store
 */
export async function getStoreRatingDistribution(storeId) {
  try {
    const { data, error } = await supabase
      .from('store_ratings')
      .select('rating')
      .eq('store_id', storeId);

    if (error) throw error;

    const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    const total = data.length;

    data.forEach(review => {
      if (review.rating >= 1 && review.rating <= 5) {
        distribution[review.rating]++;
      }
    });

    return {
      success: true,
      data: {
        distribution,
        total,
        percentages: {
          5: total > 0 ? Math.round((distribution[5] / total) * 100) : 0,
          4: total > 0 ? Math.round((distribution[4] / total) * 100) : 0,
          3: total > 0 ? Math.round((distribution[3] / total) * 100) : 0,
          2: total > 0 ? Math.round((distribution[2] / total) * 100) : 0,
          1: total > 0 ? Math.round((distribution[1] / total) * 100) : 0,
        }
      }
    };
  } catch (error) {
    console.error('Error fetching rating distribution:', error);
    return {
      success: false,
      error: error.message,
      data: {
        distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
        total: 0,
        percentages: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
      }
    };
  }
}