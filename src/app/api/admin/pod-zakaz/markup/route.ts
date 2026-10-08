import { NextRequest, NextResponse } from 'next/server'
import { getAuthedWithRole } from '@/lib/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

// Наценка Proflowers (global + per-категория) — admin/manager, НАСТОЯЩАЯ серверная проверка
// на ОБЕИХ операциях (getAuthedWithRole), не только клиентский гард (см. техдолг campaigns —
// не повторяем). pf_markup_rules закрыта RLS без политик (как весь pf_*, пользовательских
// данных там нет) — после проверки роли читаем/пишем через service-role, лишнюю RLS-политику
// на эту таблицу не заводим.

interface CategoryRow {
  nomenclature_id: number
  nomenclature_name: string
  percent: number | null
  plus_amount: number | null
}

export async function GET(req: NextRequest) {
  const authed = await getAuthedWithRole(req, ['admin', 'manager'])
  if (!authed) return NextResponse.json({ error: 'Доступ запрещён' }, { status: 403 })

  const admin = createAdminClient()

  const { data: rules, error: rulesErr } = await admin
    .from('pf_markup_rules')
    .select('scope, scope_ref, percent, plus_amount')
    .eq('is_active', true)
    .in('scope', ['global', 'category'])
  if (rulesErr) return NextResponse.json({ error: rulesErr.message }, { status: 500 })

  const globalRule = (rules ?? []).find(r => r.scope === 'global')
  const categoryRules = new Map((rules ?? []).filter(r => r.scope === 'category').map(r => [r.scope_ref, r]))

  // Список категорий — живой, из уже встречавшихся номенклатур (pf_trading_days), не хардкод.
  const { data: days, error: daysErr } = await admin
    .from('pf_trading_days')
    .select('nomenclature_id, nomenclature_name')
    .not('nomenclature_id', 'is', null)
  if (daysErr) return NextResponse.json({ error: daysErr.message }, { status: 500 })

  const seen = new Map<number, string>()
  for (const d of days ?? []) {
    if (d.nomenclature_id != null && !seen.has(d.nomenclature_id)) {
      seen.set(d.nomenclature_id, d.nomenclature_name ?? String(d.nomenclature_id))
    }
  }

  const categories: CategoryRow[] = [...seen.entries()]
    .sort((a, b) => a[1].localeCompare(b[1], 'ru'))
    .map(([nomenclature_id, nomenclature_name]) => {
      const r = categoryRules.get(String(nomenclature_id))
      return {
        nomenclature_id,
        nomenclature_name,
        percent: r ? Number(r.percent) : null,
        plus_amount: r ? Number(r.plus_amount) : null,
      }
    })

  return NextResponse.json({
    global: { percent: Number(globalRule?.percent ?? 0), plus_amount: Number(globalRule?.plus_amount ?? 0) },
    categories,
  })
}

export async function POST(req: NextRequest) {
  const authed = await getAuthedWithRole(req, ['admin', 'manager'])
  if (!authed) return NextResponse.json({ error: 'Доступ запрещён' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const globalIn = body?.global
  const categoriesIn = Array.isArray(body?.categories) ? body.categories : []

  const percent = Number(globalIn?.percent)
  const plusAmount = Number(globalIn?.plus_amount)
  if (!Number.isFinite(percent) || !Number.isFinite(plusAmount)) {
    return NextResponse.json({ error: 'Общая наценка: percent/plus_amount должны быть числами' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { error: globalErr } = await admin
    .from('pf_markup_rules')
    .update({ percent, plus_amount: plusAmount, updated_at: new Date().toISOString() })
    .eq('scope', 'global')
    .eq('is_active', true)
  if (globalErr) return NextResponse.json({ error: `Общая наценка: ${globalErr.message}` }, { status: 500 })

  for (const row of categoriesIn) {
    const nomenclatureId = Number(row?.nomenclature_id)
    if (!Number.isFinite(nomenclatureId)) continue
    const scopeRef = String(nomenclatureId)
    const hasOverride = row?.percent !== null && row?.percent !== undefined && row?.percent !== ''

    if (!hasOverride) {
      // Пусто — снимаем override, если был (категория падает на общую наценку).
      const { error } = await admin.from('pf_markup_rules').delete().eq('scope', 'category').eq('scope_ref', scopeRef)
      if (error) return NextResponse.json({ error: `Категория ${nomenclatureId}: ${error.message}` }, { status: 500 })
      continue
    }

    const catPercent = Number(row.percent)
    const catPlus = Number(row.plus_amount) || 0
    if (!Number.isFinite(catPercent)) {
      return NextResponse.json({ error: `Категория ${nomenclatureId}: percent должен быть числом` }, { status: 400 })
    }

    const { error } = await admin.from('pf_markup_rules').upsert(
      { scope: 'category', scope_ref: scopeRef, percent: catPercent, plus_amount: catPlus, is_active: true, updated_at: new Date().toISOString() },
      { onConflict: 'scope,scope_ref' },
    )
    if (error) return NextResponse.json({ error: `Категория ${nomenclatureId}: ${error.message}` }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
