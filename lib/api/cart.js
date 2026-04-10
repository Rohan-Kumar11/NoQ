// lib/api/cart.js - COMPLETE FIXED VERSION with SIZE VARIANTS

import { supabase } from '../supabase/client';

/**
 * Get or create cart for user
 */
export async function getOrCreateCart(userId) {
  try {
    const { data: existingCart, error: fetchError } = await supabase
      .from('carts')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      throw fetchError;
    }

    if (existingCart) {
      return { data: existingCart, error: null };
    }

    const { data: newCart, error: createError } = await supabase
      .from('carts')
      .insert([{ user_id: userId }])
      .select()
      .single();

    if (createError) throw createError;

    return { data: newCart, error: null };
  } catch (error) {
    console.error('Error getting or creating cart:', error);
    return { data: null, error: error.message };
  }
}

/**
 * ✅ FIXED: Extract size from product variants
 */
function extractSizeFromProduct(product) {
  // Direct properties
  let selectedSize = product.selectedSize || product.size || null;
  
  // From metadata
  if (!selectedSize && product.metadata?.selectedSize) {
    selectedSize = product.metadata.selectedSize;
  }
  
  // ✅ Extract from variants
  if (!selectedSize && product.metadata?.variants) {
    const variants = product.metadata.variants;
    if (Array.isArray(variants)) {
      if (variants.length === 1) {
        selectedSize = variants[0].size;
      } else if (product.price) {
        const matchingVariant = variants.find(v => 
          parseFloat(v.price) === parseFloat(product.price)
        );
        if (matchingVariant) selectedSize = matchingVariant.size;
      }
    }
  }
  
  return selectedSize;
}

/**
 * Add item to cart - FIXED to properly save selectedSize
 */
