// Тонкий клиент GraphQL V3 портала госзакупок РК (ows.goszakup.gov.kz).
// Только чтение. Токен — из GOSZAKUP_TOKEN (.env.local для локальных скриптов;
// см. README-заметку в .env.local). Никогда не логировать/выбрасывать токен в ошибках.

const ENDPOINT = 'https://ows.goszakup.gov.kz/v3/graphql'

export interface GqlPageInfo {
  limitPage: number
  totalCount: number
  hasNextPage: boolean
  lastId: number
  lastIndexDate: string | null
}

export interface GqlResponse<T> {
  data: T | null
  errors?: Array<{ message: string }>
  extensions?: { pageInfo?: GqlPageInfo }
}

function getToken(): string {
  const t = process.env.GOSZAKUP_TOKEN
  if (!t) {
    throw new Error(
      'GOSZAKUP_TOKEN не задан. Добавьте его в .env.local и запускайте скрипт с ' +
        '`node --env-file=.env.local ...` (см. package.json → ktru:procurement).',
    )
  }
  return t
}

/** Один запрос к GraphQL V3 с таймаутом и небольшим ретраем на сетевые сбои. */
export async function gql<T = unknown>(
  query: string,
  { tries = 3, timeoutMs = 30000 }: { tries?: number; timeoutMs?: number } = {},
): Promise<GqlResponse<T>> {
  const token = getToken()
  let lastErr: unknown
  for (let attempt = 1; attempt <= tries; attempt++) {
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), timeoutMs)
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
        signal: ac.signal,
      })
      clearTimeout(timer)
      if (!res.ok) {
        throw new Error(`goszakup HTTP ${res.status}`)
      }
      const json = (await res.json()) as GqlResponse<T>
      if (json.errors?.length) {
        throw new Error(`goszakup GraphQL error: ${json.errors.map((e) => e.message).join('; ')}`)
      }
      return json
    } catch (e) {
      clearTimeout(timer)
      lastErr = e
      if (attempt < tries) await sleep(800 * attempt)
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
