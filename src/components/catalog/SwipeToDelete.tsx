'use client'
import { useRef, useEffect, useCallback, type ReactNode } from 'react'

interface Props {
  onDelete: () => void
  children: ReactNode
  threshold?: number   // px — сколько свайпнуть чтобы удалить
}

export default function SwipeToDelete({ onDelete, children, threshold = 90 }: Props) {
  const wrapRef     = useRef<HTMLDivElement>(null)
  const contentRef  = useRef<HTMLDivElement>(null)
  const startX      = useRef(0)
  const deleted     = useRef(false)
  const onDeleteRef = useRef(onDelete)
  onDeleteRef.current = onDelete

  const handleStart = useCallback((e: TouchEvent) => {
    if (deleted.current) return
    startX.current = e.touches[0].clientX
    const el = contentRef.current
    if (el) { el.style.transition = 'none' }
  }, [])

  const handleMove = useCallback((e: TouchEvent) => {
    if (deleted.current) return
    const dx = e.touches[0].clientX - startX.current
    if (dx >= 0) return          // правый свайп — игнор
    const shift = Math.max(dx, -threshold * 1.6)
    const el = contentRef.current
    if (el) el.style.transform = `translateX(${shift}px)`
  }, [threshold])

  const handleEnd = useCallback((e: TouchEvent) => {
    if (deleted.current) return
    const dx = e.changedTouches[0].clientX - startX.current
    const el = contentRef.current
    const wrap = wrapRef.current
    if (!el || !wrap) return

    if (dx < -threshold) {
      // Удаляем: улетает влево, схлопывается по высоте
      deleted.current = true
      el.style.transition = 'transform 0.2s ease'
      el.style.transform  = `translateX(-110%)`
      wrap.style.transition = 'max-height 0.25s ease 0.18s, opacity 0.2s ease 0.18s'
      wrap.style.maxHeight  = '0px'
      wrap.style.opacity    = '0'
      setTimeout(() => onDeleteRef.current(), 400)
    } else {
      // Пружинит обратно
      el.style.transition = 'transform 0.25s ease'
      el.style.transform  = 'translateX(0)'
    }
  }, [threshold])

  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    el.addEventListener('touchstart', handleStart, { passive: true })
    el.addEventListener('touchmove',  handleMove,  { passive: true })
    el.addEventListener('touchend',   handleEnd,   { passive: true })
    return () => {
      el.removeEventListener('touchstart', handleStart)
      el.removeEventListener('touchmove',  handleMove)
      el.removeEventListener('touchend',   handleEnd)
    }
  }, [handleStart, handleMove, handleEnd])

  return (
    <div
      ref={wrapRef}
      style={{ position: 'relative', overflow: 'hidden', maxHeight: 200 }}
    >
      {/* Красная подложка — видна при свайпе влево */}
      <div style={{
        position: 'absolute', top: 0, right: 0, bottom: 0,
        width: threshold * 1.2,
        background: '#E53935',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 'inherit',
      }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>
        </svg>
      </div>
      {/* Контент */}
      <div ref={contentRef} style={{ position: 'relative', background: 'inherit', willChange: 'transform' }}>
        {children}
      </div>
    </div>
  )
}
