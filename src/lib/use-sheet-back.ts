'use client'
import { useEffect, useRef } from 'react'

export function useSheetBack(isOpen: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!isOpen) return

    window.history.pushState({ sheet: true }, '')

    const handlePop = () => onCloseRef.current()
    window.addEventListener('popstate', handlePop)

    return () => {
      window.removeEventListener('popstate', handlePop)
      // закрыт не кнопкой "назад" (иначе popstate уже сбросил состояние) —
      // убираем свою запись из истории
      if (window.history.state?.sheet) {
        window.history.back()
      }
    }
  }, [isOpen])
}
