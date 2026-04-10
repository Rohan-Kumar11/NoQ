// app/seller/profile/page.jsx
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Upload, Camera, MapPin, Phone, Mail, Image as ImageIcon, Save, X, ZoomIn, ZoomOut, Move, Check } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import toast from 'react-hot-toast';
import './SellerProfile.css';

// ─────────────────────────────────────────────────────────────────────────────
// Store types that are queue-only — gallery section is hidden for these.
// Matching is case-insensitive substring check against store_type.
// ─────────────────────────────────────────────────────────────────────────────
const QUEUE_ONLY_STORE_TYPES = [
  'clinic', 'hospital', 'salon', 'saloon', 'spa', 'barbershop',
  'barber', 'parlour', 'beauty parlour', 'dental', 'dentist',
  'doctor', 'pharmacy', 'bank', 'government', 'service center',
  'repair', 'laundry', 'dry cleaning',
];

function isQueueOnlyStore(storeType = '') {
  const lower = storeType.toLowerCase();
  return QUEUE_ONLY_STORE_TYPES.some(t => lower.includes(t));
}

// ─────────────────────────────────────────────────────────────────────────────
// ImageCropper — inline 16:9 crop + zoom modal
//
// The store page renders gallery images at exactly 16:9 (slideshow-container
// has aspect-ratio: 16/9 with object-fit: cover). This cropper enforces that
// same ratio at upload time so what the seller sees in their gallery grid is
// exactly what buyers will see in the store slideshow.
// ─────────────────────────────────────────────────────────────────────────────
function ImageCropper({ imageSrc, onCropComplete, onCancel }) {
  const canvasRef       = useRef(null);
  const containerRef    = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef(null);

  // ── Dimensions: crop frame is always 16:9 ─────────────────────────────────
  const CROP_W = 800;
  const CROP_H = 450; // 800 × 9/16 = 450 — exact 16:9

  const imgRef = useRef(new Image());
  const [imgLoaded, setImgLoaded] = useState(false);

  useEffect(() => {
    const img = imgRef.current;
    img.onload = () => setImgLoaded(true);
    img.src = imageSrc;
  }, [imageSrc]);

  // ── Draw the crop preview on canvas ───────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imgLoaded) return;
    const ctx = canvas.getContext('2d');
    canvas.width  = CROP_W;
    canvas.height = CROP_H;

    const img = imgRef.current;
    const naturalW = img.naturalWidth;
    const naturalH = img.naturalHeight;

    // Base scale: fit the entire image inside the crop frame (cover)
    const scaleBase = Math.max(CROP_W / naturalW, CROP_H / naturalH);
    const scale = scaleBase * zoom;

    const drawW = naturalW * scale;
    const drawH = naturalH * scale;

    // Centre the image then apply pan offset
    const centreX = (CROP_W - drawW) / 2;
    const centreY = (CROP_H - drawH) / 2;

    const drawX = centreX + offset.x;
    const drawY = centreY + offset.y;

    ctx.clearRect(0, 0, CROP_W, CROP_H);
    ctx.drawImage(img, drawX, drawY, drawW, drawH);
  }, [imgLoaded, zoom, offset, CROP_W, CROP_H]);

  useEffect(() => { draw(); }, [draw]);

  // ── Mouse/touch drag ───────────────────────────────────────────────────────
  const onMouseDown = (e) => {
    setDragging(true);
    dragStart.current = {
      x: e.clientX - offset.x,
      y: e.clientY - offset.y,
    };
  };

  const onMouseMove = (e) => {
    if (!dragging || !dragStart.current) return;
    setOffset({
      x: e.clientX - dragStart.current.x,
      y: e.clientY - dragStart.current.y,
    });
  };

  const onMouseUp = () => { setDragging(false); dragStart.current = null; };

  // Touch equivalents
  const onTouchStart = (e) => {
    const t = e.touches[0];
    setDragging(true);
    dragStart.current = { x: t.clientX - offset.x, y: t.clientY - offset.y };
  };

  const onTouchMove = (e) => {
    if (!dragging || !dragStart.current) return;
    const t = e.touches[0];
    setOffset({ x: t.clientX - dragStart.current.x, y: t.clientY - dragStart.current.y });
  };

  // ── Clamp zoom ─────────────────────────────────────────────────────────────
  const changeZoom = (delta) => {
    setZoom(z => Math.min(Math.max(z + delta, 0.5), 3));
  };

  // ── Export the cropped canvas as a Blob ───────────────────────────────────
  const handleConfirm = () => {
    const canvas = canvasRef.current;
    canvas.toBlob(
      (blob) => { if (blob) onCropComplete(blob); },
      'image/jpeg',
      0.92,
    );
  };

  return (
    <div className="cropper-overlay">
      <div className="cropper-modal">
        {/* Header */}
        <div className="cropper-header">
          <div className="cropper-title-group">
            <h3 className="cropper-title">Crop Photo</h3>
            <span className="cropper-badge">16 : 9</span>
          </div>
          <p className="cropper-subtitle">
            Drag to reposition · Zoom to fit · Matches store display
          </p>
        </div>

        {/* Canvas preview */}
        <div className="cropper-canvas-wrap" ref={containerRef}>
          <canvas
            ref={canvasRef}
            className="cropper-canvas"
            style={{ cursor: dragging ? 'grabbing' : 'grab' }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onMouseUp}
          />
          {/* Corner guides */}
          <div className="cropper-corner tl" />
          <div className="cropper-corner tr" />
          <div className="cropper-corner bl" />
          <div className="cropper-corner br" />
          {/* Rule-of-thirds grid */}
          <div className="cropper-grid">
            <div className="cropper-grid-line v1" />
            <div className="cropper-grid-line v2" />
            <div className="cropper-grid-line h1" />
            <div className="cropper-grid-line h2" />
          </div>
        </div>

        {/* Zoom controls */}
        <div className="cropper-zoom-bar">
          <button
            type="button"
            className="cropper-zoom-btn"
            onClick={() => changeZoom(-0.1)}
            title="Zoom out"
          >
            <ZoomOut className="w-5 h-5" />
          </button>

          <div className="cropper-zoom-track">
            <div
              className="cropper-zoom-fill"
              style={{ width: `${((zoom - 0.5) / 2.5) * 100}%` }}
            />
            <input
              type="range"
              min={0.5}
              max={3}
              step={0.01}
              value={zoom}
              onChange={e => setZoom(parseFloat(e.target.value))}
              className="cropper-zoom-slider"
            />
          </div>

          <button
            type="button"
            className="cropper-zoom-btn"
            onClick={() => changeZoom(0.1)}
            title="Zoom in"
          >
            <ZoomIn className="w-5 h-5" />
          </button>

          <span className="cropper-zoom-label">{Math.round(zoom * 100)}%</span>
        </div>

        {/* Action buttons */}
        <div className="cropper-actions">
          <button type="button" className="cropper-btn-cancel" onClick={onCancel}>
            <X className="w-4 h-4" />
            Cancel
          </button>
          <button type="button" className="cropper-btn-confirm" onClick={handleConfirm}>
            <Check className="w-4 h-4" />
            Use This Crop
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────
export default function SellerProfilePage() {
  const router = useRouter();
  const [loading,   setLoading]   = useState(false);
  const [uploading, setUploading] = useState(false);
  const [storeId,   setStoreId]   = useState(null);
  const [formData,  setFormData]  = useState({
    store_name: '', description: '', store_type: '', address: '',
    city: '', state: '', pincode: '', landmark: '', phone: '', email: '', logo_url: ''
  });
  const [galleryImages, setGalleryImages] = useState([]);
  const [previewLogo,   setPreviewLogo]   = useState(null);

  // ── Cropper state ──────────────────────────────────────────────────────────
  // cropQueue: array of { src: dataURL } waiting to be cropped one by one
  // activeCrop: the current image being cropped
  const [cropQueue,   setCropQueue]   = useState([]);
  const [activeCrop,  setActiveCrop]  = useState(null);
  const pendingFiles = useRef([]);   // keeps the raw File objects while cropping

  // Derived: hide the gallery section for queue-only store types
  const hideGallery = isQueueOnlyStore(formData.store_type);

  useEffect(() => { loadStoreProfile(); }, []);

  const loadStoreProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/'); return; }

      const { data, error } = await supabase
        .from('stores').select('*').eq('owner_id', user.id).single();
      if (error) throw error;

      setStoreId(data.id);
      setFormData({
        store_name:  data.store_name  || '',
        description: data.description || '',
        store_type:  data.store_type  || '',
        address:     data.address     || '',
        city:        data.city        || '',
        state:       data.state       || '',
        pincode:     data.pincode     || '',
        landmark:    data.landmark    || '',
        phone:       data.phone       || '',
        email:       data.email       || '',
        logo_url:    data.logo_url    || ''
      });
      setPreviewLogo(data.logo_url);
      if (data.metadata?.gallery) setGalleryImages(data.metadata.gallery);
    } catch (error) {
      console.error('Error loading store profile:', error);
      toast.error('Failed to load store profile');
    }
  };

  // ── Logo upload (unchanged — logos stay square/circle) ────────────────────
  const handleLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Please upload an image file'); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error('Image size should be less than 5MB'); return; }

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `store-logos/${storeId}-logo-${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from('store-images').upload(filePath, file);
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('store-images').getPublicUrl(filePath);
      setFormData(prev => ({ ...prev, logo_url: publicUrl }));
      setPreviewLogo(publicUrl);
      toast.success('Logo uploaded successfully');
    } catch (error) {
      console.error('Error uploading logo:', error);
      toast.error('Failed to upload logo');
    } finally {
      setUploading(false);
    }
  };

  // ── Gallery: open file picker → load files → start crop queue ─────────────
  const handleGallerySelect = (e) => {
    const files = Array.from(e.target.files);
    // reset input so re-selecting same file works
    e.target.value = '';

    if (!files.length) return;

    const remaining = 5 - galleryImages.length;
    if (remaining <= 0) { toast.error('Maximum 5 images already added'); return; }

    const toProcess = files.slice(0, remaining);
    if (files.length > remaining) {
      toast(`Only ${remaining} slot${remaining > 1 ? 's' : ''} remaining — taking first ${remaining}`, { icon: 'ℹ️' });
    }

    // Validate each file before queuing
    const validFiles = toProcess.filter(f => {
      if (!f.type.startsWith('image/')) { toast.error(`${f.name}: not an image`); return false; }
      if (f.size > 5 * 1024 * 1024)    { toast.error(`${f.name}: exceeds 5 MB`);  return false; }
      return true;
    });

    if (!validFiles.length) return;

    // Convert files to data URLs for the cropper, then open queue
    Promise.all(
      validFiles.map(file => new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (ev) => resolve(ev.target.result);
        reader.readAsDataURL(file);
      }))
    ).then(dataUrls => {
      const queue = dataUrls.map((src, i) => ({ src, fileIndex: i }));
      pendingFiles.current = validFiles;
      setCropQueue(queue);
      setActiveCrop(queue[0]);
    });
  };

  // ── Called when user confirms a crop ──────────────────────────────────────
  const handleCropComplete = async (croppedBlob) => {
    setActiveCrop(null);

    // Upload this cropped blob
    setUploading(true);
    try {
      const filePath = `store-galleries/${storeId}-gallery-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from('store-images')
        .upload(filePath, croppedBlob, { contentType: 'image/jpeg' });
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('store-images').getPublicUrl(filePath);
      setGalleryImages(prev => [...prev, publicUrl]);
    } catch (err) {
      console.error('Gallery upload error:', err);
      toast.error('Failed to upload image');
    } finally {
      setUploading(false);
    }

    // Advance to next in queue
    const nextQueue = cropQueue.slice(1);
    setCropQueue(nextQueue);
    if (nextQueue.length > 0) {
      setActiveCrop(nextQueue[0]);
    } else {
      toast.success('Photos added to gallery!');
    }
  };

  // ── Called when user cancels a crop — skip this image, continue queue ─────
  const handleCropCancel = () => {
    setActiveCrop(null);
    const nextQueue = cropQueue.slice(1);
    setCropQueue(nextQueue);
    if (nextQueue.length > 0) {
      setTimeout(() => setActiveCrop(nextQueue[0]), 50);
    }
  };

  const removeGalleryImage = (index) => {
    setGalleryImages(prev => prev.filter((_, i) => i !== index));
  };

  // ── Save ───────────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.store_name || !formData.address || !formData.city || !formData.state || !formData.pincode) {
      toast.error('Please fill in all required fields');
      return;
    }
    setLoading(true);
    try {
      const updateData = {
        store_name:  formData.store_name.trim(),
        description: formData.description?.trim()  || null,
        address:     formData.address.trim(),
        city:        formData.city.trim(),
        state:       formData.state.trim(),
        pincode:     formData.pincode.trim(),
        landmark:    formData.landmark?.trim()  || null,
        phone:       formData.phone?.trim()     || null,
        email:       formData.email?.trim()     || null,
        logo_url:    formData.logo_url          || null,
        updated_at:  new Date().toISOString()
      };

      // Only persist gallery for non-queue-only stores
      if (!hideGallery && galleryImages?.length > 0) {
        updateData.metadata = { gallery: galleryImages };
      }

      const { error } = await supabase.from('stores').update(updateData).eq('id', storeId).select();
      if (error) throw error;

      toast.success('Shop profile updated successfully!');
      setTimeout(() => router.push('/seller/dashboard'), 1000);
    } catch (error) {
      console.error('Error updating store profile:', error);
      if (error.code === 'PGRST204') {
        toast.error('Store not found. Please try logging out and back in.');
      } else {
        toast.error(`Failed to update shop profile: ${error.message || 'Unknown error'}`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="seller-profile-page">
      {/* Cropper modal — rendered outside form flow */}
      {activeCrop && (
        <ImageCropper
          imageSrc={activeCrop.src}
          onCropComplete={handleCropComplete}
          onCancel={handleCropCancel}
        />
      )}

      {/* Header */}
      <div className="profile-header">
        <button className="back-button" onClick={() => router.back()}>
          <ArrowLeft className="w-5 h-5" />
          <span>Back</span>
        </button>
        <h1 className="profile-title">Shop Profile</h1>
        <div className="header-spacer"></div>
      </div>

      {/* Form Container */}
      <div className="profile-container">
        <form onSubmit={handleSubmit} className="profile-form">

          {/* Logo Upload */}
          <div className="profile-section">
            <h2 className="section-title">Shop Logo</h2>
            <div className="logo-upload-area">
              <div className="logo-preview-large">
                {previewLogo ? (
                  <img src={previewLogo} alt="Shop logo" className="logo-image" />
                ) : (
                  <div className="logo-placeholder-large">
                    <Camera className="w-16 h-16 text-gray-400" />
                  </div>
                )}
              </div>
              <div className="logo-upload-info">
                <h3 className="upload-info-title">Upload your shop logo</h3>
                <p className="upload-info-text">
                  Choose a clear, high-quality image that represents your brand.
                  Recommended size: 400×400px
                </p>
                <label className="upload-button-large">
                  <Upload className="w-5 h-5" />
                  {uploading ? 'Uploading...' : 'Choose Image'}
                  <input type="file" accept="image/*" onChange={handleLogoUpload} disabled={uploading} style={{ display: 'none' }} />
                </label>
                <p className="upload-hint">Maximum file size: 5MB</p>
              </div>
            </div>
          </div>

          {/* Basic Information */}
          <div className="profile-section">
            <h2 className="section-title">Basic Information</h2>
            <div className="form-grid-2">
              <div className="form-group">
                <label className="form-label">Shop Name *</label>
                <input
                  type="text" className="form-input"
                  value={formData.store_name}
                  onChange={e => setFormData({ ...formData, store_name: e.target.value })}
                  required maxLength={100} placeholder="Enter your shop name"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Category</label>
                <div className="form-input-readonly">{formData.store_type || 'Not set'}</div>
                <p className="field-note">Category cannot be changed after registration</p>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Description</label>
              <textarea
                className="form-textarea"
                value={formData.description}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
                placeholder="Tell customers about your shop, services, and what makes you special..."
                maxLength={300} rows={5}
              />
              <div className="char-count">{formData.description.length}/300 characters</div>
            </div>
          </div>

          {/* ── Gallery Section — hidden for queue-only store types ────────── */}
          {!hideGallery && (
            <div className="profile-section">
              <h2 className="section-title">Photo Gallery</h2>

              

              {/* Gallery previews (match store's 16:9 display) */}
              <div className="gallery-grid-16-9">
                {galleryImages.map((image, index) => (
                  <div key={index} className="gallery-item-16-9">
                    <img src={image} alt={`Gallery ${index + 1}`} />
                    <button
                      type="button"
                      className="remove-image-btn"
                      onClick={() => removeGalleryImage(index)}
                      title="Remove image"
                    >
                      <X className="w-4 h-4" />
                    </button>
                    <div className="gallery-item-number">{index + 1}</div>
                  </div>
                ))}

                {galleryImages.length < 5 && (
                  <label className={`gallery-upload-box-16-9 ${uploading ? 'uploading' : ''}`}>
                    {uploading ? (
                      <>
                        <div className="gallery-upload-spinner" />
                        <span className="upload-text">Processing…</span>
                      </>
                    ) : (
                      <>
                        <div className="gallery-upload-icon-wrap">
                          <ImageIcon className="w-8 h-8" />
                        </div>
                        <span className="upload-text">Add Photo</span>
                        <span className="upload-subtext">{5 - galleryImages.length} of 5 remaining</span>
                        <span className="upload-hint-small">Will open crop tool</span>
                      </>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleGallerySelect}
                      disabled={uploading || !!activeCrop}
                      style={{ display: 'none' }}
                    />
                  </label>
                )}
              </div>

              {cropQueue.length > 1 && (
                <p className="crop-queue-note">
                  ✂️ Cropping photo {cropQueue.length - (cropQueue.length - 1)} of {cropQueue.length + (galleryImages.length)} — {cropQueue.length - 1} more after this
                </p>
              )}
            </div>
          )}

          {/* Contact Information */}
          <div className="profile-section">
            <h2 className="section-title">Contact Information</h2>
            <div className="form-grid-2">
              <div className="form-group">
                <label className="form-label"><Phone className="w-4 h-4" /> Phone Number</label>
                <input type="tel" className="form-input" value={formData.phone}
                  onChange={e => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+91 98765 43210" />
              </div>
              <div className="form-group">
                <label className="form-label"><Mail className="w-4 h-4" /> Email</label>
                <input type="email" className="form-input" value={formData.email}
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                  placeholder="shop@example.com" />
              </div>
            </div>
          </div>

          {/* Address */}
          <div className="profile-section">
            <h2 className="section-title"><MapPin className="w-5 h-5" /> Address</h2>
            <div className="form-group">
              <label className="form-label">Street Address *</label>
              <input type="text" className="form-input" value={formData.address}
                onChange={e => setFormData({ ...formData, address: e.target.value })}
                required placeholder="Enter your street address" />
            </div>
            <div className="form-grid-3">
              <div className="form-group">
                <label className="form-label">City *</label>
                <input type="text" className="form-input" value={formData.city}
                  onChange={e => setFormData({ ...formData, city: e.target.value })}
                  required placeholder="City" />
              </div>
              <div className="form-group">
                <label className="form-label">State *</label>
                <input type="text" className="form-input" value={formData.state}
                  onChange={e => setFormData({ ...formData, state: e.target.value })}
                  required placeholder="State" />
              </div>
              <div className="form-group">
                <label className="form-label">Pincode *</label>
                <input type="text" className="form-input" value={formData.pincode}
                  onChange={e => setFormData({ ...formData, pincode: e.target.value })}
                  required maxLength={6} placeholder="110001" />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Landmark (Optional)</label>
              <input type="text" className="form-input" value={formData.landmark}
                onChange={e => setFormData({ ...formData, landmark: e.target.value })}
                placeholder="Near famous landmark..." />
            </div>
          </div>

          {/* Submit */}
          <div className="form-actions-large">
            <button type="button" className="btn-cancel-large" onClick={() => router.back()} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn-save-large" disabled={loading || uploading}>
              <Save className="w-5 h-5" />
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}