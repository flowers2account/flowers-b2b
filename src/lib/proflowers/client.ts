import type {
  PfActiveTradingDay,
  PfCatalogResponse,
  PfProfileResponse,
  PfTradingDaysResponse,
} from './types'

// HTTP-клиент market.proflowers.kz: логин, cookie-jar на время прогона, пауза между запросами,
// ретраи и один перелогин, если сессия слетела. Без браузера — данные отдаёт JSON API.
// Аккаунт со спецценой терять нельзя, поэтому темп низкий, а число перелогинов ограничено.

const BASE_URL = 'https://market.proflowers.kz'
const EXCHANGE_REFERER = `${BASE_URL}/exchange?page=1&sortOrder=ASC&sortBy=promotion`
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

// Пауза между любыми двумя запросами (включая шаги логина и редиректы).
const MIN_GAP_MS = 1000
const MAX_GAP_MS = 1500
// Ретраи на 429/5xx и сетевые сбои: 3 попытки (исходная + 2 повтора) с нарастающим бэкоффом.
const RETRY_DELAYS_MS = [2000, 5000]
const MAX_RETRY_AFTER_MS = 30_000
const REQUEST_TIMEOUT_MS = 30_000
const MAX_REDIRECTS = 5
// Перелогин при слетевшей сессии: один на запрос и не больше трёх на весь прогон.
const MAX_RELOGINS = 3

export type ProflowersErrorKind = 'config' | 'auth' | 'session' | 'http' | 'parse' | 'network'

export class ProflowersError extends Error {
  readonly kind: ProflowersErrorKind
  readonly status?: number

  constructor(kind: ProflowersErrorKind, message: string, status?: number) {
    super(message)
    this.name = 'ProflowersError'
    this.kind = kind
    this.status = status
  }
}

export interface ProflowersCredentials {
  email: string
  password: string
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error)
  const code = (error as { cause?: { code?: string } }).cause?.code
  return code ? `${error.name}: ${error.message} (${code})` : `${error.name}: ${error.message}`
}

// Cookie-jar на один хост: имя → значение. Атрибуты (domain/path) не нужны — ходим только на
// market.proflowers.kz. Удаление (deleted / пустое значение / Max-Age<=0 / прошедший Expires)
// учитываем, иначе после logout-подобных ответов уйдёт протухшая сессия.
class CookieJar {
  private readonly cookies = new Map<string, string>()

  clear(): void {
    this.cookies.clear()
  }

  store(setCookieLines: string[]): void {
    for (const line of setCookieLines) {
      const [pair, ...attrs] = line.split(';').map((part) => part.trim())
      const eq = pair.indexOf('=')
      if (eq <= 0) continue
      const name = pair.slice(0, eq).trim()
      const value = pair.slice(eq + 1).trim()

      let expired = false
      for (const attr of attrs) {
        const [key, ...rest] = attr.split('=')
        const attrValue = rest.join('=').trim()
        const lowerKey = key.trim().toLowerCase()
        if (lowerKey === 'max-age' && Number(attrValue) <= 0) expired = true
        if (lowerKey === 'expires') {
          const at = Date.parse(attrValue)
          if (!Number.isNaN(at) && at < Date.now()) expired = true
        }
      }

      if (expired || value === '' || value.toLowerCase() === 'deleted') this.cookies.delete(name)
      else this.cookies.set(name, value)
    }
  }

  header(): string {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ')
  }
}

function pageHeaders(): Record<string, string> {
  return {
    'User-Agent': USER_AGENT,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ru-RU,ru;q=0.9',
  }
}

