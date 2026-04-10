'use client'

import Navigation from './components/Navigation'
import Hero from './components/Hero'
import Features from './components/Features'
import HowItWorks from './components/HowItWorks'
import Impact from './components/Impact'
import About from './components/About'  // ⭐ Make sure this is imported
import CTA from './components/CTA'
import Footer from './components/Footer'

export default function Home() {
  return (
    <main>
      <Navigation />                                        
      <Hero />
      <Features />
      <HowItWorks />
      <Impact />
      <About />  {/* ⭐ Make sure this is here */}
      <Footer />
    </main>
  )
}