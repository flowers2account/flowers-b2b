'use client'

import { useEffect, Suspense } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

export const YM_COUNTER_ID = 110078269

declare global {
  interface Window {
    ym?: (...args: unknown[]) => void
    __ymFirstHitDone?: boolean
  }
}

// SPA-режим: App Router не перезагружает страницу при клиентской навигации,
// поэтому init считает только первый вход. На каждую последующую смену маршрута
// шлём виртуальный pageview через ym 'hit'. Первый рендер пропускаем — его уже
// посчитал init (иначе задвоится первый просмотр).
function YandexMetrikaTracker() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    // флаг переживает рендеры; не отправляем hit на самый первый рендер
    if (!window.__ymFirstHitDone) {
      window.__ymFirstHitDone = true
      return
    }
    if (typeof window.ym === 'function') {
      window.ym(YM_COUNTER_ID, 'hit', window.location.href)
    }
  }, [pathname, searchParams])

  return null
}

export default function YandexMetrika() {
  return (
    <Suspense fallback={null}>
      <YandexMetrikaTracker />
    </Suspense>
  )
}
