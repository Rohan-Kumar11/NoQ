// app/buyer/token/[id]/page.jsx - FIXED WITH REAL-TIME UPDATES
'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { supabase } from '@/lib/supabase/client'
import { Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import styles from './Token.module.css'

export default function Token() {
  const router = useRouter()
  const params = useParams()
  const queueId = params.id

  // State
  const [loading, setLoading] = useState(true)
  const [queueData, setQueueData] = useState(null)
  const [storeData, setStoreData] = useState(null)
  const [orderData, setOrderData] = useState(null)
  const [queuePosition, setQueuePosition] = useState(0)
  const [peopleAhead, setPeopleAhead] = useState(0)
  const [currentServingToken, setCurrentServingToken] = useState(null)
  const [estimatedWaitTime, setEstimatedWaitTime] = useState(0)
  const [progress, setProgress] = useState(0)
  
  // COUNTDOWN STATE
  const [countdown, setCountdown] = useState({
    minutes: 0,
    seconds: 0,
    totalSeconds: 0
  })

  // Load initial data
  useEffect(() => {
    if (queueId) {
      loadQueueData()
    }
  }, [queueId])

  // COUNTDOWN TIMER - FIXED
  useEffect(() => {
    if (!queueData?.estimated_time) return

    const calculateCountdown = () => {
      const now = new Date().getTime()
      const estimatedTime = new Date(queueData.estimated_time).getTime()
      const difference = estimatedTime - now

      if (difference > 0) {
        const totalSeconds = Math.floor(difference / 1000)
        const minutes = Math.floor(totalSeconds / 60)
        const seconds = totalSeconds % 60

        setCountdown({
          minutes,
          seconds,
          totalSeconds
        })
      } else {
        setCountdown({
          minutes: 0,
          seconds: 0,
          totalSeconds: 0
        })
      }
    }

    // Calculate immediately
    calculateCountdown()

    // Update every second
    const interval = setInterval(calculateCountdown, 1000)

    return () => clearInterval(interval)
  }, [queueData?.estimated_time])

  // Real-time subscription for QUEUE updates - FIXED
  useEffect(() => {
    if (!queueData?.store_id) return

    console.log('Setting up queue subscription for store:', queueData.store_id)

    const channel = supabase
      .channel('queue-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'queue',
          filter: `store_id=eq.${queueData.store_id}`
        },
        (payload) => {
          console.log('Queue update received:', payload)
          
          // If THIS queue entry was updated
          if (payload.new?.id === queueId) {
            console.log('THIS queue entry updated:', payload.new)
            
            // Update the queue data immediately
            setQueueData(prevData => ({
              ...prevData,
              ...payload.new
            }))

            // Show notification for status changes
            if (payload.new.status !== payload.old?.status) {
              if (payload.new.status === 'in_service') {
                toast.success('🎉 Your order is being prepared!')
              } else if (payload.new.status === 'ready') {
                toast.success('✅ Your order is ready for pickup!', { duration: 5000 })
                playNotificationSound()
              }
            }

            // If wait time was updated, show notification
            if (payload.new.wait_time_minutes !== payload.old?.wait_time_minutes) {
              toast.success(`⏱️ Updated wait time: ${payload.new.wait_time_minutes} minutes`)
            }
          }
          
          // Reload full data to update position
          loadQueueData()
        }
      )
      .subscribe((status) => {
        console.log('Queue subscription status:', status)
      })

    return () => {
      console.log('Cleaning up queue subscription')
      supabase.removeChannel(channel)
    }
  }, [queueData?.store_id, queueId])

  // Real-time subscription for ORDER updates - FIXED
  useEffect(() => {
    if (!orderData?.id) return

    console.log('Setting up order subscription for order:', orderData.id)

    const channel = supabase
      .channel('order-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `id=eq.${orderData.id}`
        },
        (payload) => {
          console.log('Order update received:', payload)
          const newStatus = payload.new.order_status

          // Update order data immediately
          setOrderData(prevData => ({
            ...prevData,
            ...payload.new
          }))

          // Show notifications based on order status
          if (newStatus !== payload.old?.order_status) {
            if (newStatus === 'preparing') {
              toast.success('🎉 Order Accepted! Being prepared...')
            } else if (newStatus === 'ready') {
              toast.success('✅ Your order is ready for pickup!', { duration: 5000 })
              playNotificationSound()
            } else if (newStatus === 'completed') {
              toast.success('Thank you! Order completed.')
            } else if (newStatus === 'cancelled') {
              toast.error('Order was cancelled. Refund will be processed.')
            }
          }

          // Reload data
          loadQueueData()
        }
      )
      .subscribe((status) => {
        console.log('Order subscription status:', status)
      })

    return () => {
      console.log('Cleaning up order subscription')
      supabase.removeChannel(channel)
    }
  }, [orderData?.id])

  // Calculate queue statistics - UPDATED
  useEffect(() => {
    if (queueData && storeData) {
      calculateQueueStats()
    }
  }, [queueData, storeData])

  const loadQueueData = async () => {
    try {
      setLoading(true)

      // Fetch queue entry with related data
      const { data: queue, error: queueError } = await supabase
        .from('queue')
        .select(`
          *,
          stores (
            id,
            store_name,
            store_type,
            address,
            city,
            phone,
            avg_service_time,
            is_open
          )
        `)
        .eq('id', queueId)
        .single()

      if (queueError) {
        console.error('Queue error:', queueError)
        throw queueError
      }
      if (!queue) throw new Error('Queue entry not found')

      console.log('Queue data loaded:', queue)
      setQueueData(queue)
      setStoreData(queue.stores)

      // Fetch associated order
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .select('*')
        .eq('queue_id', queueId)
        .single()

      if (!orderError && order) {
        console.log('Order data loaded:', order)
        setOrderData(order)
      }

      // Calculate queue position
      await calculateQueuePosition(queue)

    } catch (error) {
      console.error('Error loading queue data:', error)
      toast.error('Failed to load token data')
      setTimeout(() => router.push('/buyer'), 2000)
    } finally {
      setLoading(false)
    }
  }

  const calculateQueuePosition = async (queue) => {
    try {
      // Get all waiting/in_service tokens before this one
      const { data: aheadInQueue, error } = await supabase
        .from('queue')
        .select('token_sequence, token_number')
        .eq('store_id', queue.store_id)
        .in('status', ['waiting', 'in_service'])
        .lt('token_sequence', queue.token_sequence)
        .order('token_sequence', { ascending: true })

      if (error) throw error

      const ahead = aheadInQueue?.length || 0
      setPeopleAhead(ahead)
      setQueuePosition(ahead + 1)

      console.log('Queue position calculated:', { ahead, position: ahead + 1 })

      // Get current serving token
      const { data: serving } = await supabase
        .from('queue')
        .select('token_number')
        .eq('store_id', queue.store_id)
        .eq('status', 'in_service')
        .order('token_sequence', { ascending: true })
        .limit(1)
        .single()

      if (serving) {
        setCurrentServingToken(serving.token_number)
        console.log('Current serving token:', serving.token_number)
      }

    } catch (error) {
      console.error('Error calculating position:', error)
    }
  }

  const calculateQueueStats = () => {
    // Use wait_time_minutes from queue data (updated by seller)
    const waitMinutes = queueData?.wait_time_minutes || 0

    setEstimatedWaitTime(waitMinutes)

    // Calculate progress (assuming started at position 10 or current+10)
    const estimatedStartPosition = Math.max(queuePosition + 10, 10)
    const progressPercent = ((estimatedStartPosition - queuePosition) / estimatedStartPosition) * 100
    setProgress(Math.min(Math.max(progressPercent, 0), 100))
  }

  const playNotificationSound = () => {
    try {
      const audio = new Audio('/notification.mp3')
      audio.play().catch(err => console.log('Audio play failed:', err))
    } catch (e) {
      console.log('Notification sound unavailable')
    }
  }

  const handleEnableNotifications = async () => {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission()
      if (permission === 'granted') {
        toast.success('Notifications enabled!')
        new Notification('NoQ Notifications', {
          body: "You'll be notified when your turn is near",
          icon: '/favicon.ico'
        })
      } else {
        toast.error('Notification permission denied')
      }
    } else {
      toast.error('Notifications not supported in this browser')
    }
  }

  const handleDirections = () => {
    if (storeData?.latitude && storeData?.longitude) {
      window.open(
        `https://www.google.com/maps/dir/?api=1&destination=${storeData.latitude},${storeData.longitude}`,
        '_blank'
      )
    } else if (storeData?.address) {
      window.open(
        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(storeData.address + ', ' + storeData.city)}`,
        '_blank'
      )
    } else {
      toast.error('Location not available')
    }
  }

  const handleCancelBooking = async () => {
    if (!confirm('Are you sure you want to cancel this booking? Refund will be processed.')) {
      return
    }

    try {
      // Update queue status
      await supabase
        .from('queue')
        .update({ status: 'cancelled' })
        .eq('id', queueId)

      // Update order if exists
      if (orderData?.id) {
        await supabase
          .from('orders')
          .update({
            order_status: 'cancelled',
            payment_status: 'refund_pending',
            cancelled_at: new Date().toISOString(),
            cancellation_reason: 'Cancelled by customer'
          })
          .eq('id', orderData.id)
      }

      toast.success('Booking cancelled. Refund will be processed.')
      setTimeout(() => router.push('/buyer'), 2000)

    } catch (error) {
      console.error('Error cancelling:', error)
      toast.error('Failed to cancel booking')
    }
  }

  // Get status display info
  const getStatusInfo = () => {
    if (!queueData) return { color: 'blue', text: 'Loading...' }

    switch (queueData.status) {
      case 'waiting':
        return { color: 'blue', text: 'Waiting in Queue' }
      case 'in_service':
        return { color: 'orange', text: 'Being Prepared' }
      case 'ready':
        return { color: 'green', text: 'Ready for Pickup!' }
      case 'completed':
        return { color: 'gray', text: 'Completed' }
      case 'cancelled':
        return { color: 'red', text: 'Cancelled' }
      default:
        return { color: 'blue', text: queueData.status }
    }
  }

  const timeline = [
    {
      id: 1,
      title: 'Token Issued',
      description: `Token generated at ${queueData ? new Date(queueData.issued_at).toLocaleTimeString() : '--'}`,
      icon: '✓',
      completed: true
    },
    {
      id: 2,
      title: 'Waiting in Queue',
      description: queueData?.status === 'waiting' 
        ? `Position: ${queuePosition} | ${peopleAhead} ahead of you`
        : 'In progress...',
      icon: '⏳',
      completed: queueData?.status !== 'waiting'
    },
    {
      id: 3,
      title: 'Order Being Prepared',
      description: queueData?.status === 'in_service' 
        ? 'Your order is being prepared'
        : 'Waiting...',
      icon: '👨‍🍳',
      completed: ['ready', 'completed'].includes(queueData?.status),
      pending: queueData?.status === 'in_service'
    },
    {
      id: 4,
      title: 'Ready for Pickup',
      description: queueData?.status === 'ready' 
        ? '🎉 Please collect your order!'
        : 'Almost there...',
      icon: '✅',
      completed: queueData?.status === 'completed',
      pending: queueData?.status === 'ready'
    }
  ]

  const tips = [
    {
      icon: '📱',
      text: 'Enable notifications to get real-time updates on your queue position'
    },
    {
      icon: '🔊',
      text: "Keep your phone's volume on to hear the notification alert"
    },
    {
      icon: '📄',
      text: 'Have your token number ready when collecting your order'
    },
    {
      icon: '⏰',
      text: 'Arrive 5 minutes before your estimated time to avoid missing your turn'
    }
  ]

  if (loading) {
    return (
      <div className={styles.container} style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh'
      }}>
        <div style={{ textAlign: 'center' }}>
          <Loader2 style={{ 
            width: '3rem', 
            height: '3rem', 
            animation: 'spin 1s linear infinite',
            margin: '0 auto 1rem'
          }} />
          <p>Loading your token...</p>
        </div>
      </div>
    )
  }

  if (!queueData || !storeData) {
    return (
      <div className={styles.container} style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        textAlign: 'center'
      }}>
        <div>
          <h2>Token Not Found</h2>
          <p>Unable to load token data</p>
          <button 
            onClick={() => router.push('/buyer')}
            style={{
              marginTop: '1rem',
              padding: '0.75rem 1.5rem',
              background: '#667eea',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer'
            }}
          >
            Back to Home
          </button>
        </div>
      </div>
    )
  }

  const statusInfo = getStatusInfo()

  return (
    <div className={styles.container}>
      {/* Navigation */}
      <nav className={styles.nav}>
        <motion.div
          className={styles.logo}
          whileHover={{ scale: 1.05 }}
          onClick={() => router.push('/buyer')}
        >
          No<span className={styles.logoAccent}>Q</span>
        </motion.div>
        <div className={styles.navRight}>
          <motion.button
            className={styles.backBtn}
            onClick={() => router.push('/buyer')}
            whileHover={{ x: -3 }}
          >
            <span>←</span>
            <span className={styles.backText}>Back to Home</span>
          </motion.button>
          <div className={styles.userProfile}>
            {queueData.customer_name?.[0]?.toUpperCase() || 'U'}
          </div>
        </div>
      </nav>

      {/* Main Container */}
      <div className={styles.mainContainer}>
        {/* Left Section */}
        <div className={styles.tokenSection}>
          {/* Store Info */}
          <motion.div
            className={styles.storeInfoCard}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className={styles.storeHeader}>
              <div className={styles.storeIcon}>
                {storeData.store_type === 'restaurant' ? '🍽️' : 
                 storeData.store_type === 'retail' ? '🏪' : 
                 storeData.store_type === 'healthcare' ? '🏥' : '🏬'}
              </div>
              <div className={styles.storeDetails}>
                <h2>{storeData.store_name}</h2>
                <div className={styles.storeCategory}>
                  {storeData.store_type} • {storeData.city}
                </div>
              </div>
            </div>
            <div className={styles.storeMeta}>
              <div className={styles.metaItem}>
                <span>📍</span>
                <span>{storeData.address}</span>
              </div>
              {storeData.phone && (
                <div className={styles.metaItem}>
                  <span>📞</span>
                  <span>{storeData.phone}</span>
                </div>
              )}
            </div>
            <div className={styles.statusBadge} style={{
              background: queueData.status === 'ready' 
                ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(16, 185, 129, 0.1))'
                : queueData.status === 'in_service'
                ? 'linear-gradient(135deg, rgba(249, 115, 22, 0.15), rgba(249, 115, 22, 0.1))'
                : 'linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(59, 130, 246, 0.1))'
            }}>
              <div className={styles.statusDot} style={{
                background: queueData.status === 'ready' ? '#10B981' :
                           queueData.status === 'in_service' ? '#F97316' : '#3B82F6'
              }}></div>
              {statusInfo.text}
            </div>
          </motion.div>

          {/* Token Display */}
          <motion.div
            className={styles.tokenDisplay}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <div className={styles.tokenLabel}>Your Token Number</div>
            <motion.div
              className={styles.tokenNumber}
              animate={{ 
                scale: queueData.status === 'ready' ? [1, 1.05, 1] : 1 
              }}
              transition={{ duration: 2, repeat: queueData.status === 'ready' ? Infinity : 0 }}
            >
              {queueData.token_number}
            </motion.div>
            <div className={styles.serviceName}>
              {orderData?.items?.length || 0} Items • ₹{queueData.total_amount?.toFixed(2)}
            </div>
          </motion.div>

          {/* Queue Status */}
          <motion.div
            className={styles.queueStatus}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
          >
            <div className={styles.statusHeader}>
              <h3>Queue Status</h3>
              {currentServingToken && (
                <div className={styles.currentToken}>
                  Now: {currentServingToken}
                </div>
              )}
            </div>

            {/* COUNTDOWN TIMER - ADDED */}
            {countdown.totalSeconds > 0 && queueData.status === 'waiting' && (
              <div style={{
                background: 'linear-gradient(135deg, #667eea, #764ba2)',
                color: 'white',
                padding: '1.5rem',
                borderRadius: '15px',
                textAlign: 'center',
                marginBottom: '1rem'
              }}>
                <div style={{ fontSize: '0.9rem', opacity: 0.9, marginBottom: '0.5rem' }}>
                  Estimated Ready In
                </div>
                <div style={{ fontSize: '2.5rem', fontWeight: 'bold', fontFamily: 'monospace' }}>
                  {String(countdown.minutes).padStart(2, '0')}:{String(countdown.seconds).padStart(2, '0')}
                </div>
                <div style={{ fontSize: '0.85rem', opacity: 0.8, marginTop: '0.5rem' }}>
                  minutes remaining
                </div>
              </div>
            )}

            <div className={styles.queueStats}>
              <div className={styles.statBox}>
                <div className={styles.statLabel}>Ahead of You</div>
                <div className={styles.statValue}>{peopleAhead}</div>
              </div>
              <div className={styles.statBox}>
                <div className={styles.statLabel}>Est. Wait Time</div>
                <div className={`${styles.statValue} ${styles.time}`}>
                  {estimatedWaitTime}m
                </div>
              </div>
            </div>

            {queueData.status === 'waiting' && (
              <div className={styles.progressSection}>
                <div className={styles.progressLabel}>
                  <span>Progress</span>
                  <span>
                    <strong>{Math.round(progress)}%</strong> Complete
                  </span>
                </div>
                <div className={styles.progressBarContainer}>
                  <motion.div
                    className={styles.progressBar}
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
              </div>
            )}

            {queueData.status === 'ready' && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className={styles.readyAlert}
                style={{
                  background: 'linear-gradient(135deg, #10B981, #059669)',
                  color: 'white',
                  padding: '1.5rem',
                  borderRadius: '15px',
                  textAlign: 'center',
                  marginBottom: '1rem',
                  fontWeight: '700',
                  fontSize: '1.1rem'
                }}
              >
                🎉 Your order is ready! Please collect it now!
              </motion.div>
            )}

            <div className={styles.actionButtons}>
              <motion.button
                className={styles.btnPrimary}
                onClick={handleEnableNotifications}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                🔔 Enable Notifications
              </motion.button>
              <motion.button
                className={styles.btnSecondary}
                onClick={handleDirections}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                📍 Directions
              </motion.button>
              {queueData.status === 'waiting' && (
                <motion.button
                  className={styles.btnSecondary}
                  onClick={handleCancelBooking}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  style={{ borderColor: '#EF4444', color: '#EF4444' }}
                >
                  ❌ Cancel Booking
                </motion.button>
              )}
            </div>
          </motion.div>
        </div>

        {/* Right Section */}
        <div className={styles.infoSidebar}>
          {/* Important Notice */}
          <motion.div
            className={styles.notificationBanner}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            <div className={styles.notificationIcon}>⚠️</div>
            <div className={styles.notificationContent}>
              <h4>Please Arrive on Time</h4>
              <p>Tokens may be skipped if you're not present when called</p>
            </div>
          </motion.div>

          {/* Journey Timeline */}
          <motion.div
            className={styles.infoCard}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
          >
            <h3>📋 Your Journey</h3>
            {timeline.map((item) => (
              <div key={item.id} className={styles.timelineItem}>
                <div
                  className={`${styles.timelineIcon} ${
                    item.completed
                      ? styles.completed
                      : item.pending
                      ? styles.pending
                      : ''
                  }`}
                >
                  {item.icon}
                </div>
                <div className={styles.timelineContent}>
                  <h4>{item.title}</h4>
                  <p>{item.description}</p>
                </div>
              </div>
            ))}
          </motion.div>

          {/* Helpful Tips */}
          <motion.div
            className={styles.infoCard}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.5 }}
          >
            <h3>💡 Helpful Tips</h3>
            <div className={styles.tipsList}>
              {tips.map((tip, index) => (
                <div key={index} className={styles.tipItem}>
                  <div className={styles.tipIcon}>{tip.icon}</div>
                  <div className={styles.tipText}>{tip.text}</div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Order Items (if available) */}
          {orderData?.items && orderData.items.length > 0 && (
            <motion.div
              className={styles.infoCard}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.6 }}
            >
              <h3>📦 Your Order</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {orderData.items.map((item, idx) => (
                  <div key={idx} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '0.75rem',
                    background: 'rgba(102, 126, 234, 0.05)',
                    borderRadius: '8px'
                  }}>
                    <span style={{ fontWeight: '500' }}>
                      {item.quantity}x {item.name}
                    </span>
                    <span style={{ color: '#667eea', fontWeight: '600' }}>
                      ₹{(item.price * item.quantity).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  )
}