export type HttpBodyKind = 'empty' | 'json' | 'text' | 'invalid_json'

export interface ParsedHttpResponse<T = unknown> {
  status: number
  contentType: string
  body: string
  bodyKind: HttpBodyKind
  data: T | null
}

export async function readHttpResponse<T = unknown>(response: Response): Promise<ParsedHttpResponse<T>> {
  const body = await response.text()
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''

  if (!body.trim()) {
    return { status: response.status, contentType, body, bodyKind: 'empty', data: null }
  }

  if (!contentType.includes('json')) {
    return { status: response.status, contentType, body, bodyKind: 'text', data: null }
  }

  try {
    return {
      status: response.status,
      contentType,
      body,
      bodyKind: 'json',
      data: JSON.parse(body) as T,
    }
  } catch {
    return { status: response.status, contentType, body, bodyKind: 'invalid_json', data: null }
  }
}

export function summarizeHttpError(parsed: Pick<ParsedHttpResponse, 'status' | 'bodyKind'>): string {
  return `http_${parsed.status}_${parsed.bodyKind}`
}
