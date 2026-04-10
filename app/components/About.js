'use client'

import { useRef } from 'react'
import { motion, useScroll, useTransform } from 'framer-motion'
import { useInView } from 'react-intersection-observer'
import styles from './About.module.css'

export default function About() {
  const containerRef = useRef(null)
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end start"]
  })

  const y = useTransform(scrollYProgress, [0, 1], [50, -50])

  const { ref: headerRef, inView: headerInView } = useInView({
    threshold: 0.3,
    triggerOnce: true
  })

  const teamValues = [
    {
      icon: '🎯',
      title: 'Our Mission',
      description: 'To eliminate waiting time and transform customer experiences through intelligent queue management solutions.'
    },
    {
      icon: '👁️',
      title: 'Our Vision',
      description: 'A world where every customer interaction is seamless, efficient, and stress-free for both businesses and consumers.'
    },
    {
      icon: '💡',
      title: 'Innovation',
      description: 'Constantly pushing boundaries with AI-driven technology to solve real-world problems and improve lives.'
    },
    {
      icon: '🤝',
      title: 'Partnership',
      description: 'Working hand-in-hand with businesses to understand their unique needs and deliver tailored solutions.'
    }
  ]

  return (
    <section 
      className={styles.section} 
      ref={containerRef} 
      id="about"
    >
      <motion.div
        className={styles.sectionHeader}
        ref={headerRef}
        initial={{ opacity: 0, y: 50 }}
        animate={headerInView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.8 }}
      >
        <span className={styles.sectionLabel}>Who We Are</span>
        <h2>Built by Innovators,<br />For Innovators</h2>
        <p>NoQ was created by Team ARRK to revolutionize how businesses manage customer flow and eliminate the frustration of waiting.</p>
      </motion.div>

      {/* ⭐ REMOVED: Stats Grid with 10K+, 50M+, 67%, 4.9/5 */}

      {/* Values Grid */}
      <div className={styles.valuesGrid}>
        {teamValues.map((value, i) => (
          <ValueCard key={i} value={value} index={i} />
        ))}
      </div>

      {/* Team Section */}
      <motion.div
        className={styles.teamSection}
        initial={{ opacity: 0, y: 50 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        viewport={{ once: true }}
        style={{ y }}
      >
        <h3>Meet Team ARRK</h3>
        <p>
          We're a passionate team of developers, designers, and innovators
          dedicated to solving real-world problems with cutting-edge technology. NoQ represents 
          our commitment to making everyday experiences better for everyone.
        </p>
        <div className={styles.teamHighlights}>
          
          <div className={styles.highlight}>
            <span className={styles.highlightIcon}>💻</span>
            <span>Full-Stack Innovation</span>
          </div>
          <div className={styles.highlight}>
            <span className={styles.highlightIcon}>🚀</span>
            <span>Rapid Development</span>
          </div>
        </div>
      </motion.div>

      {/* ⭐ REMOVED: CTA Section "Ready to Transform Your Business?" */}
    </section>
  )
}

function ValueCard({ value, index }) {
  const { ref, inView } = useInView({
    threshold: 0.3,
    triggerOnce: true
  })

  return (
    <motion.div
      ref={ref}
      className={styles.valueCard}
      initial={{ opacity: 0, y: 50, rotateX: -15 }}
      animate={inView ? { opacity: 1, y: 0, rotateX: 0 } : {}}
      transition={{
        duration: 0.6,
        delay: index * 0.1,
        ease: [0.6, 0.05, 0.01, 0.9]
      }}
      whileHover={{ y: -10, transition: { duration: 0.3 } }}
    >
      <div className={styles.valueIcon}>{value.icon}</div>
      <h4>{value.title}</h4>
      <p>{value.description}</p>
    </motion.div>
  )
}