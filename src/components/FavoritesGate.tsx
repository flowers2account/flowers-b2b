'use client'
import { useEffect } from 'react'
import { useAuthStore } from '@/lib/auth-store'
import { useFavorites } from '@/lib/favorites-store'
import AuthModal from '@/components/catalog/AuthModal'

// Глобальный «шлюз» избранного: грузит favorites при появлении телефона
// и показывает AuthModal, когда гость пытается добавить в избранное.
export default function FavoritesGate() {
  const phone = useAuthStore(s => s.phone)
  const isAuthed = useAuthStore(s => s.isAuthed)
  const loadForPhone = useFavorites(s => s.loadForPhone)
  const needAuth = useFavorites(s => s.needAuth)
  const setNeedAuth = useFavorites(s => s.setNeedAuth)

  useEffect(() => {
    loadForPhone(isAuthed ? phone : null)
  }, [phone, isAuthed, loadForPhone])

  if (!needAuth) return null
  return <AuthModal onClose={() => setNeedAuth(false)} onSuccess={() => setNeedAuth(false)} />
}
