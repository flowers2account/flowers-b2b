'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { authHeaders } from '@/lib/api-token'
import { useAuthStore } from '@/lib/auth-store'
import { CartItem, useCart } from '@/lib/cart-store'

function keyOf(item: Pick<CartItem, 'id' | 'color'>) {
  return `${item.id}:${item.color ?? ''}`
}

function normalize(items: CartItem[]) {
  return [...items]
    .map((i) => ({ ...i, qty: Math.max(1, Math.floor(Number(i.qty) || 1)), color: i.color ?? null }))
    .sort((a, b) => keyOf(a).localeCompare(keyOf(b)))
}

function signature(items: CartItem[]) {
  return JSON.stringify(normalize(items).map((i) => [
    i.id, i.color ?? null, i.qty, i.price, i.name, i.available, i.image_url ?? null, i.unit ?? null,
  ]))
}

function mergeCart(local: CartItem[], remote: CartItem[]) {
  const map = new Map<string, CartItem>()
  for (const item of remote) map.set(keyOf(item), { ...item, color: item.color ?? null })
  for (const item of local) {
    const key = keyOf(item)
    const prev = map.get(key)
    map.set(key, prev ? { ...prev, qty: Math.max(prev.qty, item.qty) } : { ...item, color: item.color ?? null })
  }
  return normalize([...map.values()])
}

async function loadCart(): Promise<{ items: CartItem[] } | null> {
  const headers = await authHeaders()
  if (!headers.Authorization) return null
  const res = await fetch('/api/cart', { headers, cache: 'no-store' })
  if (!res.ok) return null
  return res.json()
}

async function saveCart(items: CartItem[]) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(await authHeaders()) }
  if (!headers.Authorization) return
  await fetch('/api/cart', {
    method: 'PUT',
    headers,
    body: JSON.stringify({ items }),
  })
}

export default function CartSync() {
  const isAuthed = useAuthStore((s) => s.isAuthed)
  const phone = useAuthStore((s) => s.phone)
  const items = useCart((s) => s.items)
  const setItems = useCart((s) => s.setItems)
  const [ready, setReady] = useState(false)
  const applyingRemote = useRef(false)
  const pendingSave = useRef(false)
  const lastSavedSig = useRef('')
  const currentSig = useMemo(() => signature(items), [items])

  useEffect(() => {
    let alive = true
    setReady(false)
    lastSavedSig.current = ''
    if (!isAuthed || !phone) return

    ;(async () => {
      const local = useCart.getState().items
      const remote = await loadCart()
      if (!alive || !remote) return

      const remoteItems = normalize(remote.items || [])
      const next = local.length && remoteItems.length ? mergeCart(local, remoteItems) : (remoteItems.length ? remoteItems : normalize(local))
      applyingRemote.current = true
      setItems(next)
      applyingRemote.current = false
      lastSavedSig.current = signature(next)
      setReady(true)
      if (signature(next) !== signature(remoteItems)) await saveCart(next)
    })()

    return () => { alive = false }
  }, [isAuthed, phone, setItems])

  useEffect(() => {
    if (!ready || !isAuthed || applyingRemote.current || currentSig === lastSavedSig.current) return
    const timer = window.setTimeout(async () => {
      pendingSave.current = true
      const snapshot = useCart.getState().items
      await saveCart(snapshot)
      lastSavedSig.current = signature(snapshot)
      pendingSave.current = false
    }, 600)
    return () => window.clearTimeout(timer)
  }, [ready, isAuthed, currentSig])

  useEffect(() => {
    if (!ready || !isAuthed || !phone) return
    const refresh = async () => {
      if (pendingSave.current) return
      const remote = await loadCart()
      if (!remote) return
      const remoteItems = normalize(remote.items || [])
      if (signature(remoteItems) === signature(useCart.getState().items)) return
      applyingRemote.current = true
      setItems(remoteItems)
      lastSavedSig.current = signature(remoteItems)
      applyingRemote.current = false
    }
    const id = window.setInterval(refresh, 15000)
    window.addEventListener('focus', refresh)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('focus', refresh)
    }
  }, [ready, isAuthed, phone, setItems])

  return null
}
