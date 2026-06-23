// Версия B, Такт 1 — серверная история диалога AI-виджета (Supabase).
// ВСЁ через try/catch и graceful-degradation: если таблиц conversations/messages ещё
// нет (миграция не применена) — функции тихо отдают пустые значения, виджет работает
// как раньше (без памяти/persistence). Только service-role (RLS закрыт для anon).

import { createAdminClient } from '@/lib/supabase/admin'
import { normalizePhone } from '@/lib/phone'
import type { DialogMessage } from '@/lib/umnico'

export interface ConvResolved {
  id: string
  clientId: string | null
  clientName: string | null
  phone: string | null
}

/** Найти клиента по телефону (оба формата) → id/имя/компания, либо null. */
export async function findClientByPhone(
  rawPhone: string,
): Promise<{ id: string; name: string | null; company_name: string | null } | null> {
  try {
    let normalized: string
    try { normalized = normalizePhone(rawPhone) } catch { return null }
    const digits = normalized.replace('+', '')
    const admin = createAdminClient()
    const { data } = await admin
      .from('clients')
      .select('id, name, company_name')
      .or(`phone.eq.${normalized},phone.eq.${digits}`)
      .maybeSingle()
    return data ? { id: data.id, name: data.name ?? null, company_name: (data as any).company_name ?? null } : null
  } catch { return null }
}

/**
 * Найти/создать беседу. Залогинен (есть phone→client) → по client_id; гость → по anon_id.
 * Возвращает null при любой ошибке (нет таблиц/RLS) — вызывающий пропускает persistence.
 */
export async function resolveConversation(opts: {
  anonId?: string | null
  phone?: string | null
}): Promise<ConvResolved | null> {
  try {
    const admin = createAdminClient()
    let clientId: string | null = null
    let clientName: string | null = null
    let normPhone: string | null = null

    if (opts.phone) {
      const c = await findClientByPhone(opts.phone)
      if (c) { clientId = c.id; clientName = c.name }
      try { normPhone = normalizePhone(opts.phone) } catch { normPhone = null }
    }

    // Поиск существующей беседы
    let q = admin
      .from('conversations')
      .select('id, client_id, anon_id, phone')
      .order('created_at', { ascending: false })
      .limit(1)
    if (clientId) q = q.eq('client_id', clientId)
    else if (opts.anonId) q = q.eq('anon_id', opts.anonId)
    else return null

    const { data: existing, error } = await q.maybeSingle()
    if (error) return null // таблиц нет / RLS → graceful

    if (existing) {
      // Гость вошёл по PIN → бэкфилл client_id/phone в существующую гостевую беседу
      if (clientId && !existing.client_id) {
        await admin.from('conversations')
          .update({ client_id: clientId, phone: normPhone, updated_at: new Date().toISOString() })
          .eq('id', existing.id)
      }
      return {
        id: existing.id,
        clientId: clientId ?? existing.client_id ?? null,
        clientName,
        phone: normPhone ?? existing.phone ?? null,
      }
    }

    const { data: created, error: insErr } = await admin
      .from('conversations')
      .insert({ client_id: clientId, anon_id: opts.anonId ?? null, phone: normPhone, channel: 'widget' })
      .select('id')
      .single()
    if (insErr || !created) return null
    return { id: created.id, clientId, clientName, phone: normPhone }
  } catch { return null }
}

/** История беседы для контекста бота (старые→новые). [] при ошибке. */
export async function loadHistory(conversationId: string, limit = 12): Promise<DialogMessage[]> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('messages')
      .select('role, text')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error || !data) return []
    return data
      .reverse()
      .filter((m) => m.text)
      .map((m) => ({
        role: m.role === 'bot' ? 'bot' : m.role === 'manager' ? 'manager' : 'client',
        text: m.text as string,
      }))
  } catch { return [] }
}

/** Сохранить сообщения беседы (user/bot). Неблокирующе. */
export async function saveMessages(
  conversationId: string,
  msgs: Array<{ role: 'user' | 'bot'; text: string | null; products?: unknown }>,
): Promise<void> {
  try {
    const admin = createAdminClient()
    // created_at со смещением по индексу (user=base, bot=base+1мс): иначе обе строки
    // пары получают одинаковый now() в одном INSERT → порядок в сводке скачет.
    const base = Date.now()
    const rows = msgs
      .filter((m) => (m.text && m.text.trim()) || m.products)
      .map((m, i) => ({
        conversation_id: conversationId,
        role: m.role,
        text: m.text ?? null,
        products: m.products ?? null,
        created_at: new Date(base + i).toISOString(),
      }))
    if (!rows.length) return
    await admin.from('messages').insert(rows)
    await admin.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversationId)
  } catch { /* graceful */ }
}
