// components/PreparationTimer/PreparationTimer.jsx
'use client';

import { useState, useEffect } from 'react';
import { Clock, AlertCircle, CheckCircle } from 'lucide-react';
import styles from './PreparationTimer.module.css';

/**
 * PreparationTimer Component
 * Displays countdown timer for order preparation
 * Automatically updates and shows status
 */
export default function PreparationTimer({ 
  preparationEndTime, 
  orderStatus,
  orderNumber,
  compact = false 
}) {
  const [timeRemaining, setTimeRemaining] = useState(null);
  const [status, setStatus] = useState('calculating');

  useEffect(() => {
    if (!preparationEndTime) {
      setStatus('no_time');
      return;
    }

    const calculateTimeRemaining = () => {
      const now = new Date();
      const endTime = new Date(preparationEndTime);
      const diff = endTime - now;

      if (diff <= 0) {
        setTimeRemaining({ minutes: 0, seconds: 0, total: 0 });
        setStatus('expired');
        return;
      }

      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);

      setTimeRemaining({ minutes, seconds, total: diff });

      // Set status based on time remaining
      if (minutes <= 2) {
        setStatus('critical');
      } else if (minutes <= 5) {
        setStatus('warning');
      } else {
        setStatus('normal');
      }
    };

    // Initial calculation
    calculateTimeRemaining();

    // Update every second
    const interval = setInterval(calculateTimeRemaining, 1000);

    return () => clearInterval(interval);
  }, [preparationEndTime]);

  // Don't show timer if order is not in preparing status
  if (orderStatus !== 'preparing') {
    return null;
  }

  if (status === 'no_time') {
    return (
      <div className={`${styles.timer} ${styles.noTime}`}>
        <Clock className={styles.icon} />
        <span>No time set</span>
      </div>
    );
  }

  if (!timeRemaining) {
    return (
      <div className={`${styles.timer} ${styles.calculating}`}>
        <Clock className={styles.icon} />
        <span>Calculating...</span>
      </div>
    );
  }

  const getStatusIcon = () => {
    switch (status) {
      case 'expired':
        return <AlertCircle className={styles.icon} />;
      case 'critical':
        return <AlertCircle className={styles.icon} />;
      case 'warning':
        return <Clock className={styles.icon} />;
      default:
        return <Clock className={styles.icon} />;
    }
  };

  const getStatusText = () => {
    if (status === 'expired') {
      return 'Time expired - Auto-transitioning to ready';
    }
    return `${timeRemaining.minutes}:${String(timeRemaining.seconds).padStart(2, '0')}`;
  };

  if (compact) {
    return (
      <div className={`${styles.timerCompact} ${styles[status]}`}>
        {getStatusIcon()}
        <span className={styles.time}>{getStatusText()}</span>
      </div>
    );
  }

  return (
    <div className={`${styles.timer} ${styles[status]}`}>
      <div className={styles.timerHeader}>
        {getStatusIcon()}
        <span className={styles.label}>
          {status === 'expired' ? '⏰ Time Expired' : '⏱️ Time Remaining'}
        </span>
      </div>
      <div className={styles.timerDisplay}>
        <span className={styles.time}>{getStatusText()}</span>
      </div>
      {status === 'expired' && (
        <div className={styles.autoTransitionBadge}>
          <CheckCircle className={styles.checkIcon} />
          <span>Auto-transitioning to ready...</span>
        </div>
      )}
      {status === 'critical' && (
        <div className={styles.warningBadge}>
          ⚠️ Less than 2 minutes left!
        </div>
      )}
    </div>
  );
}