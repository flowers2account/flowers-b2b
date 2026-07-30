# Flowers B2B WhatsApp Gateway

Separate long-running Node.js service for one WhatsApp Business number through Baileys. It must run outside Next.js and outside Vercel Functions.

## Install

```bash
npm install
```

## Env

Copy `.env.example` to `.env` and set real secrets:

```bash
PORT=3025
HOST=127.0.0.1
LOG_LEVEL=info
AUTH_STATE_DIR=auth
AI_ENABLED=true
AI_AGENT_URL=http://127.0.0.1:3000/api/internal/ai/whatsapp-reply
AI_AGENT_SECRET=<same-as-main-WHATSAPP_GATEWAY_AI_API_KEY>
WHATSAPP_EVENT_SECRET=<same-as-main-WHATSAPP_GATEWAY_EVENT_API_KEY>
AI_TIMEOUT_MS=70000
STALE_MESSAGE_MAX_AGE_MS=300000
```

`HOST` must be `127.0.0.1`. The gateway port is not intended for public access.

## Commands

```bash
npm run dev
npm run typecheck
npm run build
npm run start
```

There is no campaign manager, amoJo, Umnico, media handling, browser automation, Selenium, Puppeteer, Playwright, or Chromium in this service.

## Auth State

Baileys auth state is stored in `AUTH_STATE_DIR`. Keep it on persistent disk on VPS. Do not commit it and do not put it into Docker/Vercel artifacts.

Delete the auth directory only when you intentionally want to re-authorize the number and scan a new QR.

## Health

```bash
curl http://127.0.0.1:3025/health
```

Returns process alive status, WhatsApp status, uptime, last incoming message time, and last outgoing message time.

## Send Message

```bash
curl -X POST http://127.0.0.1:3025/messages/send \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <AI_AGENT_SECRET>" \
  -d '{"phone":"77000000000","text":"Test","idempotency_key":"manual-test-001"}'
```

`idempotency_key` is persisted through the main project internal event endpoint in Supabase. Reusing the key does not send the message again after restart.

## Human Takeover

Manual outgoing messages from WhatsApp itself are recorded with `source=human` and disable AI only for that private `chatJid`. Gateway messages are recorded with `source=gateway`; AI replies are recorded with `source=ai`; those do not trigger human takeover.

Re-enable AI:

```bash
curl -X POST http://127.0.0.1:3025/dialogs/ai \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <AI_AGENT_SECRET>" \
  -d '{"chatJid":"240480000454858@lid","ai_enabled":true}'
```

Full VPS instructions are in `docs/WHATSAPP_GATEWAY_DEPLOY.md`.
