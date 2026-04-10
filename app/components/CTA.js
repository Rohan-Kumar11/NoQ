'use client'

import { useState, useRef } from 'react'
import { motion, useScroll, useTransform } from 'framer-motion'
import { useInView } from 'react-intersection-observer'
import styles from './CTA.module.css'

export default function CTA() {
  const containerRef = useRef(null)
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end start"]
  })

  const scale = useTransform(scrollYProgress, [0, 0.5, 1], [0.8, 1, 0.8])
  const opacity = useTransform(scrollYProgress, [0, 0.5, 1], [0.3, 1, 0.3])

  return (
    <section className={styles.section} ref={containerRef}>
      <motion.div
        className={styles.backgroundGlow}
        style={{ scale, opacity }}
        animate={{
          background: [
            'radial-gradient(circle, rgba(74, 144, 226, 0.2) 0%, transparent 70%)',
            'radial-gradient(circle, rgba(139, 92, 246, 0.2) 0%, transparent 70%)',
            'radial-gradient(circle, rgba(74, 144, 226, 0.2) 0%, transparent 70%)',
          ]
        }}
        transition={{ duration: 5, repeat: Infinity }}
      />

      <CTAContent />
    </section>
  )
}

function CTAContent() {
  const { ref, inView } = useInView({
    threshold: 0.3,
    triggerOnce: true
  })

  return (
    <motion.div
      ref={ref}
      className={styles.ctaContent}
      initial={{ opacity: 0, y: 50 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.8 }}
    >
      <motion.h2
        initial={{ opacity: 0, y: 30 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.6, delay: 0.2 }}
      >
        Ready to Eliminate<br />the Wait?
      </motion.h2>

      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.6, delay: 0.4 }}
      >
        Join forward-thinking businesses across retail, healthcare, food & 
        beverage, and government services who are revolutionizing customer 
        experience with NoQ.
      </motion.p>

      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={inView ? { opacity: 1, scale: 1 } : {}}
        transition={{ duration: 0.6, delay: 0.6 }}
      >
        <MagneticButton />
      </motion.div>

      <AnimatedLogos />
    </motion.div>
  )
}

function MagneticButton() {
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const buttonRef = useRef(null)

  const handleMouseMove = (e) => {
    if (!buttonRef.current) return
    
    const rect = buttonRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left - rect.width / 2
    const y = e.clientY - rect.top - rect.height / 2
    
    setPosition({ x: x * 0.3, y: y * 0.3 })
  }

  const handleMouseLeave = () => {
    setPosition({ x: 0, y: 0 })
  }

  return (
    <motion.a
      ref={buttonRef}
      href="/get-started"
      className={styles.ctaButton}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      animate={{ x: position.x, y: position.y }}
      transition={{ type: "spring", stiffness: 150, damping: 15 }}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
    >
      <motion.span
        className={styles.buttonGlow}
        animate={{
          opacity: [0.5, 1, 0.5],
          scale: [1, 1.2, 1],
        }}
        transition={{ duration: 2, repeat: Infinity }}
      />
      Get Your Free Demo
    </motion.a>
  )
}

function AnimatedLogos() {
  const logos = ['Retail', 'Healthcare', 'F&B', 'Government', 'Banking', 'Hospitality']

  return (
    <motion.div
      className={styles.logoScroll}
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      transition={{ duration: 0.8, delay: 0.8 }}
      viewport={{ once: true }}
    >
      <div className={styles.logoTrack}>
        {[...logos, ...logos].map((logo, i) => (
          <motion.div
            key={i}
            className={styles.logoItem}
            animate={{
              x: [0, -100 * logos.length],
            }}
            transition={{
              duration: 20,
              repeat: Infinity,
              ease: "linear",
            }}
          >
            {logo}
          </motion.div>
        ))}
      </div>
    </motion.div>
  )
}