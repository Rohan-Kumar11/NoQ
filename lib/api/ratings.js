// lib/api/ratings.js
import { supabase } from '@/lib/supabase/client';

/**
 * Get or create user's rating for a store
 */
export async function getUserStoreRating(userId, storeId) {
  try {
    console.log('📖 Getting user rating:', { userId, storeId });
    
    const { data, error } = await supabase
      .from('store_ratings')
      .select('*')
      .eq('customer_id', userId)
      .eq('store_id', storeId)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      console.error('❌ Error fetching user rating:', error);
      throw error;
    }

    console.log('✅ User rating fetched:', data);
    return { data: data || null, error: null };
  } catch (error) {
    console.error('💥 Error in getUserStoreRating:', error);
    return { data: null, error: error.message };
  }
}

/**
 * Add or update a store rating (UPSERT)
 */
export async function upsertStoreRating({ userId, storeId, rating }) {
  try {
    console.log('💾 Upserting rating:', { userId, storeId, rating });

    // Validate rating
    if (rating < 1 || rating > 5) {
      throw new Error('Rating must be between 1 and 5');
    }

    if (!userId || !storeId) {
      throw new Error('User ID and Store ID are required');
    }

    const now = new Date().toISOString();

    // First, try to check if rating exists
    const { data: existing } = await supabase
      .from('store_ratings')
      .select('id')
      .eq('customer_id', userId)
      .eq('store_id', storeId)
      .maybeSingle();

    console.log('🔍 Existing rating:', existing);

    // Use upsert with proper conflict resolution
    const { data, error } = await supabase
      .from('store_ratings')
      .upsert(
        {
          customer_id: userId,
          store_id: storeId,
          rating: rating,
          updated_at: now,
          // Only set created_at if it's a new record
          ...(existing ? {} : { created_at: now })
        },
        {
          onConflict: 'store_id,customer_id',
          ignoreDuplicates: false
        }
      )
      .select()
      .single();

    if (error) {
      console.error('❌ Error upserting rating:', error);
      throw error;
    }

    console.log('✅ Rating upserted successfully:', data);
    return { data, error: null };
  } catch (error) {
    console.error('💥 Error in upsertStoreRating:', error);
    return { data: null, error: error.message };
  }
}

/**
 * Delete a store rating
 */
export async function deleteStoreRating(userId, storeId) {
  try {
    console.log('🗑️ Deleting rating:', { userId, storeId });

    const { error } = await supabase
      .from('store_ratings')
      .delete()
      .eq('customer_id', userId)
      .eq('store_id', storeId);

    if (error) {
      console.error('❌ Error deleting rating:', error);
      throw error;
    }

    console.log('✅ Rating deleted successfully');
    return { data: { deleted: true }, error: null };
  } catch (error) {
    console.error('💥 Error in deleteStoreRating:', error);
    return { data: null, error: error.message };
  }
}

/**
 * Get all ratings for a store
 */
export async function getStoreRatings(storeId, { limit = 50, offset = 0 } = {}) {
  try {
    console.log('📚 Fetching store ratings:', { storeId, limit, offset });

    const { data, error } = await supabase
      .from('store_ratings')
      .select(`
        *,
        profiles:customer_id (
          full_name
        )
      `)
      .eq('store_id', storeId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('❌ Error fetching store ratings:', error);
      throw error;
    }

    console.log('✅ Store ratings fetched:', data?.length || 0, 'ratings');
    return { data: data || [], error: null };
  } catch (error) {
    console.error('💥 Error in getStoreRatings:', error);
    return { data: [], error: error.message };
  }
}

/**
 * Get rating statistics for a store
 */
export async function getStoreRatingStats(storeId) {
  try {
    console.log('📊 Fetching rating stats for store:', storeId);

    // Fetch store with rating info
    const { data: store, error: storeError } = await supabase
      .from('stores')
      .select('average_rating, total_ratings')
      .eq('id', storeId)
      .single();

    if (storeError) {
      console.error('❌ Error fetching store:', storeError);
      throw storeError;
    }

    // Get rating distribution
    const { data: ratings, error: ratingsError } = await supabase
      .from('store_ratings')
      .select('rating')
      .eq('store_id', storeId);

    if (ratingsError) {
      console.error('❌ Error fetching ratings:', ratingsError);
      throw ratingsError;
    }

    // Calculate distribution
    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    ratings.forEach(r => {
      distribution[r.rating] = (distribution[r.rating] || 0) + 1;
    });

    const stats = {
      averageRating: parseFloat(store.average_rating) || 0,
      totalRatings: store.total_ratings || 0,
      distribution
    };

    console.log('✅ Rating stats:', stats);
    return { data: stats, error: null };
  } catch (error) {
    console.error('💥 Error in getStoreRatingStats:', error);
    return {
      data: {
        averageRating: 0,
        totalRatings: 0,
        distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
      },
      error: error.message
    };
  }
}

/**
 * Fetch stores with rating filters
 */
export async function fetchStoresWithRatingFilter({
  storeType = null,
  minRating = 0,
  sortByRating = false,
  limit = 100
} = {}) {
  try {
    console.log('🏪 Fetching stores with filters:', { storeType, minRating, sortByRating, limit });

    let query = supabase
      .from('stores')
      .select('*')
      .eq('is_active', true);

    // Filter by store type
    if (storeType && storeType !== 'all') {
      query = query.eq('store_type', storeType);
    }

    // Filter by minimum rating
    if (minRating > 0) {
      query = query.gte('average_rating', minRating);
    }

    // Sort by rating or created date
    if (sortByRating) {
      query = query.order('average_rating', { ascending: false });
    } else {
      query = query.order('created_at', { ascending: false });
    }

    query = query.limit(limit);

    const { data, error } = await query;

    if (error) {
      console.error('❌ Error fetching stores:', error);
      throw error;
    }

    console.log('✅ Stores fetched:', data?.length || 0, 'stores');
    return { data: data || [], error: null };
  } catch (error) {
    console.error('💥 Error in fetchStoresWithRatingFilter:', error);
    return { data: [], error: error.message };
  }
}