// Без этих заголовков сервер отдаёт HTML-оболочку SPA вместо JSON.
function jsonHeaders(referer: string): Record<string, string> {
  return {
    'User-Agent': USER_AGENT,
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'ru-RU,ru;q=0.9',
    Referer: referer,
    'X-Requested-With': 'XMLHttpRequest',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST'
  headers?: Record<string, string>
  body?: string
  followRedirects?: boolean
}

type JsonResult = { ok: true; data: unknown } | { ok: false }

export class ProflowersClient {
  private readonly jar = new CookieJar()
  private readonly credentials: ProflowersCredentials
  private readonly log: (message: string) => void
  private loggedIn = false
  private reloginCount = 0
  private lastRequestAt = 0

  constructor(credentials: ProflowersCredentials, log: (message: string) => void = () => {}) {
    this.credentials = credentials
    this.log = log
  }

  /**
   * Логин по шагам из ТЗ: GET /prev/login (сессионная cookie) → POST /prev/login_check
   * (302, cookie KZSESSIONID/KZREMEMBERME) → проверка GET /client/profile-data.
   * Возвращает имя клиента из профиля. Пароль нигде не логируется.
   */
  async login(): Promise<string> {
    this.jar.clear()
    this.loggedIn = false

    const loginUrl = `${BASE_URL}/prev/login`
    const page = await this.request(loginUrl, { headers: pageHeaders() })
    await page.text()
    if (!page.ok) throw new ProflowersError('http', `/prev/login: HTTP ${page.status}`, page.status)

    const check = await this.request(`${BASE_URL}/prev/login_check`, {
      method: 'POST',
      headers: {
        ...pageHeaders(),
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: loginUrl,
        Origin: BASE_URL,
      },
      body: new URLSearchParams({
        email: this.credentials.email,
        password: this.credentials.password,
        remember_me: 'on',
      }).toString(),
      followRedirects: false,
    })
    await check.text()
    if (check.status === 429 || check.status >= 500) {
      throw new ProflowersError('http', `/prev/login_check: HTTP ${check.status}`, check.status)
    }

    const profile = await this.fetchJson('/client/profile-data', EXCHANGE_REFERER)
    const name = profile.ok ? (profile.data as PfProfileResponse | null)?.client?.name : undefined
    if (!name) {
      throw new ProflowersError(
        'auth',
        'Логин не удался: сервер не признал сессию (проверьте PF_EMAIL / PF_PASS)',
      )
    }

    this.loggedIn = true
    this.log(`вход выполнен: ${name}`)
    return name
  }

  /** Активные торговые дни (exchange | preorder). */
  async getActiveTradingDays(): Promise<PfActiveTradingDay[]> {
    const data = await this.getJson<Partial<PfTradingDaysResponse>>('/trading-days/')
    if (!Array.isArray(data?.activeTradingDays)) {
      throw new ProflowersError('parse', '/trading-days/: в ответе нет activeTradingDays[]')
    }
    return data.activeTradingDays
  }

  /**
   * Страница каталога. pages.total — общее число товаров (не страниц): страниц ceil(total / ipp).
   * tradingDayIds/groupIds — необязательные фильтры (trading_days[]/group_ids[]), подтверждены
   * живым запросом 24.09.2026: group_ids[] реально сужает выдачу до товаров листа подкатегории,
   * несколько group_ids[] разом сливают товары без метки группы — на каждый лист нужен свой
   * отдельный запрос (см. docs/PROFLOWERS_SYNC.md).
   */
  async getCatalogPage(
    page: number,
    options: { ipp?: number; referer?: string; tradingDayIds?: number[]; groupIds?: number[] } = {},
  ): Promise<PfCatalogResponse> {
    const ipp = options.ipp ?? 60
    const params = [`ipp=${ipp}`, `page=${page}`, 'sortOrder=ASC', 'sortBy=promotion']
    for (const id of options.tradingDayIds ?? []) params.push(`trading_days[]=${id}`)
    for (const id of options.groupIds ?? []) params.push(`group_ids[]=${id}`)
    const path = `/catalog/products?${params.join('&')}`
    const data = await this.getJson<Partial<PfCatalogResponse>>(path, options.referer)

    const total = Number(data?.pages?.total)
    const pageIpp = Number(data?.pages?.ipp)
    if (!Array.isArray(data?.list) || !Number.isFinite(total) || !Number.isFinite(pageIpp) || pageIpp <= 0) {
      throw new ProflowersError('parse', `/catalog/products page=${page}: неожиданная форма ответа`)
    }
    return {
      ...data,
      list: data.list,
      pages: { total, ipp: pageIpp, pg: Number(data.pages?.pg ?? page) },
    }
  }

  // JSON-запрос с одним перелогином: HTML вместо JSON (или 401/403) значит, что сессия слетела.
  private async getJson<T>(pathAndQuery: string, referer: string = EXCHANGE_REFERER): Promise<T> {
    if (!this.loggedIn) await this.login()

    let result = await this.fetchJson(pathAndQuery, referer)
    if (!result.ok) {
      if (this.reloginCount >= MAX_RELOGINS) {
        throw new ProflowersError('session', `Сессия слетала ${MAX_RELOGINS} раза за прогон — останавливаемся`)
      }
      this.reloginCount += 1
      this.log(`сессия слетела на ${pathAndQuery}, перелогин (${this.reloginCount}/${MAX_RELOGINS})`)
      await this.login()
      result = await this.fetchJson(pathAndQuery, referer)
      if (!result.ok) {
        throw new ProflowersError('session', `${pathAndQuery}: после перелогина снова не JSON`)
      }
    }
    return result.data as T
  }

  // Один JSON-запрос без перелогина. ok:false — сессия не признана (HTML-оболочка SPA, 401/403).
  private async fetchJson(pathAndQuery: string, referer: string): Promise<JsonResult> {
    const res = await this.request(`${BASE_URL}${pathAndQuery}`, { headers: jsonHeaders(referer) })
    const text = await res.text()

    if (res.status === 401 || res.status === 403) return { ok: false }
    if (res.status >= 400) {
      throw new ProflowersError('http', `${pathAndQuery}: HTTP ${res.status}`, res.status)
    }
    const contentType = res.headers.get('content-type') ?? ''
    if (contentType.includes('html') || /^\s*</.test(text)) return { ok: false }

    try {
      return { ok: true, data: JSON.parse(text) }
    } catch {
      throw new ProflowersError('parse', `${pathAndQuery}: ответ не является JSON`)
    }
  }

  // Запрос с ручным следованием редиректам: Set-Cookie нужно собирать на каждом шаге
  // (сессионная cookie приходит именно в 302 от login_check). Уходить с домена нельзя —
  // иначе cookie утекут.
  private async request(url: string, options: RequestOptions = {}): Promise<Response> {
    let method = options.method ?? 'GET'
    let body = options.body
    let headers = options.headers ?? {}
    let current = url

    for (let hop = 0; ; hop++) {
      const res = await this.fetchPaced(current, method, headers, body)
      const location = res.headers.get('location')
      const isRedirect = res.status >= 300 && res.status < 400 && location !== null
      if (!isRedirect || options.followRedirects === false) return res

      if (hop >= MAX_REDIRECTS) {
        throw new ProflowersError('http', `Слишком много редиректов с ${new URL(url).pathname}`)
      }
      const next = new URL(location, current)
      if (next.origin !== BASE_URL) {
        throw new ProflowersError('http', `Редирект на посторонний хост ${next.host}`)
      }
      await res.body?.cancel()

      if (res.status === 301 || res.status === 302 || res.status === 303) {
        method = 'GET'
        body = undefined
        headers = Object.fromEntries(
          Object.entries(headers).filter(([key]) => key.toLowerCase() !== 'content-type'),
        )
      }
      current = next.toString()
    }
  }

  // Один HTTP-шаг: пауза 1–1.5 с, cookie из jar, таймаут, ретраи на 429/5xx и сетевые сбои.
  // После исчерпания попыток 429/5xx возвращается как есть — вызывающий решает, что это ошибка.
  private async fetchPaced(
    url: string,
    method: string,
    headers: Record<string, string>,
    body: string | undefined,
  ): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      await this.pace()

      const cookie = this.jar.header()
      let res: Response | undefined
      let networkError: unknown
      try {
        res = await fetch(url, {
          method,
          headers: cookie ? { ...headers, Cookie: cookie } : headers,
          body,
          redirect: 'manual',
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        })
      } catch (error) {
        networkError = error
      } finally {
        this.lastRequestAt = Date.now()
      }

      let waitMs = RETRY_DELAYS_MS[attempt]
      if (res) {
        this.jar.store(res.headers.getSetCookie())
        if (res.status !== 429 && res.status < 500) return res
        if (attempt >= RETRY_DELAYS_MS.length) return res
        const retryAfter = Number(res.headers.get('retry-after'))
        if (res.status === 429 && Number.isFinite(retryAfter) && retryAfter > 0) {
          waitMs = Math.min(retryAfter * 1000, MAX_RETRY_AFTER_MS)
        }
        await res.body?.cancel()
        this.log(`HTTP ${res.status} на ${new URL(url).pathname}, повтор через ${waitMs} мс`)
      } else {
        if (attempt >= RETRY_DELAYS_MS.length) {
          throw new ProflowersError('network', `${new URL(url).pathname}: ${describeError(networkError)}`)
        }
        this.log(`сеть: ${describeError(networkError)}, повтор через ${waitMs} мс`)
      }
      await sleep(waitMs)
    }
  }

  // Держит паузу 1000–1500 мс между запросами (считая от конца предыдущего).
  private async pace(): Promise<void> {
    const gap = MIN_GAP_MS + Math.random() * (MAX_GAP_MS - MIN_GAP_MS)
    const wait = this.lastRequestAt + gap - Date.now()
    if (wait > 0) await sleep(wait)
  }
}

/** Клиент из переменных окружения PF_EMAIL / PF_PASS (только env, в коде их нет). */
export function createProflowersClientFromEnv(log?: (message: string) => void): ProflowersClient {
  const email = process.env.PF_EMAIL
  const password = process.env.PF_PASS
  if (!email || !password) {
    throw new ProflowersError('config', 'Не заданы PF_EMAIL / PF_PASS в переменных окружения')
  }
  return new ProflowersClient({ email, password }, log)
}
