import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveConversation } from '@/lib/bot/conversation-store'
import { summarizeConversation } from '@/lib/bot/inquiry-amo'
import { findContactByPhone, normalizePhoneAmo } from '@/lib/amo'

export const dynamic = 'force-dynamic'

// Версия B Такт 1/1.5 — ОДНОСТОРОННЕЕ отражение диалога в amoCRM (сводка-примечание).
// Вызывается при закрытии виджета (panel close / beforeunload через sendBeacon).
// Складывает РАЗУМНУЮ СВОДКУ (а не каждое сообщение) в привязанную сущность amoCRM:
//   • известный клиент → его КОНТАКТ (резолвим по телефону, если ещё не привязан);
//   • анонимное обращение → ЛИД обращения (привязан ensureInquiryLead в /api/chat).
// Дедуп: summarizeConversation пишет, только если есть новые сообщения после last_note_at.
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
    if (!conv) return NextResponse.json({ ok: true, skipped: 'no-conv' })

    // Известный клиент без привязанной сущности amo → привязываем его КОНТАКТ
    // (анонимные лиды привязаны заранее в /api/chat → ensureInquiryLead).
    if (conv.clientId && conv.phone) {
      const admin = createAdminClient()
      const { data: row } = await admin
        .from('conversations').select('amo_entity_id').eq('id', conv.id).maybeSingle()
      if (!(row as any)?.amo_entity_id) {
        const contactId = await findContactByPhone(normalizePhoneAmo(conv.phone))
        if (contactId) {
          await admin.from('conversations')
            .update({ amo_entity_type: 'contacts', amo_entity_id: contactId })
            .eq('id', conv.id)
        }
      }
    }

    const res = await summarizeConversation(conv.id, { cart })
    return NextResponse.json({ ok: true, summary: res })
  } catch (e) {
    console.error('[api/chat/flush]', e instanceof Error ? e.message : e)
    return NextResponse.json({ ok: true })  // не мешаем закрытию виджета
  }
}
