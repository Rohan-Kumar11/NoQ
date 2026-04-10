// hooks/useToast.js
'use client'

import { useState, useCallback } from 'react'

export function useToast() {
  const [toast, setToast] = useState({
    isVisible: false,
    message: '',
    type: 'info',
    duration: 5000
  })

  const showToast = useCallback(({ message, type = 'info', duration = 5000 }) => {
    setToast({
      isVisible: true,
      message,
      type,
      duration
    })
  }, [])

  const hideToast = useCallback(() => {
    setToast(prev => ({
      ...prev,
      isVisible: false
    }))
  }, [])

  // Convenience methods
  const success = useCallback((message, duration) => {
    showToast({ message, type: 'success', duration })
  }, [showToast])

  const error = useCallback((message, duration) => {
    showToast({ message, type: 'error', duration })
  }, [showToast])

  const warning = useCallback((message, duration) => {
    showToast({ message, type: 'warning', duration })
  }, [showToast])

  const info = useCallback((message, duration) => {
    showToast({ message, type: 'info', duration })
  }, [showToast])

  return {
    toast,
    showToast,
    hideToast,
    success,
    error,
    warning,
    info
  }
}