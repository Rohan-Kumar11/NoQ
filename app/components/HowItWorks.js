'use client'

import { useRef } from 'react'
import { motion, useScroll, useTransform } from 'framer-motion'
import { useInView } from 'react-intersection-observer'
import styles from './HowItWorks.module.css'

export default function HowItWorks() {
  const containerRef = useRef(null)
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end start"]
  })

  const y = useTransform(scrollYProgress, [0, 1], [100, -100])

  const { ref: headerRef, inView: headerInView } = useInView({
    threshold: 0.3,
    triggerOnce: true
  })

  const steps = [
    {
      number: '01',
      title: 'Customer Check-In',
      description: 'Join the queue instantly via smartphone app, kiosk, QR code scan, or website—giving customers total flexibility.',
      icon: '📱',
      color: '#4A90E2'
    },
    {
      number: '02',
      title: 'Real-Time Updates',
      description: 'Live tracking system monitors queue position and provides accurate wait time estimates with intelligent algorithms.',
      icon: '⏱️',
      color: '#8B5CF6'
    },
    {
      number: '03',
      title: 'Smart Notifications',
      description: 'SMS and app alerts notify customers 2-3 minutes before their turn, optimizing arrival timing perfectly.',
      icon: '🔔',
      color: '#EC4899'
    },
    {
      number: '04',
      title: 'Seamless Service',
      description: 'Customers arrive exactly when needed, eliminating wait time and creating a smooth, stress-free experience.',
      icon: '✓',
      color: '#10B981'
    }
  ]

  return (
    <section 
      className={styles.section} 
      ref={containerRef} 
      id="how-it-works"  // ⭐ THIS IS CRITICAL - Must match navigation exactly
    >
      <motion.div
        className={styles.sectionHeader}
        ref={headerRef}
        initial={{ opacity: 0, y: 50 }}
        animate={headerInView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.8 }}
      >
        <span className={styles.sectionLabel}>The Solution</span>
        <h2>Seamless from<br />Start to Finish</h2>
        <p>Our intelligent system transforms the entire customer journey, making every touchpoint effortless and efficient.</p>
      </motion.div>

      <div className={styles.stepsGrid}>
        {steps.map((step, i) => (
          <StepCard key={i} step={step} index={i} />
        ))}
      </div>

      {/* Animated Connection Line */}
      <motion.svg
        className={styles.connectionLine}
        viewBox="0 0 1200 400"
        style={{ y }}
      >
        <motion.path
          d="M 0 200 Q 300 50, 600 200 T 1200 200"
          fill="none"
          stroke="url(#gradient)"
          strokeWidth="2"
          strokeDasharray="10 5"
          initial={{ pathLength: 0 }}
          whileInView={{ pathLength: 1 }}
          transition={{ duration: 2, ease: "easeInOut" }}
          viewport={{ once: true }}
        />
        <defs>
          <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#4A90E2" />
            <stop offset="50%" stopColor="#8B5CF6" />
            <stop offset="100%" stopColor="#EC4899" />
          </linearGradient>
        </defs>
      </motion.svg>
    </section>
  )
}

function StepCard({ step, index }) {
  const { ref, inView } = useInView({
    threshold: 0.3,
    triggerOnce: true
  })

  return (
    <motion.div
      ref={ref}
      className={styles.stepCard}
      initial={{ opacity: 0, y: 50, rotateX: -15 }}
      animate={inView ? { opacity: 1, y: 0, rotateX: 0 } : {}}
      transition={{
        duration: 0.6,
        delay: index * 0.15,
        ease: [0.6, 0.05, 0.01, 0.9]
      }}
      whileHover={{ 
        y: -10, 
        transition: { duration: 0.3 } 
      }}
    >
      <motion.div
        className={styles.iconWrapper}
        style={{ background: step.color }}
        whileHover={{ rotate: 360, scale: 1.1 }}
        transition={{ duration: 0.6 }}
      >
        <span className={styles.stepIcon}>{step.icon}</span>
      </motion.div>

      <motion.span
        className={styles.stepNumber}
        initial={{ scale: 0 }}
        animate={inView ? { scale: 1 } : {}}
        transition={{ duration: 0.5, delay: index * 0.15 + 0.2 }}
      >
        {step.number}
      </motion.span>

      <h3>{step.title}</h3>
      <p>{step.description}</p>

      <motion.div
        className={styles.progressBar}
        initial={{ scaleX: 0 }}
        animate={inView ? { scaleX: 1 } : {}}
        transition={{ duration: 1, delay: index * 0.15 + 0.3 }}
        style={{ background: step.color }}
      />
    </motion.div>
  )
}