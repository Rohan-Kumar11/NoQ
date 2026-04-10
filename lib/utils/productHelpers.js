// lib/utils/productHelpers.js - FIXED VERSION WITH BETTER IMAGE HANDLING

/**
 * Format product name with size for display
 */
export function formatProductNameWithSize(name, size = null) {
  if (!size) return name;
  return `${name} (${size})`;
}

/**
 * Get product size from various sources
 */
export function getProductSize(item) {
  if (item.selectedSize) return item.selectedSize;
  if (item.size) return item.size;
  if (item.metadata?.size) return item.metadata.size;
  if (item.metadata?.selectedSize) return item.metadata.selectedSize;
  if (item.product?.selectedSize) return item.product.selectedSize;
  if (item.product?.size) return item.product.size;
  if (item.product?.metadata?.size) return item.product.metadata.size;
  if (item.product?.metadata?.selectedSize) return item.product.metadata.selectedSize;
  if (item.product_data?.size) return item.product_data.size;
  if (item.product_data?.metadata?.size) return item.product_data.metadata.size;
  return null;
}

/**
 * Get product image URL - FIXED VERSION
 */
export function getProductImageUrl(item) {
  console.log('🔍 getProductImageUrl called for:', item?.name || 'unknown');
  
  // Direct image_url property (most common)
  if (item.image_url && typeof item.image_url === 'string' && item.image_url.trim() !== '') {
    console.log('✅ Found direct image_url:', item.image_url);
    return item.image_url;
  }
  
  // Nested in product object (common in cart items with joins)
  if (item.product?.image_url && typeof item.product.image_url === 'string' && item.product.image_url.trim() !== '') {
    console.log('✅ Found product.image_url:', item.product.image_url);
    return item.product.image_url;
  }
  
  // Alternative naming - product_data
  if (item.product_data?.image_url && typeof item.product_data.image_url === 'string' && item.product_data.image_url.trim() !== '') {
    console.log('✅ Found product_data.image_url:', item.product_data.image_url);
    return item.product_data.image_url;
  }
  
  // Check metadata (sometimes stored here)
  if (item.metadata?.image_url && typeof item.metadata.image_url === 'string' && item.metadata.image_url.trim() !== '') {
    console.log('✅ Found metadata.image_url:', item.metadata.image_url);
    return item.metadata.image_url;
  }
  
  // Check product_metadata (cart items)
  if (item.product_metadata?.image_url && typeof item.product_metadata.image_url === 'string' && item.product_metadata.image_url.trim() !== '') {
    console.log('✅ Found product_metadata.image_url:', item.product_metadata.image_url);
    return item.product_metadata.image_url;
  }
  
  console.log('❌ No image_url found. Item keys:', Object.keys(item));
  return null;
}

/**
 * Get product image emoji
 */
export function getProductImageEmoji(item, defaultEmoji = '📦') {
  if (item.image) return item.image;
  if (item.product?.image) return item.product.image;
  if (item.product_data?.image) return item.product_data.image;
  if (item.metadata?.image) return item.metadata.image;
  return defaultEmoji;
}

/**
 * Get product category
 */
export function getProductCategory(item) {
  if (item.category) return item.category;
  if (item.product?.category) return item.product.category;
  if (item.product_data?.category) return item.product_data.category;
  if (item.product_category) return item.product_category;
  return 'General';
}

/**
 * Get product name
 */
export function getProductName(item) {
  if (item.name) return item.name;
  if (item.product?.name) return item.product.name;
  if (item.product_data?.name) return item.product_data.name;
  if (item.product_name) return item.product_name;
  return 'Product';
}

/**
 * Get product price
 */
export function getProductPrice(item) {
  if (item.price !== undefined && item.price !== null) return item.price;
  if (item.product?.price !== undefined && item.product?.price !== null) return item.product.price;
  if (item.product_data?.price !== undefined && item.product_data?.price !== null) return item.product_data.price;
  if (item.product_price !== undefined && item.product_price !== null) return item.product_price;
  return 0;
}

/**
 * Format complete product display info - FIXED VERSION
 */
export function formatProductDisplayInfo(item) {
  console.log('📦 formatProductDisplayInfo called for item:', {
    name: item?.name,
    has_image_url: !!item?.image_url,
    has_product_image_url: !!item?.product?.image_url,
    has_metadata_image_url: !!item?.metadata?.image_url,
    has_product_metadata_image_url: !!item?.product_metadata?.image_url
  });
  
  const name = getProductName(item);
  const size = getProductSize(item);
  const imageUrl = getProductImageUrl(item);
  const emoji = getProductImageEmoji(item);
  const category = getProductCategory(item);
  const price = getProductPrice(item);
  const displayName = formatProductNameWithSize(name, size);
  
  const result = {
    name,
    displayName,
    size,
    imageUrl,
    emoji,
    category,
    price,
    quantity: item.quantity || 1
  };
  
  console.log('✨ Display info result:', {
    name: result.name,
    hasImageUrl: !!result.imageUrl,
    imageUrl: result.imageUrl,
    emoji: result.emoji
  });
  
  return result;
}

/**
 * Format price for display
 */
export function formatPrice(price) {
  const numPrice = parseFloat(price);
  if (isNaN(numPrice)) return '₹0.00';
  return `₹${numPrice.toFixed(2)}`;
}

/**
 * Calculate item total
 */
export function calculateItemTotal(price, quantity = 1) {
  const numPrice = parseFloat(price) || 0;
  const numQty = parseInt(quantity) || 1;
  return numPrice * numQty;
}

/**
 * Format item total for display
 */
export function formatItemTotal(price, quantity = 1) {
  return formatPrice(calculateItemTotal(price, quantity));
}

/**
 * Debug helper - logs all possible image locations
 */
export function debugItemImagePaths(item) {
  console.log('🔍 === IMAGE DEBUG ===');
  console.log('Item name:', getProductName(item));
  console.log('item.image_url:', item.image_url);
  console.log('item.product?.image_url:', item.product?.image_url);
  console.log('item.product_data?.image_url:', item.product_data?.image_url);
  console.log('item.metadata?.image_url:', item.metadata?.image_url);
  console.log('item.product_metadata?.image_url:', item.product_metadata?.image_url);
  console.log('item.image (emoji):', item.image);
  console.log('item.product?.image:', item.product?.image);
  console.log('All item keys:', Object.keys(item));
  console.log('===================');
}