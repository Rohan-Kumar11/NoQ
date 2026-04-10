// lib/api/productImages.js
import { supabase } from '../supabase/client';

const BUCKET_NAME = 'product-images';
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

/**
 * Validate image file before upload
 * @param {File} file - The file to validate
 * @returns {Object} - { valid: boolean, error: string }
 */
export function validateImageFile(file) {
  if (!file) {
    return { valid: false, error: 'No file provided' };
  }

  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    return { 
      valid: false, 
      error: `File size must be less than ${MAX_FILE_SIZE / (1024 * 1024)}MB` 
    };
  }

  // Check file type
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { 
      valid: false, 
      error: 'Only JPG, PNG, and WebP images are allowed' 
    };
  }

  return { valid: true, error: null };
}

/**
 * Upload product image to Supabase Storage
 * @param {File} file - The image file
 * @param {string} storeId - The store ID
 * @param {string} productId - The product ID
 * @returns {Promise<Object>} - { data: { path, url }, error }
 */
export async function uploadProductImage(file, storeId, productId) {
  try {
    // Validate file
    const validation = validateImageFile(file);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // Generate unique filename
    const timestamp = Date.now();
    const fileExt = file.name.split('.').pop();
    const fileName = `${timestamp}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const filePath = `${storeId}/${productId}/${fileName}`;

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (error) {
      console.error('Upload error:', error);
      throw error;
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(filePath);

    return {
      data: {
        path: filePath,
        url: publicUrl
      },
      error: null
    };
  } catch (error) {
    console.error('Error uploading product image:', error);
    return {
      data: null,
      error: error.message || 'Failed to upload image'
    };
  }
}

/**
 * Delete product image from Supabase Storage
 * @param {string} imageUrl - The full image URL or path
 * @returns {Promise<Object>} - { data, error }
 */
export async function deleteProductImage(imageUrl) {
  try {
    if (!imageUrl) {
      return { data: null, error: 'No image URL provided' };
    }

    // Extract path from URL if full URL is provided
    let filePath = imageUrl;
    if (imageUrl.includes('/storage/v1/object/public/')) {
      filePath = imageUrl.split('/storage/v1/object/public/product-images/')[1];
    }

    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([filePath]);

    if (error) {
      console.error('Delete error:', error);
      throw error;
    }

    return { data, error: null };
  } catch (error) {
    console.error('Error deleting product image:', error);
    return {
      data: null,
      error: error.message || 'Failed to delete image'
    };
  }
}

/**
 * Get public URL for uploaded image
 * @param {string} path - The storage path
 * @returns {string} - The public URL
 */
export function getProductImageUrl(path) {
  if (!path) return null;

  const { data: { publicUrl } } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(path);

  return publicUrl;
}

/**
 * Compress image on client-side before upload (optional)
 * @param {File} file - The image file
 * @param {number} maxWidth - Maximum width
 * @param {number} maxHeight - Maximum height
 * @param {number} quality - Compression quality (0-1)
 * @returns {Promise<File>} - Compressed file
 */
export async function compressImage(file, maxWidth = 800, maxHeight = 800, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Calculate new dimensions
        if (width > height) {
          if (width > maxWidth) {
            height = height * (maxWidth / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = width * (maxHeight / height);
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            const compressedFile = new File([blob], file.name, {
              type: file.type,
              lastModified: Date.now()
            });
            resolve(compressedFile);
          },
          file.type,
          quality
        );
      };

      img.onerror = () => reject(new Error('Failed to load image'));
    };

    reader.onerror = () => reject(new Error('Failed to read file'));
  });
}

/**
 * Check if Supabase Storage bucket exists and is accessible
 * @returns {Promise<Object>} - { exists: boolean, error }
 */
export async function checkStorageBucket() {
  try {
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .list('', { limit: 1 });

    if (error) {
      console.error('Bucket check error:', error);
      return { exists: false, error: error.message };
    }

    return { exists: true, error: null };
  } catch (error) {
    console.error('Error checking storage bucket:', error);
    return { exists: false, error: error.message };
  }
}