// lib/api/products.js - FIXED VERSION
import { supabase } from '../supabase/client';
import { uploadProductImage, deleteProductImage } from './productImages';

/**
 * Fetch products for a specific store (SELLER / admin view — available only)
 */
export async function fetchStoreProducts(storeId, { category = 'All', searchQuery = '' } = {}) {
  try {
    if (!storeId) {
      console.error('Store ID is required');
      return { data: [], error: 'Store ID is required' };
    }

    let query = supabase
      .from('products')
      .select('*')
      .eq('store_id', storeId)
      .eq('is_active', true)
      .eq('status', 'available')   // seller product management only sees available
      .order('created_at', { ascending: false });

    if (category && category !== 'All') {
      query = query.eq('category', category);
    }

    if (searchQuery && searchQuery.trim() !== '') {
      query = query.or(`name.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching products:', error);
      return { data: [], error: error.message };
    }

    return { data: data || [], error: null };
  } catch (error) {
    console.error('Error fetching products:', error);
    return { data: [], error: error.message };
  }
}

/**
 * ✅ NEW: Fetch ALL active products for a store regardless of status.
 *
 * Used by the BUYER store page so that out-of-stock / unavailable products
 * remain visible (dimmed, disabled) rather than disappearing from the menu.
 * This gives buyers the full catalogue view and shows real-time stock changes
 * (e.g. a product going from "5 left" → "sold out") without the card vanishing.
 *
 * The buyer's realtime subscription will then update these in-place via
 * postgres_changes on the products table.
 */
export async function fetchAllStoreProducts(storeId, { searchQuery = '' } = {}) {
  try {
    if (!storeId) {
      return { data: [], error: 'Store ID is required' };
    }

    let query = supabase
      .from('products')
      .select('*')
      .eq('store_id', storeId)
      .eq('is_active', true)       // exclude soft-deleted products
      // intentionally NOT filtering by status — show everything
      .order('created_at', { ascending: false });

    if (searchQuery && searchQuery.trim() !== '') {
      query = query.or(`name.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching all store products:', error);
      return { data: [], error: error.message };
    }

    return { data: data || [], error: null };
  } catch (error) {
    console.error('Error fetching all store products:', error);
    return { data: [], error: error.message };
  }
}

/**
 * Fetch product categories for a store
 */
export async function fetchProductCategories(storeId) {
  try {
    if (!storeId) {
      return { data: ['All'], error: 'Store ID is required' };
    }

    const { data, error } = await supabase
      .from('products')
      .select('category')
      .eq('store_id', storeId)
      .eq('is_active', true);

    if (error) {
      console.error('Error fetching categories:', error);
      return { data: ['All'], error: error.message };
    }

    const categories = ['All', ...new Set((data || []).map(p => p.category).filter(Boolean))];
    return { data: categories, error: null };
  } catch (error) {
    console.error('Error fetching categories:', error);
    return { data: ['All'], error: error.message };
  }
}

/**
 * Fetch a single product by ID
 */
export async function fetchProductById(productId) {
  try {
    if (!productId) {
      return { data: null, error: 'Product ID is required' };
    }

    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('id', productId)
      .eq('is_active', true)
      .single();

    if (error) {
      console.error('Error fetching product:', error);
      return { data: null, error: error.message };
    }

    return { data, error: null };
  } catch (error) {
    console.error('Error fetching product:', error);
    return { data: null, error: error.message };
  }
}

/**
 * Get product by ID (alias)
 */
export async function getProductById(productId) {
  return fetchProductById(productId);
}

/**
 * Create a new product with optional image upload
 */
export async function createProduct(productData, imageFile = null) {
  try {
    const { data: product, error: productError } = await supabase
      .from('products')
      .insert([{
        ...productData,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (productError) {
      console.error('Error creating product:', productError);
      throw productError;
    }

    if (imageFile && product) {
      const { data: imageData, error: imageError } = await uploadProductImage(
        imageFile,
        productData.store_id,
        product.id
      );

      if (imageError) {
        console.error('Error uploading image:', imageError);
        return { data: product, error: null, imageError: imageError };
      }

      const { data: updatedProduct, error: updateError } = await supabase
        .from('products')
        .update({
          image_url: imageData.url,
          updated_at: new Date().toISOString()
        })
        .eq('id', product.id)
        .select()
        .single();

      if (updateError) {
        console.error('Error updating product with image URL:', updateError);
        return { data: product, error: null, imageError: updateError };
      }

      return { data: updatedProduct, error: null };
    }

    return { data: product, error: null };
  } catch (error) {
    console.error('Error creating product:', error.message);
    return { data: null, error: error.message };
  }
}

/**
 * Update a product with optional image upload
 */
export async function updateProduct(productId, updates, imageFile = null, deleteOldImage = false) {
  try {
    let imageUrl = updates.image_url;

    if (imageFile) {
      const { data: currentProduct } = await supabase
        .from('products')
        .select('store_id, image_url')
        .eq('id', productId)
        .single();

      if (currentProduct) {
        if (deleteOldImage && currentProduct.image_url) {
          await deleteProductImage(currentProduct.image_url);
        }

        const { data: imageData, error: imageError } = await uploadProductImage(
          imageFile,
          currentProduct.store_id,
          productId
        );

        if (imageError) {
          console.error('Error uploading image:', imageError);
          return { data: null, error: 'Failed to upload image: ' + imageError };
        }

        imageUrl = imageData.url;
      }
    }

    const { data, error } = await supabase
      .from('products')
      .update({
        ...updates,
        image_url: imageUrl,
        updated_at: new Date().toISOString()
      })
      .eq('id', productId)
      .select()
      .single();

    if (error) {
      console.error('Error updating product:', error);
      throw error;
    }

    return { data, error: null };
  } catch (error) {
    console.error('Error updating product:', error.message);
    return { data: null, error: error.message };
  }
}

/**
 * ✅ Update product stock after purchase.
 * Handles both regular products and variant products with sizes.
 *
 * IMPORTANT: This is called from completeOrderWithToken (token verification).
 * The realtime postgres_changes subscription on the buyer/seller product pages
 * will automatically pick up the UPDATE and refresh the displayed stock number.
 */
export async function updateProductStock(productId, quantitySold, selectedSize = null) {
  try {
    console.log('📦 === UPDATE PRODUCT STOCK ===');
    console.log('Product ID:', productId);
    console.log('Quantity Sold:', quantitySold);
    console.log('Selected Size:', selectedSize);

    const { data: product, error: fetchError } = await supabase
      .from('products')
      .select('stock, total_sales, metadata, status, is_active')
      .eq('id', productId)
      .single();

    if (fetchError) {
      console.error('❌ Error fetching product:', fetchError);
      throw fetchError;
    }

    let newStock = product.stock;
    let newMetadata = { ...product.metadata };
    const hasVariants = product.metadata?.hasVariants === true;

    if (hasVariants && selectedSize && product.metadata?.variants) {
      console.log('📏 Processing variant product with size:', selectedSize);
      const variants = [...product.metadata.variants];
      const variantIndex = variants.findIndex(v => v.size === selectedSize);

      if (variantIndex !== -1) {
        const currentVariantStock = variants[variantIndex].stock || 0;
        const newVariantStock = Math.max(0, currentVariantStock - quantitySold);
        console.log(`  Size "${selectedSize}" stock: ${currentVariantStock} → ${newVariantStock}`);
        variants[variantIndex] = { ...variants[variantIndex], stock: newVariantStock };
        newMetadata.variants = variants;
        newStock = variants.reduce((sum, v) => sum + (v.stock || 0), 0);
        console.log(`  Total stock across all variants: ${newStock}`);
      } else {
        console.warn('⚠️ Variant not found for size:', selectedSize);
        newStock = Math.max(0, product.stock - quantitySold);
      }
    } else {
      console.log('📦 Processing regular product (no variants)');
      newStock = Math.max(0, product.stock - quantitySold);
      console.log(`  Stock: ${product.stock} → ${newStock}`);
    }

    const newTotalSales = (product.total_sales || 0) + quantitySold;

    // ✅ When stock hits 0, set status to 'unavailable'.
    // The realtime subscription on buyer/seller pages will receive this UPDATE
    // and refresh the product card — buyer sees "Out of Stock", seller sees 0.
    let newStatus = newStock === 0 ? 'unavailable' : 'available';
    console.log(`📊 New status: ${newStatus}, stock: ${newStock}`);

    const { data: updatedProduct, error: updateError } = await supabase
      .from('products')
      .update({
        stock: newStock,
        total_sales: newTotalSales,
        status: newStatus,
        metadata: newMetadata,
        updated_at: new Date().toISOString()
      })
      .eq('id', productId)
      .select()
      .single();

    if (updateError) {
      console.error('❌ Error updating product in database:', updateError);
      throw updateError;
    }

    console.log('✅ Product stock updated successfully');
    console.log('=== END UPDATE PRODUCT STOCK ===');

    return { data: updatedProduct, error: null };

  } catch (error) {
    console.error('❌ ERROR in updateProductStock:', error);
    return { data: null, error: error.message };
  }
}

/**
 * Delete a product (soft delete)
 */
export async function deleteProduct(productId, deleteImage = true) {
  try {
    const { data: product } = await supabase
      .from('products')
      .select('image_url')
      .eq('id', productId)
      .single();

    if (deleteImage && product?.image_url) {
      await deleteProductImage(product.image_url);
    }

    const { data, error } = await supabase
      .from('products')
      .update({
        is_active: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', productId)
      .select()
      .single();

    if (error) {
      console.error('Error deleting product:', error);
      throw error;
    }

    return { data, error: null };
  } catch (error) {
    console.error('Error deleting product:', error.message);
    return { data: null, error: error.message };
  }
}

/**
 * Format price for display
 */
export function formatPrice(price) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(price);
}

/**
 * Get product emoji based on category
 */
export function getProductEmoji(category) {
  const emojis = {
    'Fruits': '🍌',
    'Vegetables': '🍅',
    'Dairy': '🥛',
    'Bakery': '🍞',
    'Beverages': '🍊',
    'Grains': '🌾',
    'Snacks': '🍿',
    'Frozen': '🧊',
    'Meat': '🥩',
    'Seafood': '🐟',
    'Condiments': '🧂',
    'Health': '💊',
    'Baby': '🍼',
    'Pet': '🐕',
    'Electronics': '📱',
    'Fashion': '👗',
    'Books': '📚',
    'Other': '📦'
  };
  return emojis[category] || '📦';
}

/**
 * Get stock status
 */
export function getStockStatus(stock, lowStockThreshold = 10) {
  if (stock === 0) {
    return { status: 'out_of_stock', color: '#DC143C', label: 'Out of Stock' };
  } else if (stock <= lowStockThreshold) {
    return { status: 'low_stock', color: '#FFA500', label: 'Low Stock' };
  } else {
    return { status: 'in_stock', color: '#228B22', label: 'In Stock' };
  }
}