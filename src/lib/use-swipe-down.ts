'use client'
import { useRef, useCallback } from 'react'

/**
 * Добавляет свайп вниз для закрытия bottom sheet.
 * Работает с нативным transform — без лишних ре-рендеров.
 * Срабатывает только если scrollTop внутреннего scroll-контейнера = 0.
 */
export function useSwipeDown(onClose: () => void, threshold = 80) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const startY    = useRef(0)
  const dragging  = useRef(false)

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    startY.current = e.touches[0].clientY
    dragging.current = false
  }, [])

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const delta = e.touches[0].clientY - startY.current
    if (delta <= 0) return

    // Не перехватываем если внутренний scroll не в начале
    const target = e.target as HTMLElement
    const scrollable = target.closest('[data-scrollable]') as HTMLElement | null
    if (scrollable && scrollable.scrollTop > 0) return

    dragging.current = true
    if (sheetRef.current) {
      sheetRef.current.style.transform = `translateY(${delta}px)`
      sheetRef.current.style.transition = 'none'
    }
  }, [])

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!dragging.current) return
    const delta = e.changedTouches[0].clientY - startY.current
    const el = sheetRef.current
    if (!el) return

    el.style.transition = 'transform 0.3s ease'
    if (delta > threshold) {
      el.style.transform = 'translateY(100%)'
      setTimeout(onClose, 280)
    } else {
      el.style.transform = 'translateY(0)'
    }
    dragging.current = false
  }, [onClose, threshold])

  return { sheetRef, onTouchStart, onTouchMove, onTouchEnd }
}
