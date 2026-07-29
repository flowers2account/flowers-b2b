import { createHmac, timingSafeEqual } from 'crypto'

type OrderAccessPayload = {
  orderId: number
  clientId: string
  phone: string
  exp: number
}

const b64 = (value: string | Buffer) => Buffer.from(value).toString('base64url')

function secret() {
  return process.env.ORDER_ACCESS_TOKEN_SECRET
    || process.env.ADMIN_ACTION_SECRET
    || process.env.SUPABASE_SERVICE_ROLE_KEY
    || ''
}

function sign(payload: string) {
  const key = secret()
  if (!key) throw new Error('ORDER_ACCESS_TOKEN_SECRET is not configured')
  return createHmac('sha256', key).update(payload).digest('base64url')
}

export function createOrderAccessToken(input: Omit<OrderAccessPayload, 'exp'>) {
  const payload = b64(JSON.stringify({
    ...input,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 14,
  } satisfies OrderAccessPayload))
  return `${payload}.${sign(payload)}`
}

export function verifyOrderAccessToken(token: string | null | undefined, orderId?: number) {
  if (!token || !token.includes('.')) return null
  const [payload, sig] = token.split('.', 2)
  if (!payload || !sig) return null

  const expected = sign(payload)
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as OrderAccessPayload
    if (!Number.isFinite(parsed.orderId) || !parsed.clientId || !parsed.phone || !Number.isFinite(parsed.exp)) return null
    if (parsed.exp < Math.floor(Date.now() / 1000)) return null
    if (orderId !== undefined && parsed.orderId !== orderId) return null
    return parsed
  } catch {
    return null
  }
}
