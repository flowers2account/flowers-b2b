// epay (Halyk) серверная конфигурация по флагу EPAY_ENV (test|prod). По умолчанию test.
// Боевой контур включается ТОЛЬКО при EPAY_ENV=prod (тогда читаются EPAY_PROD_* + боевой OAuth-URL).
// Тест не трогаем: при test читаются прежние EPAY_* (поведение без изменений).
//
// Контуры (docs/PAYMENTS.md): тест — *.epayment.kz; бой — *.homebank.kz.
export type EpayEnv = 'test' | 'prod'

export const EPAY_ENV: EpayEnv = process.env.EPAY_ENV === 'prod' ? 'prod' : 'test'

const OAUTH_URL = {
  test: 'https://test-epay-oauth.epayment.kz/oauth2/token',
  prod: 'https://epay-oauth.homebank.kz/oauth2/token',
} as const

export interface EpayServerConfig {
  env: EpayEnv
  clientId: string
  clientSecret: string
  terminal: string
  oauthUrl: string
}

/** Активная серверная конфигурация epay (creds + OAuth-URL) по флагу EPAY_ENV. */
export function epayServerConfig(): EpayServerConfig {
  if (EPAY_ENV === 'prod') {
    return {
      env: 'prod',
      clientId: process.env.EPAY_PROD_CLIENT_ID ?? '',
      clientSecret: process.env.EPAY_PROD_CLIENT_SECRET ?? '',
      terminal: process.env.EPAY_PROD_TERMINAL_ID ?? '',
      oauthUrl: process.env.EPAY_PROD_OAUTH_URL || OAUTH_URL.prod,
    }
  }
  // test (по умолчанию) — прежние переменные, поведение не меняется
  return {
    env: 'test',
    clientId: process.env.EPAY_CLIENT_ID ?? '',
    clientSecret: process.env.EPAY_CLIENT_SECRET ?? '',
    terminal: process.env.EPAY_TERMINAL_ID ?? '',
    oauthUrl: process.env.EPAY_OAUTH_URL || OAUTH_URL.test,
  }
}

// ── Токен кабинета ePay (grant_type=password) — для READ-ONLY реестра /operations ──
// Реестр операций живёт в боевом кабинете homebank, поэтому всегда боевой контур:
// прод OAuth-URL + прод client_id/secret + операторские username/password из env.
// Креды — ТОЛЬКО process.env (в репо/коде не хранятся). Токен короткоживущий,
// кэшируем в памяти процесса до истечения expires_in (буфер 30с), не персистим.
// ⚠️ Только чтение реестра. К charge/refund/cancel отношения не имеет.
let cabinetTokenCache: { token: string; expiresAt: number } | null = null

export async function getCabinetToken(): Promise<string> {
  const now = Date.now()
  if (cabinetTokenCache && cabinetTokenCache.expiresAt > now + 30_000) {
    return cabinetTokenCache.token
  }

  const username = process.env.EPAY_CABINET_USERNAME
  const password = process.env.EPAY_CABINET_PASSWORD
  if (!username || !password) {
    throw new Error('EPAY_CABINET_USERNAME/EPAY_CABINET_PASSWORD не заданы — нет кредов кабинета ePay')
  }

  // Боевые client-креды (реестр — только прод); не зависят от EPAY_ENV.
  const clientId = process.env.EPAY_PROD_CLIENT_ID ?? ''
  const clientSecret = process.env.EPAY_PROD_CLIENT_SECRET ?? ''

  const params = new URLSearchParams({
    grant_type: 'password',
    username,
    password,
    scope: 'webapi usermanagement email_send verification statement statistics payment',
    client_id: clientId,
    client_secret: clientSecret,
  })

  const res = await fetch(process.env.EPAY_PROD_OAUTH_URL || OAUTH_URL.prod, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })

  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(`ePay cabinet OAuth ${res.status}: ${t.slice(0, 300)}`)
  }

  const json = (await res.json()) as { access_token?: string; expires_in?: number }
  if (!json.access_token) throw new Error('ePay cabinet OAuth: в ответе нет access_token')

  const ttlMs = (json.expires_in ?? 1800) * 1000
  cabinetTokenCache = { token: json.access_token, expiresAt: now + ttlMs }
  return json.access_token
}
