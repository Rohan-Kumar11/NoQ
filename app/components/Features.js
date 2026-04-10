'use client'

import { useRef } from 'react'
import { motion, useScroll, useTransform } from 'framer-motion'
import { useInView } from 'react-intersection-observer'
import styles from './Features.module.css'

export default function Features() {
  const containerRef = useRef(null)
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end start"]
  })

  const backgroundY = useTransform(scrollYProgress, [0, 1], ["0%", "100%"])

  const features = [
    {
      icon: '📱',
      title: 'Multi-Channel Access',
      description: 'Customers join queues via mobile app, web browser, QR codes, or self-service kiosks—maximum flexibility for everyone.',
      gradient: 'linear-gradient(135deg, #4A90E2, #5BA3F5)'
    },
    {
      icon: '☁️',
      title: 'Cloud-Based Platform',
      description: 'Robust, scalable infrastructure with secure database management that grows seamlessly with your business needs.',
      gradient: 'linear-gradient(135deg, #8B5CF6, #A78BFA)'
    },
    {
      icon: '🔔',
      title: 'Instant Notifications',
      description: 'Automated SMS and push alerts keep customers informed, engaged, and arriving at exactly the right time.',
      gradient: 'linear-gradient(135deg, #EC4899, #F472B6)'
    },
    {
      icon: '📊',
      title: 'Real-Time Analytics',
      description: 'Live dashboards provide actionable insights into queue performance, customer behavior, and operational metrics.',
      gradient: 'linear-gradient(135deg, #10B981, #34D399)'
    },
    {
      icon: '🔗',
      title: 'Easy Integration',
      description: 'Seamless API integration with existing CRM, ERP, and POS systems—minimal setup, maximum compatibility.',
      gradient: 'linear-gradient(135deg, #F59E0B, #FBBF24)'
    },
    {
      icon: '🌐',
      title: 'Enterprise Scalable',
      description: 'Cloud architecture scales effortlessly from small businesses to large enterprises across multiple locations.',
      gradient: 'linear-gradient(135deg, #6366F1, #818CF8)'
    }
  ]

  return (
    <section className={styles.section} ref={containerRef} id="features">
      <motion.div
        className={styles.backgroundPattern}
        style={{ y: backgroundY }}
      />

      <SectionHeader />

      <div className={styles.featuresGrid}>
        {features.map((feature, i) => (
          <FeatureCard key={i} feature={feature} index={i} />
        ))}
      </div>

      {/* Floating Particles */}
      <FloatingParticles />
    </section>
  )
}

function SectionHeader() {
  const { ref, inView } = useInView({
    threshold: 0.3,
    triggerOnce: true
  })

  return (
    <motion.div
      ref={ref}
      className={styles.sectionHeader}
      initial={{ opacity: 0, y: 50 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.8 }}
    >
      <span className={styles.sectionLabel}>Why Choose NoQ</span>
      <h2>Powerful Features for<br />Modern Businesses</h2>
      <p>Everything you need to revolutionize customer flow and operational efficiency.</p>
    </motion.div>
  )
}

function FeatureCard({ feature, index }) {
  const { ref, inView } = useInView({
    threshold: 0.3,
    triggerOnce: true
  })

  return (
    <motion.div
      ref={ref}
      className={styles.featureCard}
      initial={{ opacity: 0, y: 50, scale: 0.9 }}
      animate={inView ? { opacity: 1, y: 0, scale: 1 } : {}}
      transition={{
        duration: 0.6,
        delay: index * 0.1,
        ease: [0.6, 0.05, 0.01, 0.9]
      }}
      whileHover={{ 
        y: -15,
        transition: { duration: 0.3 }
      }}
    >
      <motion.div
        className={styles.cardGlow}
        style={{ background: feature.gradient }}
        initial={{ opacity: 0 }}
        whileHover={{ opacity: 0.15 }}
        transition={{ duration: 0.3 }}
      />

      <motion.div
        className={styles.iconContainer}
        whileHover={{ 
          rotate: [0, -10, 10, -10, 0],
          scale: 1.1
        }}
        transition={{ duration: 0.5 }}
      >
        <span className={styles.featureIcon}>{feature.icon}</span>
      </motion.div>

      <h3>{feature.title}</h3>
      <p>{feature.description}</p>

      <motion.div
        className={styles.hoverIndicator}
        style={{ background: feature.gradient }}
        initial={{ scaleX: 0 }}
        whileHover={{ scaleX: 1 }}
        transition={{ duration: 0.4 }}
      />
    </motion.div>
  )
}

function FloatingParticles() {
  return (
    <div className={styles.particlesContainer}>
      {[...Array(6)].map((_, i) => (
        <motion.div
          key={i}
          className={styles.particle}
          animate={{
            y: [0, -30, 0],
            x: [0, Math.random() * 20 - 10, 0],
            opacity: [0.3, 0.6, 0.3],
          }}
          transition={{
            duration: 3 + i * 0.5,
            repeat: Infinity,
            delay: i * 0.3,
            ease: "easeInOut"
          }}
          style={{
            left: `${15 + i * 15}%`,
            top: `${20 + (i % 3) * 25}%`,
          }}
        />
      ))}
    </div>
  )
}