import assert from 'node:assert/strict'
import { readHttpResponse } from '../src/lib/amo-chat/http-response'

async function parsed(status: number, body: string, contentType?: string) {
  const responseBody = status === 204 ? null : body
  return readHttpResponse(new Response(responseBody, {
    status,
    headers: contentType ? { 'content-type': contentType } : {},
  }))
}

async function main() {
  assert.equal((await parsed(204, '')).bodyKind, 'empty')
  assert.equal((await parsed(200, '')).bodyKind, 'empty')
  assert.deepEqual((await parsed(200, '{"ok":true}', 'application/json')).data, { ok: true })
  assert.equal((await parsed(400, '<html>bad</html>', 'text/html')).bodyKind, 'text')
  assert.equal((await parsed(200, '{broken', 'application/json')).bodyKind, 'invalid_json')
  console.log('test-amo-http-responses: ok')
}

void main()
