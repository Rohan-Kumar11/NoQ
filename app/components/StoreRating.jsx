'use client';

import { useState, useEffect } from 'react';
import { Star, X, Loader2 } from 'lucide-react';
import { getUserStoreRating, upsertStoreRating, deleteStoreRating } from '@/lib/api/ratings';
import toast from 'react-hot-toast';
import styles from './StoreRating.module.css';

/**
 * StoreRating Component
 * - Display-only mode: shows average rating with half stars
 * - Interactive mode: allows user to rate
 */
export default function StoreRating({ 
  storeId, 
  storeName,
  currentUserId,
  averageRating = 0, 
  totalRatings = 0,
  size = 'medium',
  interactive = false,
  showCount = true,
  onRatingChange = null
}) {
  const [userRating, setUserRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [selectedRating, setSelectedRating] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Load user's existing rating
  useEffect(() => {
    if (interactive && currentUserId && storeId) {
      console.log('🎯 StoreRating mounted:', { storeId, storeName, currentUserId, averageRating });
      loadUserRating();
    }
  }, [interactive, currentUserId, storeId]);

  const loadUserRating = async () => {
    setLoading(true);
    try {
      console.log('📖 Loading user rating for:', { storeId, currentUserId });
      const { data, error } = await getUserStoreRating(currentUserId, storeId);
      
      if (error) {
        console.error('❌ Error loading rating:', error);
      }
      
      if (data) {
        console.log('✅ User already rated this store:', data.rating);
        setUserRating(data.rating);
        setSelectedRating(data.rating);
      } else {
        console.log('ℹ️ User has not rated this store yet');
        setUserRating(0);
        setSelectedRating(0);
      }
    } catch (error) {
      console.error('💥 Exception loading user rating:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStarClick = (rating) => {
    if (!interactive || !currentUserId) return;
    
    console.log('⭐ Star clicked:', rating);
    setSelectedRating(rating);
    setHoverRating(rating);
    setShowModal(true);
  };

  const handleSubmitRating = async () => {
    const ratingToSubmit = selectedRating || hoverRating;
    
    console.log('📝 Submitting rating:', {
      storeId,
      storeName,
      currentUserId,
      ratingToSubmit,
      previousRating: userRating
    });

    if (!currentUserId) {
      toast.error('Please login to rate');
      console.error('❌ No user ID');
      return;
    }

    if (!storeId) {
      toast.error('Store ID missing');
      console.error('❌ No store ID');
      return;
    }

    if (ratingToSubmit === 0) {
      toast.error('Please select a rating');
      console.error('❌ No rating selected');
      return;
    }

    setSubmitting(true);
    try {
      console.log('💾 Calling upsertStoreRating...');
      const { data, error } = await upsertStoreRating({
        userId: currentUserId,
        storeId: storeId,
        rating: ratingToSubmit
      });

      if (error) {
        console.error('❌ Error from upsertStoreRating:', error);
        throw new Error(error);
      }

      console.log('✅ Rating saved successfully:', data);
      setUserRating(ratingToSubmit);
      setShowModal(false);
      
      const message = userRating > 0 
        ? `Rating updated to ${ratingToSubmit} stars!` 
        : `Thank you for rating ${storeName}!`;
      
      toast.success(message);

      // Notify parent component
      if (onRatingChange) {
        console.log('📢 Notifying parent of rating change');
        onRatingChange(ratingToSubmit);
      }

      // Reload page to update store rating
      console.log('🔄 Reloading page in 1 second...');
      setTimeout(() => {
        window.location.reload();
      }, 1000);

    } catch (error) {
      console.error('💥 Error submitting rating:', error);
      toast.error(`Failed to submit rating: ${error.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteRating = async () => {
    if (!currentUserId || !storeId || userRating === 0) return;

    if (!confirm('Are you sure you want to remove your rating?')) {
      return;
    }

    console.log('🗑️ Deleting rating:', { storeId, currentUserId });
    setSubmitting(true);
    try {
      const { error } = await deleteStoreRating(currentUserId, storeId);

      if (error) {
        console.error('❌ Error deleting rating:', error);
        throw new Error(error);
      }

      console.log('✅ Rating deleted successfully');
      setUserRating(0);
      setSelectedRating(0);
      setShowModal(false);
      
      toast.success('Rating removed successfully');

      if (onRatingChange) {
        onRatingChange(0);
      }

      setTimeout(() => {
        window.location.reload();
      }, 1000);

    } catch (error) {
      console.error('💥 Error deleting rating:', error);
      toast.error(`Failed to remove rating: ${error.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleModalStarClick = (rating) => {
    console.log('🎯 Modal star clicked:', rating);
    setSelectedRating(rating);
    setHoverRating(rating);
  };

  const renderStars = (rating, isInteractive = false) => {
    const stars = [];
    const displayRating = isInteractive 
      ? (hoverRating || selectedRating || userRating) 
      : rating;

    console.log('🌟 Rendering stars for rating:', displayRating);

    for (let i = 1; i <= 5; i++) {
      const isFilled = i <= Math.floor(displayRating);
      const isHalf = !isFilled && i === Math.ceil(displayRating) && displayRating % 1 !== 0;

      console.log(`Star ${i}:`, { isFilled, isHalf, displayRating });

      stars.push(
        <button
          key={i}
          type="button"
          className={`${styles.star} ${styles[size]} ${isFilled ? styles.filled : ''} ${isHalf ? styles.half : ''} ${isInteractive ? styles.interactive : ''}`}
          onClick={() => isInteractive && handleModalStarClick(i)}
          onMouseEnter={() => isInteractive && setHoverRating(i)}
          onMouseLeave={() => isInteractive && setHoverRating(selectedRating)}
          disabled={!isInteractive || loading}
        >
          <div className={styles.starContainer}>
            <Star 
              className={`${styles.starIcon} ${styles.starOutline}`}
              fill="none"
              strokeWidth={2}
            />
            <Star 
              className={`${styles.starIcon} ${styles.starFill} ${isFilled ? styles.fullFill : ''} ${isHalf ? styles.halfFill : ''}`}
              fill="currentColor"
              strokeWidth={0}
            />
          </div>
        </button>
      );
    }

    return stars;
  };

  return (
    <>
      <div className={`${styles.ratingContainer} ${styles[size]}`}>
        <div className={styles.starsWrapper}>
          {loading ? (
            <Loader2 className={styles.loader} />
          ) : (
            renderStars(averageRating, false)
          )}
        </div>

        {showCount && totalRatings > 0 && (
          <span className={styles.ratingText}>
            {averageRating.toFixed(1)} ({totalRatings})
          </span>
        )}

        {interactive && currentUserId && !loading && (
          <button
            onClick={() => {
              console.log('🔘 Rate button clicked');
              setSelectedRating(userRating);
              setShowModal(true);
            }}
            className={styles.rateButton}
          >
            {userRating > 0 ? `Update Rating (${userRating}★)` : 'Rate Store'}
          </button>
        )}
      </div>

      {/* Rating Modal */}
      {showModal && (
        <div className={styles.modalOverlay} onClick={() => {
          if (!submitting) {
            console.log('✖️ Modal closed');
            setShowModal(false);
            setSelectedRating(userRating);
            setHoverRating(0);
          }
        }}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <button
              className={styles.modalClose}
              onClick={() => {
                setShowModal(false);
                setSelectedRating(userRating);
                setHoverRating(0);
              }}
              disabled={submitting}
            >
              <X className="w-5 h-5" />
            </button>

            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>
                {userRating > 0 ? 'Update Your Rating' : 'Rate This Store'}
              </h3>
              <p className={styles.modalSubtitle}>{storeName}</p>
            </div>

            <div className={styles.modalStars}>
              {renderStars(averageRating, true)}
            </div>

            <p className={styles.modalHint}>
              {(selectedRating || hoverRating) === 0 && 'Click on a star to rate'}
              {(selectedRating || hoverRating) === 1 && '⭐ Poor'}
              {(selectedRating || hoverRating) === 2 && '⭐⭐ Fair'}
              {(selectedRating || hoverRating) === 3 && '⭐⭐⭐ Good'}
              {(selectedRating || hoverRating) === 4 && '⭐⭐⭐⭐ Very Good'}
              {(selectedRating || hoverRating) === 5 && '⭐⭐⭐⭐⭐ Excellent'}
            </p>

            <div className={styles.modalActions}>
              {userRating > 0 && (
                <button
                  onClick={handleDeleteRating}
                  className={`${styles.modalButton} ${styles.deleteButton}`}
                  disabled={submitting}
                >
                  {submitting ? (
                    <>
                      <Loader2 className={styles.buttonLoader} />
                      Removing...
                    </>
                  ) : (
                    'Remove Rating'
                  )}
                </button>
              )}

              <button
                onClick={handleSubmitRating}
                className={`${styles.modalButton} ${styles.submitButton}`}
                disabled={submitting || (selectedRating === 0 && hoverRating === 0)}
              >
                {submitting ? (
                  <>
                    <Loader2 className={styles.buttonLoader} />
                    Submitting...
                  </>
                ) : (
                  userRating > 0 ? 'Update Rating' : 'Submit Rating'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}