export async function addToCart({ userId, storeId, productId, product, quantity = 1 }) {
  try {
    console.log('🛒 addToCart called with:', { 
      userId, 
      storeId, 
      productId, 
      product, 
      quantity,
      selectedSize: product.selectedSize 
    });

    // Get or create cart
    const { data: cart, error: cartError } = await getOrCreateCart(userId);
    if (cartError) throw new Error(cartError);

    // Fetch complete product data from database
    const { data: dbProduct, error: productError } = await supabase
      .from('products')
      .select('*')
      .eq('id', productId)
      .single();

    if (productError) throw productError;
    if (!dbProduct) throw new Error('Product not found');

    console.log('📦 Database product:', {
      name: dbProduct.name,
      image_url: dbProduct.image_url,
      has_image_url: !!dbProduct.image_url
    });

    // ✅ Extract selected size
    const selectedSize = extractSizeFromProduct(product);

    console.log('📏 Extracted size:', selectedSize);

    // ✅ CRITICAL: Check if item with SAME SIZE already exists
    const { data: existingItems } = await supabase
      .from('cart_items')
      .select('*')
      .eq('cart_id', cart.id)
      .eq('product_id', productId);

    // Find existing item with same size
    const existingItem = existingItems?.find(item => {
      const itemSize = item.product_metadata?.selectedSize;
      return itemSize === selectedSize;
    });

    if (existingItem) {
      // Update quantity of existing item with same size
      const { data, error } = await supabase
        .from('cart_items')
        .update({ 
          quantity: existingItem.quantity + quantity,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingItem.id)
        .select()
        .single();

      if (error) throw error;
      console.log('✅ Updated existing cart item with same size');
      return { data, error: null };
    }

    // Determine final price (handle variants)
    let finalPrice = product.price || dbProduct.price;

    // ✅ Create metadata with selectedSize AND image_url
    const metadata = {
      selectedSize: selectedSize,
      image_url: dbProduct.image_url,
      hasVariants: dbProduct.metadata?.hasVariants || false,
      variants: dbProduct.metadata?.variants || []
    };

    console.log('💾 Saving to cart with metadata:', metadata);

    // Add new item
    const { data, error } = await supabase
      .from('cart_items')
      .insert([{
        cart_id: cart.id,
        store_id: storeId,
        product_id: productId,
        product_name: product.name || dbProduct.name,
        product_price: finalPrice,
        product_image: dbProduct.image || '📦',
        product_category: product.category || dbProduct.category,
        quantity: quantity,
        product_metadata: metadata
      }])
      .select()
      .single();

    if (error) throw error;

    console.log('✅ Cart item created with size:', data.product_metadata?.selectedSize);

    return { data, error: null };
  } catch (error) {
    console.error('❌ Error adding to cart:', error);
    return { data: null, error: error.message };
  }
}

/**
 * Get cart items grouped by store - FIXED to extract selectedSize properly
 */
export async function getCartItemsGroupedByStore(userId) {
  try {
    const { data: cart, error: cartError } = await getOrCreateCart(userId);
    if (cartError) throw new Error(cartError);

    const { data: cartItems, error: itemsError } = await supabase
      .from('cart_items')
      .select(`
        *,
        products!inner(
          id,
          name,
          category,
          image,
          image_url,
          stock,
          status,
          metadata
        ),
        stores!inner(
          id,
          store_name,
          store_type,
          city,
          address,
          is_open
        )
      `)
      .eq('cart_id', cart.id)
      .order('added_at', { ascending: false });

    if (itemsError) throw itemsError;

    if (!cartItems || cartItems.length === 0) {
      return {
        data: {
          stores: [],
          totalItems: 0,
          totalAmount: 0
        },
        error: null
      };
    }

    const storeGroups = {};
    let totalItems = 0;
    let totalAmount = 0;

    cartItems.forEach(item => {
      const storeId = item.store_id;
      
      if (!storeGroups[storeId]) {
        storeGroups[storeId] = {
          storeId: storeId,
          storeName: item.stores.store_name,
          storeType: item.stores.store_type,
          storeCity: item.stores.city,
          storeAddress: item.stores.address,
          isOpen: item.stores.is_open,
          items: []
        };
      }

      // ✅ Extract selectedSize from product_metadata
      const selectedSize = item.product_metadata?.selectedSize || null;

      // ✅ Extract image_url with all fallbacks
      const imageUrl = item.products?.image_url || 
                       item.product_metadata?.image_url || 
                       null;

      console.log('🔍 Cart item extraction:', {
        name: item.product_name,
        selectedSize: selectedSize,
        imageUrl: imageUrl,
        metadata: item.product_metadata
      });

      // ✅ CRITICAL: Put selectedSize at TOP LEVEL for checkout to read
      const itemData = {
        cartItemId: item.id,
        productId: item.product_id,
        name: item.product_name,
        category: item.product_category,
        image: item.product_image,
        image_url: imageUrl,
        selectedSize: selectedSize,
        size: selectedSize,
        price: item.product_price,
        quantity: item.quantity,
        stock: item.products?.stock || 0,
        status: item.products?.status,
        metadata: {
          selectedSize: selectedSize,
          image_url: imageUrl,
          ...(item.product_metadata || {})
        },
        product: {
          image_url: item.products?.image_url,
          metadata: {
            selectedSize: selectedSize,
            ...(item.products?.metadata || {})
          }
        },
        product_metadata: {
          selectedSize: selectedSize,
          image_url: imageUrl,
          ...(item.product_metadata || {})
        }
      };

      storeGroups[storeId].items.push(itemData);
      totalItems += item.quantity;
      totalAmount += item.product_price * item.quantity;
    });

    console.log('📋 Final cart data:', {
      storeCount: Object.keys(storeGroups).length,
      totalItems: totalItems,
      firstItem: Object.values(storeGroups)[0]?.items[0]
    });

    return {
      data: {
        stores: Object.values(storeGroups),
        totalItems,
        totalAmount
      },
      error: null
    };
  } catch (error) {
    console.error('Error fetching cart items:', error);
    return {
      data: { stores: [], totalItems: 0, totalAmount: 0 },
      error: error.message
    };
  }
}

/**
 * Update cart item quantity
 */
export async function updateCartItemQuantity(cartItemId, newQuantity) {
  try {
    const { data, error } = await supabase
      .from('cart_items')
      .update({ 
        quantity: newQuantity,
        updated_at: new Date().toISOString()
      })
      .eq('id', cartItemId)
      .select()
      .single();

    if (error) throw error;

    return { data, error: null };
  } catch (error) {
    console.error('Error updating quantity:', error);
    return { data: null, error: error.message };
  }
}

/**
 * Remove item from cart
 */
export async function removeFromCart(cartItemId) {
  try {
    const { error } = await supabase
      .from('cart_items')
      .delete()
      .eq('id', cartItemId);

    if (error) throw error;

    return { error: null };
  } catch (error) {
    console.error('Error removing from cart:', error);
    return { error: error.message };
  }
}

/**
 * Clear all items from a specific store's cart
 */
export async function clearStoreCart(userId, storeId) {
  try {
    const { data: cart, error: cartError } = await getOrCreateCart(userId);
    if (cartError) throw new Error(cartError);

    const { error } = await supabase
      .from('cart_items')
      .delete()
      .eq('cart_id', cart.id)
      .eq('store_id', storeId);

    if (error) throw error;

    return { error: null };
  } catch (error) {
    console.error('Error clearing store cart:', error);
    return { error: error.message };
  }
}

/**
 * Clear entire cart
 */
export async function clearCart(userId) {
  try {
    const { data: cart, error: cartError } = await getOrCreateCart(userId);
    if (cartError) throw new Error(cartError);

    const { error } = await supabase
      .from('cart_items')
      .delete()
      .eq('cart_id', cart.id);

    if (error) throw error;

    return { error: null };
  } catch (error) {
    console.error('Error clearing cart:', error);
    return { error: error.message };
  }
}

/**
 * Get cart item count
 */
export async function getCartItemCount(userId) {
  try {
    const { data: cart, error: cartError } = await getOrCreateCart(userId);
    if (cartError) throw new Error(cartError);

    const { count, error } = await supabase
      .from('cart_items')
      .select('*', { count: 'exact', head: true })
      .eq('cart_id', cart.id);

    if (error) throw error;

    return { data: count || 0, error: null };
  } catch (error) {
    console.error('Error getting cart count:', error);
    return { data: 0, error: error.message };
  }
}