// ePay (Halyk) реестр операций — READ-ONLY. Сервисный client_credentials-токен
// (прод client-креды), БЕЗ кабинета/2FA. Эндпоинт POST /operations.
// Используется только синком реестра (/api/admin/payments/sync). Не charge/refund/cancel.
//
// Контракт подтверждён probe 23.06.2026 (см. docs / память проекта):
//   POST https://epay-api.homebank.kz/operations
//   body: { searchParameters:[{name:'created_date',method:'between',searchParameter:[isoFrom,isoTo]}],
//           paging:{page,size}, orderParameters:[{field:'created_date',typeOrder:'DESC'}] }
//   resp: { totalCount, records:[{ id, invoiceId, reference, amount, orgAmount, currency,
//           createdDate, payoutDate, payoutAmount, status, cardMask, cardType, issuer,
//           approvalCode, payerName, payerPhone, payerEmail, ... }] }

const OAUTH_URL_PROD = 'https://epay-oauth.homebank.kz/oauth2/token'
const API_URL_PROD = 'https://epay-api.homebank.kz'
const SCOPE = 'webapi usermanagement email_send verification statement statistics payment'

export type EpayOperation = {
  id: string
  invoiceId?: string
  reference?: string
  amount?: number
  orgAmount?: number
  currency?: string
  createdDate?: string
  payoutDate?: string
  payoutAmount?: number
  status?: string
  cardMask?: string
  cardType?: string
  issuer?: string
  approvalCode?: string
  payerName?: string
  payerPhone?: string
  payerEmail?: string
  [k: string]: unknown
}

// Кэш сервисного токена в памяти процесса (буфер 30с), не персистим.
let svcTokenCache: { token: string; expiresAt: number } | null = null

async function getEpayServiceToken(): Promise<string> {
  const now = Date.now()
  if (svcTokenCache && svcTokenCache.expiresAt > now + 30_000) return svcTokenCache.token

  const clientId = process.env.EPAY_PROD_CLIENT_ID ?? ''
  const clientSecret = process.env.EPAY_PROD_CLIENT_SECRET ?? ''
  const terminal = process.env.EPAY_PROD_TERMINAL_ID ?? ''
  if (!clientId || !clientSecret) {
    throw new Error('EPAY_PROD_CLIENT_ID/EPAY_PROD_CLIENT_SECRET не заданы')
  }

  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    scope: SCOPE,
    client_id: clientId,
    client_secret: clientSecret,
    terminal,
  })

  const res = await fetch(process.env.EPAY_PROD_OAUTH_URL || OAUTH_URL_PROD, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(`ePay service OAuth ${res.status}: ${t.slice(0, 300)}`)
  }
  const json = (await res.json()) as { access_token?: string; expires_in?: number }
  if (!json.access_token) throw new Error('ePay service OAuth: в ответе нет access_token')

  svcTokenCache = { token: json.access_token, expiresAt: now + (json.expires_in ?? 1800) * 1000 }
  return json.access_token
}

/** Одна страница реестра операций за период. fromIso/toIso — ISO 8601 (с офсетом). */
export async function fetchEpayOperations(opts: {
  fromIso: string
  toIso: string
  page: number
  size: number
}): Promise<{ totalCount: number; records: EpayOperation[] }> {
  const token = await getEpayServiceToken()
  const base = process.env.EPAY_PROD_API_URL || API_URL_PROD

  const body = {
    searchParameters: [
      { name: 'created_date', method: 'between', searchParameter: [opts.fromIso, opts.toIso] },
    ],
    paging: { page: opts.page, size: opts.size },
    orderParameters: [{ field: 'created_date', typeOrder: 'DESC' }],
  }

  const res = await fetch(`${base}/operations`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(`ePay /operations ${res.status}: ${t.slice(0, 300)}`)
  }
  const json = (await res.json()) as { totalCount?: number; records?: EpayOperation[] }
  return { totalCount: json.totalCount ?? 0, records: json.records ?? [] }
}
