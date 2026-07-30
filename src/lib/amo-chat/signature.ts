import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

const CONTENT_TYPE = 'application/json'

export function signAmoChatRequest(input: {
  method: string
  path: string
  body: string
  secret: string
  date?: string
}): Record<string, string> {
  const date = input.date ?? new Date().toUTCString()
  const contentMd5 = md5(input.body)
  const signatureBase = [
    input.method.toUpperCase(),
    contentMd5,
    CONTENT_TYPE,
    date,
    input.path,
  ].join('\n')

  return {
    Date: date,
    'Content-Type': CONTENT_TYPE,
    'Content-MD5': contentMd5,
    'X-Signature': hmacSha1(signatureBase, input.secret),
  }
}

export function verifyAmoChatWebhookSignature(input: {
  rawBody: string
  signature: string | null
  secret: string
}): boolean {
  if (!input.signature) return false

  const expected = hmacSha1(input.rawBody.trim(), input.secret)
  return timingSafeHexEqual(expected, input.signature.trim().toLowerCase())
}

function md5(value: string): string {
  return createHash('md5').update(value).digest('hex').toLowerCase()
}

function hmacSha1(value: string, secret: string): string {
  return createHmac('sha1', secret).update(value).digest('hex').toLowerCase()
}

function timingSafeHexEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'hex')
  const rightBuffer = Buffer.from(right, 'hex')
  if (leftBuffer.length !== rightBuffer.length) return false
  return timingSafeEqual(leftBuffer, rightBuffer)
}
