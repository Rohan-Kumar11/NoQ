'use client'

import { motion } from 'framer-motion'
import styles from './Footer.module.css'

export default function Footer() {
  const footerSections = {
    product: ['Features', 'Pricing', 'Integrations', 'Case Studies'],
    company: ['About Us', 'Team', 'Careers', 'Contact'],
    resources: ['Blog', 'Documentation', 'Support', 'Privacy Policy']
  }

  return (
    <footer className={styles.footer}>
      <div className={styles.footerContent}>
        <motion.div
          className={styles.footerBrand}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
        >
          <h3>No<span className={styles.accent}>Q</span></h3>
          <p>
            Revolutionizing customer experience through intelligent queue 
            management. From entry to service completion, we make every 
            interaction seamless.
          </p>
        </motion.div>

        {Object.entries(footerSections).map(([title, links], i) => (
          <motion.div
            key={title}
            className={styles.footerSection}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: i * 0.1 }}
            viewport={{ once: true }}
          >
            <h4>{title.charAt(0).toUpperCase() + title.slice(1)}</h4>
            <ul>
              {links.map((link) => (
                <li key={link}>
                  <a href={`#${link.toLowerCase().replace(' ', '-')}`}>
                    {link}
                  </a>
                </li>
              ))}
            </ul>
          </motion.div>
        ))}
      </div>

      <motion.div
        className={styles.footerBottom}
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.4 }}
        viewport={{ once: true }}
      >
        <p>© 2026 NoQ. All rights reserved. | Designed by team ARRK</p>
      </motion.div>
    </footer>
  )
}