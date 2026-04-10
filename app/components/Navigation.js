'use client'

import { useState, useEffect } from 'react'
import { motion, useScroll, useTransform } from 'framer-motion'
import Image from 'next/image'
import styles from './Navigation.module.css'

export default function Navigation() {
  const [isScrolled, setIsScrolled] = useState(false)
  const [activeSection, setActiveSection] = useState('')
  const { scrollY } = useScroll()
  const backgroundColor = useTransform(
    scrollY,
    [0, 100],
    ['rgba(250, 250, 250, 0.0)', 'rgba(250, 250, 250, 0.95)']
  )

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50)

      // Detect active section
      const sections = ['features', 'how-it-works', 'impact', 'about']
      const current = sections.find(section => {
        const element = document.getElementById(section)
        if (element) {
          const rect = element.getBoundingClientRect()
          return rect.top <= 150 && rect.bottom >= 150
        }
        return false
      })
      
      if (current) setActiveSection(current)
    }
    
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // ⭐ THIS IS THE KEY FIX - Proper scroll function
  const scrollToSection = (sectionId) => {
    const element = document.getElementById(sectionId)
    if (element) {
      const offset = 100 // Adjust this if needed (navigation height + padding)
      const elementPosition = element.getBoundingClientRect().top
      const offsetPosition = elementPosition + window.pageYOffset - offset

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      })
    }
  }

  const navVariants = {
    hidden: { y: -100, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: {
        duration: 0.8,
        ease: [0.6, 0.05, 0.01, 0.9]
      }
    }
  }

  const linkVariants = {
    initial: { opacity: 0, y: -20 },
    animate: (i) => ({
      opacity: 1,
      y: 0,
      transition: {
        delay: 0.1 * i,
        duration: 0.5,
        ease: [0.6, 0.05, 0.01, 0.9]
      }
    })
  }

  const navItems = [
    { label: 'Features', id: 'features' },
    { label: 'How It Works', id: 'how-it-works' },
    { label: 'Impact', id: 'impact' },
    { label: 'About', id: 'about' }
  ]

  return (
    <motion.header
      className={styles.header}
      style={{ backgroundColor }}
      variants={navVariants}
      initial="hidden"
      animate="visible"
    >
      <nav className={styles.nav}>
        <motion.a 
          href="/"
          className={styles.logoLink}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <Image
            src="/noq-logo_1.svg"
            alt="NoQ Logo"
            width={210}
            height={55}
            className={styles.logoImage}
            priority
          />
        </motion.a>
        
        <ul className={styles.navLinks}>
          {navItems.map((item, i) => (
            <motion.li
              key={item.id}
              custom={i}
              variants={linkVariants}
              initial="initial"
              animate="animate"
            >
              {/* ⭐ CHANGED: Using button with onClick instead of <a> tag */}
              <button
                onClick={() => scrollToSection(item.id)}
                className={`${styles.navLink} ${activeSection === item.id ? styles.active : ''}`}
              >
                {item.label}
              </button>
            </motion.li>
          ))}
        </ul>

        <motion.a
          href="/get-started"
          className={styles.contactBtn}
          whileHover={{ scale: 1.05, y: -2 }}
          whileTap={{ scale: 0.95 }}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.6, duration: 0.5 }}
        >
          Get Started
        </motion.a>
      </nav>
    </motion.header>
  )
}