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

// ⚠️ Удалён getCabinetToken() (grant_type=password, кабинетные креды): для реестра
// /operations он НЕ нужен — выписка тянется сервисным client_credentials-токеном
// (src/lib/epay-operations.ts), без кабинета и 2FA (probe 23.06.2026). Env
// EPAY_CABINET_USERNAME/PASSWORD на VPS можно убрать (удаляет владелец вручную).
