// app/components/CountdownTimer.jsx
'use client';

import { useState, useEffect } from 'react';
import styles from './CountdownTimer.module.css';

export default function CountdownTimer({ 
  initialMinutes = 0, 
  onComplete = () => {},
  size = 'medium',
  showProgress = true 
}) {
  const [timeRemaining, setTimeRemaining] = useState(initialMinutes * 60);
  const [isUrgent, setIsUrgent] = useState(false);

  useEffect(() => {
    setTimeRemaining(initialMinutes * 60);
  }, [initialMinutes]);

  useEffect(() => {
    if (timeRemaining <= 0) {
      onComplete();
      return;
    }

    // Mark as urgent when less than 2 minutes
    setIsUrgent(timeRemaining < 120);

    const timer = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 0) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timeRemaining, onComplete]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getProgressPercentage = () => {
    const total = initialMinutes * 60;
    if (total === 0) return 0;
    return ((total - timeRemaining) / total) * 100;
  };

  const sizeClasses = {
    small: styles.small,
    medium: styles.medium,
    large: styles.large
  };

  return (
    <div className={`${styles.timer} ${sizeClasses[size]} ${isUrgent ? styles.urgent : ''}`}>
      <div className={styles.timeDisplay}>
        <div className={styles.icon}>⏱️</div>
        <div className={styles.time}>{formatTime(timeRemaining)}</div>
      </div>
      
      {showProgress && (
        <div className={styles.progressBar}>
          <div 
            className={styles.progressFill}
            style={{ width: `${getProgressPercentage()}%` }}
          />
        </div>
      )}
      
      {isUrgent && timeRemaining > 0 && (
        <div className={styles.urgentBadge}>
          🔔 Almost your turn!
        </div>
      )}
    </div>
  );
}