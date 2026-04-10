'use client'

import { useRef } from 'react'
import { motion, useScroll, useTransform } from 'framer-motion'
import { useInView } from 'react-intersection-observer'
import CountUp from 'react-countup'
import styles from './Impact.module.css'

export default function Impact() {
  const containerRef = useRef(null)
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end start"]
  })

  const x = useTransform(scrollYProgress, [0, 1], [-100, 100])
  const rotate = useTransform(scrollYProgress, [0, 1], [0, 360])

  const metrics = [
    { value: 340, label: 'First-Year ROI', suffix: '%', color: '#4A90E2' },
    { value: 50, label: 'Reduced Wait Times', suffix: '%', color: '#8B5CF6' },
    { value: 32, label: 'More Customers Served', suffix: '%', color: '#EC4899' }
  ]

  const benefits = [
    'Significantly reduced customer wait times and frustration',
    'Increased customer satisfaction scores by 33%',
    'Optimized staff allocation and resource management',
    'Enhanced overall customer experience and loyalty',
    'Higher revenue through improved customer retention'
  ]

  return (
    <section className={styles.section} ref={containerRef} id="impact">
      <motion.div
        className={styles.decorativeCircle}
        style={{ x, rotate }}
      />

      <div className={styles.impactContent}>
        <MetricsVisual metrics={metrics} />
        <ImpactText benefits={benefits} />
      </div>
    </section>
  )
}

function MetricsVisual({ metrics }) {
  const { ref, inView } = useInView({
    threshold: 0.3,
    triggerOnce: true
  })

  return (
    <div className={styles.impactVisual} ref={ref}>
      {metrics.map((metric, i) => (
        <motion.div
          key={i}
          className={styles.impactMetricCard}
          initial={{ opacity: 0, x: -50, rotateY: -45 }}
          animate={inView ? { opacity: 1, x: 0, rotateY: 0 } : {}}
          transition={{
            duration: 0.8,
            delay: i * 0.2,
            ease: [0.6, 0.05, 0.01, 0.9]
          }}
          whileHover={{
            x: 15,
            scale: 1.02,
            transition: { duration: 0.3 }
          }}
        >
          <motion.div
            className={styles.metricGlow}
            style={{ background: metric.color }}
            animate={{
              opacity: [0.1, 0.3, 0.1],
              scale: [1, 1.1, 1],
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              delay: i * 0.5
            }}
          />

          <div className={styles.metricValue}>
            {inView && (
              <CountUp
                end={metric.value}
                duration={2.5}
                suffix={metric.suffix}
              />
            )}
          </div>
          <div className={styles.metricLabel}>{metric.label}</div>

          <motion.div
            className={styles.metricBar}
            style={{ background: metric.color }}
            initial={{ scaleX: 0 }}
            animate={inView ? { scaleX: 1 } : {}}
            transition={{ duration: 1.5, delay: i * 0.2 + 0.5 }}
          />
        </motion.div>
      ))}
    </div>
  )
}

function ImpactText({ benefits }) {
  const { ref, inView } = useInView({
    threshold: 0.3,
    triggerOnce: true
  })

  return (
    <motion.div
      ref={ref}
      className={styles.impactText}
      initial={{ opacity: 0, x: 50 }}
      animate={inView ? { opacity: 1, x: 0 } : {}}
      transition={{ duration: 0.8 }}
    >
      <span className={styles.sectionLabel}>Proven Results</span>
      <h2>Transform Your Business with Real Impact</h2>
      <p>
        The queue management system market is growing at 12.27% CAGR, projected 
        to reach $69.57B by 2030. Join industry leaders already experiencing 
        transformative results.
      </p>

      <ul className={styles.impactList}>
        {benefits.map((benefit, i) => (
          <motion.li
            key={i}
            initial={{ opacity: 0, x: -20 }}
            animate={inView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.5, delay: i * 0.1 }}
          >
            <motion.div
              className={styles.checkIcon}
              initial={{ scale: 0 }}
              animate={inView ? { scale: 1 } : {}}
              transition={{ 
                duration: 0.5, 
                delay: i * 0.1 + 0.2,
                type: "spring",
                stiffness: 200
              }}
            >
              ✓
            </motion.div>
            {benefit}
          </motion.li>
        ))}
      </ul>
    </motion.div>
  )
}