'use client'

import { useEffect, useRef } from 'react'
import { motion, useScroll, useTransform } from 'framer-motion'
import styles from './Hero.module.css'

export default function Hero() {
  const containerRef = useRef(null)
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end start"]
  })

  const y = useTransform(scrollYProgress, [0, 1], ["0%", "50%"])
  const opacity = useTransform(scrollYProgress, [0, 1], [1, 0])
  const scale = useTransform(scrollYProgress, [0, 1], [1, 0.8])

  const floatingAnimation = {
    y: [0, -20, 0],
    transition: {
      duration: 3,
      repeat: Infinity,
      ease: "easeInOut"
    }
  }

  return (
    <section className={styles.hero} ref={containerRef}>
      <motion.div 
        className={styles.heroContent}
        style={{ y, opacity }}
      >
        <div className={styles.heroText}>
          <motion.span
            className={styles.heroLabel}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            Revolutionizing Customer Experience
          </motion.span>

          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
          >
            No Wait,<br />Only{' '}
            <span className={styles.gradientText}>Satisfaction</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.6 }}
          >
            Transform customer experience with AI-driven queue management. 
            Eliminate physical lines, reduce wait times, and create seamless 
            service experiences that customers love.
          </motion.p>

          <motion.div
            className={styles.heroCtas}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.8 }}
          >
            <motion.a
              href="/get-started"
              className={styles.primaryCta}
              whileHover={{ scale: 1.05, y: -3 }}
              whileTap={{ scale: 0.95 }}
            >
              Get Started
            </motion.a>
            <motion.a
              href="#features"
              className={styles.secondaryCta}
              whileHover={{ x: 10 }}
            >
              Learn More <span>→</span>
            </motion.a>
          </motion.div>

          {/* ⭐ REMOVED: heroStats section with 67%, 78%, 89% */}
        </div>

        <motion.div
          className={styles.heroVisual}
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 1, delay: 0.5 }}
          style={{ scale }}
        >
          <Animated3DQueueBlocks />
        </motion.div>
      </motion.div>

      {/* Animated Background Elements */}
      <motion.div
        className={styles.floatingCircle1}
        animate={floatingAnimation}
      />
      <motion.div
        className={styles.floatingCircle2}
        animate={{
          y: [0, 30, 0],
          transition: {
            duration: 4,
            repeat: Infinity,
            ease: "easeInOut"
          }
        }}
      />
    </section>
  )
}

function Animated3DQueueBlocks() {
  // Queue items WITHOUT names - only position and time
  const queueItems = [
    { 
      position: 'Next in line', 
      time: '2 min', 
      color: 'linear-gradient(135deg, #4A90E2, #5BA3F5)',
      avatarBg: '#4A90E2',
      icon: '🛍️'
    },
    { 
      position: 'Position #2', 
      time: '5 min', 
      color: 'linear-gradient(135deg, #8B5CF6, #A78BFA)',
      avatarBg: '#8B5CF6',
      icon: '☕'
    },
    { 
      position: 'Position #3', 
      time: '8 min', 
      color: 'linear-gradient(135deg, #EC4899, #F472B6)',
      avatarBg: '#EC4899',
      icon: '🎯'
    }
  ]

  return (
    <div className={styles.visualCard}>
      <motion.div
        className={styles.cardGlow}
        animate={{
          opacity: [0.3, 0.6, 0.3],
          scale: [1, 1.05, 1],
        }}
        transition={{
          duration: 3,
          repeat: Infinity,
          ease: "easeInOut"
        }}
      />
      
      {/* 3D Perspective Container */}
      <div className={styles.perspectiveContainer}>
        <div className={styles.queueVisualization}>
          {queueItems.map((item, i) => (
            <motion.div
              key={i}
              className={styles.queueBlock}
              initial={{ 
                opacity: 0, 
                x: -100,
                rotateY: -45,
                z: -100 
              }}
              animate={{ 
                opacity: 1, 
                x: 0,
                rotateY: 0,
                z: 0 
              }}
              transition={{ 
                duration: 0.8, 
                delay: 1 + i * 0.2,
                type: "spring",
                stiffness: 100
              }}
              whileHover={{ 
                x: 15,
                rotateY: 5,
                z: 20,
                transition: { duration: 0.3 } 
              }}
              style={{
                transformStyle: 'preserve-3d',
              }}
            >
              {/* 3D Block Face */}
              <motion.div 
                className={styles.blockFace}
                animate={{
                  boxShadow: [
                    '0 10px 30px rgba(0,0,0,0.1)',
                    '0 20px 40px rgba(0,0,0,0.15)',
                    '0 10px 30px rgba(0,0,0,0.1)'
                  ]
                }}
                transition={{
                  duration: 3,
                  repeat: Infinity,
                  delay: i * 0.4
                }}
              >
                {/* Avatar with 3D effect and Icon - NO NAME */}
                <motion.div
                  className={styles.queueAvatar3D}
                  style={{ background: item.color }}
                  animate={{
                    rotateY: [0, 360],
                    scale: [1, 1.1, 1],
                  }}
                  transition={{
                    rotateY: {
                      duration: 8,
                      repeat: Infinity,
                      ease: "linear",
                      delay: i * 0.5
                    },
                    scale: {
                      duration: 2,
                      repeat: Infinity,
                      repeatType: "reverse",
                      delay: i * 0.3
                    }
                  }}
                >
                  <div className={styles.avatarInner}>
                    <span className={styles.avatarIcon}>{item.icon}</span>
                  </div>
                </motion.div>

                {/* Queue Info - ONLY position and time, NO NAMES */}
                <div className={styles.queueInfo}>
                  <h4>{item.position}</h4>
                  <p>Wait time: {item.time}</p>
                </div>

                {/* Animated Pulse Indicator */}
                <motion.div
                  className={styles.pulseIndicator3D}
                  animate={{
                    scale: [1, 1.4, 1],
                    opacity: [0.6, 1, 0.6],
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    delay: i * 0.4
                  }}
                >
                  <motion.div 
                    className={styles.pulseRing}
                    animate={{
                      scale: [1, 2],
                      opacity: [0.8, 0],
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      delay: i * 0.4
                    }}
                  />
                </motion.div>
              </motion.div>

              {/* 3D Block Side Panels for depth */}
              <div className={styles.blockSide} style={{ background: item.avatarBg }} />
              <div className={styles.blockBottom} style={{ background: item.avatarBg }} />
            </motion.div>
          ))}
        </div>

        {/* Floating 3D Elements */}
        <motion.div
          className={styles.floating3DElement}
          animate={{
            y: [0, -20, 0],
            rotateX: [0, 10, 0],
            rotateY: [0, 180, 360],
          }}
          transition={{
            duration: 6,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />
        
        <motion.div
          className={styles.floating3DElement2}
          animate={{
            y: [0, 20, 0],
            rotateX: [0, -10, 0],
            rotateY: [360, 180, 0],
          }}
          transition={{
            duration: 7,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 1
          }}
        />
      </div>
    </div>
  )
}