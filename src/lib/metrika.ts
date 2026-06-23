/**
 * Серверный модуль Яндекс.Метрики — read-only статистика для /admin/stats.
 * Тянет агрегаты + источники трафика через Reporting API (stat/v1/data).
 *
 * Токен — OAuth (scope metrika:read) из process.env.YANDEX_METRIKA_TOKEN.
 * В код/гит НЕ коммитится: только в .env.production на VPS. Значение может
 * смениться (перевыпуск в кабинете) — читаем строго из env, без хардкода.
 *
 * Любая ошибка (нет токена / 401 / сеть / таймаут) НЕ роняет экран:
 * возвращаем { available:false, reason } с нулями — UI показывает заглушку.
 */

const COUNTER_ID = 110078269
const API = 'https://api-metrika.yandex.net/stat/v1/data'
const TIMEOUT_MS = 8000

// Порядок метрик фиксирован — индексы используем при разборе totals/metrics.
const METRICS = [
  'ym:s:visits',
  'ym:s:users',
  'ym:s:pageviews',
  'ym:s:bounceRate',
  'ym:s:pageDepth',
  'ym:s:avgVisitDurationSeconds',
] as const

export type MetrikaTotals = {
  visits: number
  users: number
  pageviews: number
  bounceRate: number   // %
  pageDepth: number    // страниц за визит
  avgDuration: number  // секунды
}

export type MetrikaSource = { id: string; label: string; visits: number }

export type MetrikaTraffic = {
  available: boolean        // false → данных из Метрики нет (нет токена / 401 / ошибка)
  reason: string | null     // пояснение (для заглушки в UI и логов)
  totals: MetrikaTotals
  sources: MetrikaSource[]
}

// Русские подписи каналов трафика (ym:s:lastTrafficSource → id).
const SOURCE_LABELS: Record<string, string> = {
  direct: 'Прямые заходы',
  organic: 'Поисковые системы',
  referral: 'Переходы по ссылкам',
  social: 'Социальные сети',
  ad: 'Реклама',
  internal: 'Внутренние переходы',
  email: 'Email-рассылки',
  recommend: 'Рекомендательные системы',
  messenger: 'Мессенджеры',
  saved: 'Сохранённые страницы',
  undefined: 'Не определён',
}

const ZERO_TOTALS: MetrikaTotals = {
  visits: 0, users: 0, pageviews: 0, bounceRate: 0, pageDepth: 0, avgDuration: 0,
}

function empty(reason: string): MetrikaTraffic {
  return { available: false, reason, totals: { ...ZERO_TOTALS }, sources: [] }
}

async function fetchMetrika(token: string, params: Record<string, string>): Promise<any> {
  const qs = new URLSearchParams({ ids: String(COUNTER_ID), ...params })
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${API}?${qs}`, {
      headers: { Authorization: `OAuth ${token}` },
      signal: ctrl.signal,
      cache: 'no-store',
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`HTTP ${res.status} ${body.slice(0, 200)}`)
    }
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Статистика за период [from..to] (YYYY-MM-DD). Никогда не бросает —
 * при любой проблеме возвращает { available:false, reason }.
 */
export async function getMetrikaTraffic(from: string, to: string): Promise<MetrikaTraffic> {
  const token = process.env.YANDEX_METRIKA_TOKEN
  if (!token) return empty('Токен Метрики не задан (YANDEX_METRIKA_TOKEN)')

  try {
    const [totalsRes, sourcesRes] = await Promise.all([
      fetchMetrika(token, {
        metrics: METRICS.join(','),
        date1: from,
        date2: to,
      }),
      fetchMetrika(token, {
        metrics: 'ym:s:visits',
        dimensions: 'ym:s:lastTrafficSource',
        date1: from,
        date2: to,
        limit: '20',
        sort: '-ym:s:visits',
      }),
    ])

    const t = (totalsRes?.totals ?? totalsRes?.data?.[0]?.metrics ?? []) as number[]
    const num = (i: number) => (typeof t[i] === 'number' && isFinite(t[i]) ? t[i] : 0)
    const totals: MetrikaTotals = {
      visits: Math.round(num(0)),
      users: Math.round(num(1)),
      pageviews: Math.round(num(2)),
      bounceRate: Math.round(num(3) * 10) / 10,
      pageDepth: Math.round(num(4) * 100) / 100,
      avgDuration: Math.round(num(5)),
    }

    const sources: MetrikaSource[] = ((sourcesRes?.data ?? []) as any[])
      .map(row => {
        const dim = row?.dimensions?.[0] ?? {}
        const id = String(dim?.id ?? 'undefined')
        const label = SOURCE_LABELS[id] ?? (dim?.name ? String(dim.name) : id)
        const visits = Math.round(Number(row?.metrics?.[0] ?? 0))
        return { id, label, visits }
      })
      .filter(s => s.visits > 0)

    return { available: true, reason: null, totals, sources }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    // 401 → токен невалиден/просрочен; не падаем, отдаём заглушку.
    const reason = /401/.test(msg) ? 'Токен Метрики недействителен (401)' : `Метрика недоступна: ${msg}`
    console.error('[metrika] getMetrikaTraffic failed:', msg)
    return empty(reason)
  }
}
