'use client'
import { useRef, useEffect, useCallback } from 'react'

/**
 * Плавный свайп вниз для закрытия bottom sheet.
 * Использует нативные слушатели с passive:false чтобы перехватить скролл.
 */
export function useSwipeDown(isOpen: boolean, onClose: () => void, threshold = 80) {
  const sheetRef  = useRef<HTMLDivElement>(null)
  const startY    = useRef(0)
  const dragging  = useRef(false)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  const handleStart = useCallback((e: TouchEvent) => {
    startY.current  = e.touches[0].clientY
    dragging.current = false
    const el = sheetRef.current
    if (el) {
      el.style.transition = 'none'
      el.style.willChange = 'transform'
    }
  }, [])

  const handleMove = useCallback((e: TouchEvent) => {
    const delta = e.touches[0].clientY - startY.current
    if (delta <= 0) return

    // Не перехватываем когда внутренний скролл не в начале
    const target = e.target as HTMLElement
    const scrollable = target.closest('[data-scrollable]') as HTMLElement | null
    if (scrollable && scrollable.scrollTop > 0) return

    e.preventDefault() // ключевой вызов — блокирует стандартный скролл
    dragging.current = true
    const el = sheetRef.current
    if (el) el.style.transform = `translateY(${delta}px)`
  }, [])

  const handleEnd = useCallback((e: TouchEvent) => {
    const el = sheetRef.current
    if (!el) return
    el.style.willChange = ''

    if (!dragging.current) {
      el.style.transition = 'transform 0.3s ease'
      el.style.transform  = 'translateY(0)'
      return
    }

    const delta = e.changedTouches[0].clientY - startY.current
    el.style.transition = 'transform 0.3s ease'

    if (delta > threshold) {
      el.style.transform = 'translateY(100%)'
      setTimeout(() => onCloseRef.current(), 280)
    } else {
      el.style.transform = 'translateY(0)'
    }
    dragging.current = false
  }, [threshold])

  useEffect(() => {
    const el = sheetRef.current
    if (!el || !isOpen) return

    el.addEventListener('touchstart', handleStart, { passive: true })
    el.addEventListener('touchmove',  handleMove,  { passive: false }) // false = можем preventDefault
    el.addEventListener('touchend',   handleEnd,   { passive: true })

    return () => {
      el.removeEventListener('touchstart', handleStart)
      el.removeEventListener('touchmove',  handleMove)
      el.removeEventListener('touchend',   handleEnd)
    }
  }, [isOpen, handleStart, handleMove, handleEnd])

  return { sheetRef }
}
