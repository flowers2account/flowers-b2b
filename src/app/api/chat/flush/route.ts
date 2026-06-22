import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveConversation } from '@/lib/bot/conversation-store'
import { findContactByPhone, addEntityNote, normalizePhoneAmo } from '@/lib/amo'

export const dynamic = 'force-dynamic'

// Версия B Такт 1 — ОДНОСТОРОННЕЕ отражение диалога в amoCRM примечанием.
// Вызывается при закрытии виджета (panel close / beforeunload через sendBeacon).
// Складывает РАЗУМНУЮ СВОДКУ (а не каждое сообщение) в карточку КОНТАКТА:
//   что клиент спрашивал, какие товары смотрел, что добавил в корзину.
// Только для известных клиентов (есть client_id + телефон + контакт в amo).
// Дедуп: пишем, только если появились новые сообщения клиента с прошлой сводки.
// Всё graceful: нет таблиц / нет контакта / ошибка amo → тихо выходим (200).
export async function POST(req: NextRequest) {
  // sendBeacon шлёт text/plain — парсим лениво.
  let body: any = {}
  try { body = await req.json() } catch {
    try { body = JSON.parse(await req.text()) } catch { body = {} }
  }
  const anonId = typeof body?.anon_id === 'string' ? body.anon_id.trim() : ''
  const phone = typeof body?.phone === 'string' ? body.phone.trim() : ''
  const cart: Array<{ name?: string; qty?: number }> = Array.isArray(body?.cart) ? body.cart : []

  try {
    const conv = await resolveConversation({ anonId: anonId || null, phone: phone || null })
    // Отражаем только для известных клиентов (залогинен + телефон).
    if (!conv || !conv.clientId || !conv.phone) return NextResponse.json({ ok: true, skipped: 'guest' })

    const admin = createAdminClient()
    const { data: row } = await admin
      .from('conversations')
      .select('last_note_at, amo_entity_type, amo_entity_id')
      .eq('id', conv.id)
      .maybeSingle()

    const since = (row as any)?.last_note_at ?? '1970-01-01T00:00:00Z'
    const { data: msgs } = await admin
      .from('messages')
      .select('role, text, products, created_at')
      .eq('conversation_id', conv.id)
      .gt('created_at', since)
      .order('created_at', { ascending: true })

    const list = (msgs ?? []) as Array<{ role: string; text: string | null; products: any }>
    const userMsgs = list.filter((m) => m.role === 'user' && m.text && m.text.trim())
    if (userMsgs.length === 0) return NextResponse.json({ ok: true, skipped: 'no-new' })

    // Резолвим контакт amo (из строки беседы или по телефону).
    let entityId: number | null = (row as any)?.amo_entity_id ?? null
    const entityType = ((row as any)?.amo_entity_type ?? 'contacts') as 'contacts' | 'leads'
    if (!entityId) {
      entityId = await findContactByPhone(normalizePhoneAmo(conv.phone))
      if (!entityId) return NextResponse.json({ ok: true, skipped: 'no-contact' })
    }

    // Сводка
    const questions = userMsgs.map((m) => `• ${m.text!.trim()}`).slice(0, 12)
    const shown = new Set<string>()
    for (const m of list) {
      if (m.role !== 'bot' || !Array.isArray(m.products)) continue
      for (const p of m.products) {
        const n = p?.display_name
        if (n && shown.size < 15) shown.add(String(n))
      }
    }
    const cartLines = cart
      .filter((c) => c?.name)
      .map((c) => `• ${c.name}${c.qty ? ` — ${c.qty}` : ''}`)
      .slice(0, 20)

    const summary = [
      '💬 Чат на сайте (AI-виджет)',
      `Клиент: ${conv.clientName ?? '—'} · ${conv.phone}`,
      '',
      'Спрашивал:',
      ...questions,
      shown.size ? `\nСмотрел товары: ${[...shown].join(', ')}` : '',
      cartLines.length ? `\nДобавил в корзину:\n${cartLines.join('\n')}` : '',
    ].filter((s) => s !== '').join('\n')

    await addEntityNote(entityType, entityId, summary)

    await admin.from('conversations').update({
      last_note_at: new Date().toISOString(),
      amo_entity_type: entityType,
      amo_entity_id: entityId,
      updated_at: new Date().toISOString(),
    }).eq('id', conv.id)

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[api/chat/flush]', e instanceof Error ? e.message : e)
    return NextResponse.json({ ok: true })  // не мешаем закрытию виджета
  }
}
