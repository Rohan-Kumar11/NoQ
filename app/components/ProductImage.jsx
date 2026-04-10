// app/components/ProductImage.jsx - COMPLETE SIMPLIFIED VERSION
'use client';

import { useState } from 'react';
import styles from './ProductImage.module.css';

export default function ProductImage({ 
  src,
  fallback,
  alt,
  category,
  size = 'medium',
  className = '',
  loading = 'lazy'
}) {
  const [hasError, setHasError] = useState(false);
  
  // Simple check: do we have a valid image URL?
  const hasValidSrc = src && typeof src === 'string' && src.length > 0 && !hasError;
  
  // Category emojis
  const categoryEmojis = {
    'Desserts': '🍰',
    'Coffee': '☕',
    'Snacks': '🍿',
    'Smoothies': '🥤',
    'Sandwiches': '🥪',
    'Bakery': '🍞',
    'Beverages': '🥤',
    'Dairy': '🥛',
    'Fruits': '🍌',
    'Vegetables': '🥕',
    'Meat': '🥩',
    'Seafood': '🐟',
    'Frozen': '🧊',
    'Grains': '🌾'
  };
  
  const displayEmoji = fallback || categoryEmojis[category] || '📦';
  
  return (
    <div className={`${styles.productImageContainer} ${styles[size]} ${className}`}>
      {hasValidSrc ? (
        <img
          src={src}
          alt={alt || 'Product'}
          loading={loading}
          onError={() => {
            console.error('❌ Image failed to load:', src);
            setHasError(true);
          }}
          onLoad={() => console.log('✅ Image loaded:', src?.substring(0, 60))}
          className={styles.productImage}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        <div className={styles.emojiContainer}>
          <span className={styles.emoji}>{displayEmoji}</span>
        </div>
      )}
    </div>
  );
}