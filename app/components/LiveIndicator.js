// app/components/LiveIndicator.jsx
'use client';

import { useState, useEffect } from 'react';
import styles from './LiveIndicator.module.css';

export default function LiveIndicator({ isConnected = true, label = 'Live Updates' }) {
  const [pulse, setPulse] = useState(true);

  useEffect(() => {
    if (isConnected) {
      const interval = setInterval(() => {
        setPulse(prev => !prev);
      }, 1500);
      return () => clearInterval(interval);
    }
  }, [isConnected]);

  return (
    <div className={`${styles.indicator} ${isConnected ? styles.connected : styles.disconnected}`}>
      <div className={`${styles.dot} ${pulse && isConnected ? styles.pulse : ''}`} />
      <span className={styles.label}>
        {isConnected ? label : 'Reconnecting...'}
      </span>
    </div>
  );
}