// app/components/ImageUploader.jsx
'use client';

import { useState, useRef } from 'react';
import { Upload, X, Image as ImageIcon, Loader2 } from 'lucide-react';
import styles from './ImageUploader.module.css';

export default function ImageUploader({ 
  onImageSelect, 
  currentImage = null, 
  onImageRemove,
  maxSize = 5,
  acceptedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
}) {
  const [preview, setPreview] = useState(currentImage);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState(null);
  const [imageInfo, setImageInfo] = useState(null);
  const fileInputRef = useRef(null);

  const validateFile = (file) => {
    // Check file type
    if (!acceptedTypes.includes(file.type)) {
      return 'Only JPG, PNG, and WebP images are allowed';
    }

    // Check file size
    const maxSizeBytes = maxSize * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      return `File size must be less than ${maxSize}MB`;
    }

    return null;
  };

  const handleFileSelect = (file) => {
    setError(null);

    // Validate file
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreview(reader.result);
      setImageInfo({
        name: file.name,
        size: (file.size / 1024).toFixed(2) + ' KB',
        type: file.type.split('/')[1].toUpperCase()
      });
    };
    reader.readAsDataURL(file);

    // Pass file to parent
    if (onImageSelect) {
      onImageSelect(file);
    }
  };

  const handleInputChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleRemoveImage = () => {
    setPreview(null);
    setImageInfo(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    if (onImageRemove) {
      onImageRemove();
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className={styles.imageUploader}>
      <label className={styles.label}>
        Product Image
        <span className={styles.optional}>(Optional)</span>
      </label>

      {preview ? (
        <div className={styles.previewContainer}>
          <div className={styles.imagePreview}>
            <img src={preview} alt="Product preview" className={styles.previewImage} />
            <button
              type="button"
              onClick={handleRemoveImage}
              className={styles.removeButton}
              aria-label="Remove image"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {imageInfo && (
            <div className={styles.imageInfo}>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>File:</span>
                <span className={styles.infoValue}>{imageInfo.name}</span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Size:</span>
                <span className={styles.infoValue}>{imageInfo.size}</span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Type:</span>
                <span className={styles.infoValue}>{imageInfo.type}</span>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={handleClick}
            className={styles.changeButton}
          >
            Change Image
          </button>
        </div>
      ) : (
        <div
          className={`${styles.uploadArea} ${isDragging ? styles.dragging : ''} ${error ? styles.error : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={handleClick}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={acceptedTypes.join(',')}
            onChange={handleInputChange}
            className={styles.fileInput}
            aria-label="Upload product image"
          />

          <div className={styles.uploadContent}>
            <div className={styles.uploadIcon}>
              <Upload className="w-8 h-8" />
            </div>
            <div className={styles.uploadText}>
              <p className={styles.uploadTitle}>
                Drop image here or click to browse
              </p>
              <p className={styles.uploadSubtext}>
                JPG, PNG or WebP (max {maxSize}MB)
              </p>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className={styles.errorMessage}>
          <span className={styles.errorIcon}>⚠️</span>
          {error}
        </div>
      )}
    </div>
  );
}