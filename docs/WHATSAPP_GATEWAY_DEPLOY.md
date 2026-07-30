# WhatsApp Gateway VPS Deploy

Gateway is a separate long-running Node.js service. It is not a Next.js route, Vercel Function, Edge Runtime, nginx location, amoJo channel, campaign runner, or Umnico integration.

Production assumptions:

- Main app path: `/srv/flowers-b2b`
- Main app PM2 process: `flowers-b2b`
- Main app local URL: `http://127.0.0.1:3000`
- Gateway path: `/srv/flowers-b2b/whatsapp-gateway`
- Gateway PM2 process: `flowers-whatsapp-gateway`
- Gateway bind: `127.0.0.1:3025`

Do not expose port `3025` publicly and do not change nginx for this stage.

## Database State

Human takeover is stored in `public.conversations`:

- `ai_enabled`
- `takeover_status`
- `takeover_started_at`
- `takeover_reason`
- `whatsapp_chat_jid`
- existing `phone`
- existing `id`

Outgoing idempotency is stored in `public.whatsapp_gateway_outbox` by unique `idempotency_key`. The gateway also keeps a small in-memory cache for current-process echoes, but Supabase is the persistent guard after restart.

Run the migration before starting the gateway in production:

```bash
cd /srv/flowers-b2b
supabase db push
```

If production migrations are applied by CI or Supabase Dashboard, apply `supabase/migrations/20260730064205_whatsapp_gateway_state.sql` there instead.

## Main App Env

Add to the main Next.js environment:

```bash
WHATSAPP_GATEWAY_AI_API_KEY=<shared-ai-secret>
WHATSAPP_GATEWAY_EVENT_API_KEY=<separate-event-secret>
WHATSAPP_AI_TIMEOUT_MS=55000
AI_CLASSIFICATION_TIMEOUT_MS=10000
```

Restart main app after changing env:

```bash
pm2 reload flowers-b2b --update-env
```

## Gateway Env

Create `/srv/flowers-b2b/whatsapp-gateway/.env` or export these vars before PM2 start:

```bash
PORT=3025
HOST=127.0.0.1
LOG_LEVEL=info
AUTH_STATE_DIR=/srv/flowers-b2b/whatsapp-gateway/auth
AI_ENABLED=true
AI_AGENT_URL=http://127.0.0.1:3000/api/internal/ai/whatsapp-reply
AI_AGENT_SECRET=<same-as-WHATSAPP_GATEWAY_AI_API_KEY>
WHATSAPP_EVENT_SECRET=<same-as-WHATSAPP_GATEWAY_EVENT_API_KEY>
AI_TIMEOUT_MS=70000
STALE_MESSAGE_MAX_AGE_MS=300000
```

`AUTH_STATE_DIR` must persist on disk and must not be committed. QR is required only for the first authorization or after deleting this directory/logout.

## Install And Build

```bash
cd /srv/flowers-b2b/whatsapp-gateway
npm ci
npm run typecheck
npm run build
```

## PM2 Start

```bash
cd /srv/flowers-b2b/whatsapp-gateway
pm2 start ecosystem.config.cjs --only flowers-whatsapp-gateway
pm2 save
```

Reload after code/env changes:

```bash
cd /srv/flowers-b2b/whatsapp-gateway
pm2 reload flowers-whatsapp-gateway --update-env
```

Logs:

```bash
pm2 logs flowers-whatsapp-gateway
```

## First QR Test

1. Start the main app first.
2. Start `flowers-whatsapp-gateway`.
3. Open PM2 logs.
4. Scan the QR from WhatsApp Business Linked Devices.
5. Wait for `connected`.
6. Check health locally:

```bash
curl -fsS http://127.0.0.1:3025/health
```

Expected shape:

```json
{
  "process": "alive",
  "whatsapp": "connected",
  "whatsappStatus": "connected",
  "uptimeSeconds": 10,
  "lastIncomingMessageAt": null,
  "lastOutgoingMessageAt": null
}
```

## Send Test Message

Do this only when explicitly needed:

```bash
curl -X POST http://127.0.0.1:3025/messages/send \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <AI_AGENT_SECRET>" \
  -d '{"phone":"77000000000","text":"Test","idempotency_key":"manual-test-001"}'
```

Reusing the same `idempotency_key` must not send a second WhatsApp message, even after gateway restart.

## Human Takeover

When a manager sends a manual outgoing message from WhatsApp itself, Baileys emits `fromMe=true`. Gateway ignores messages it sent itself and records only real manual outgoing events with `source=human`. The main app persists:

- `ai_enabled=false`
- `takeover_status=human`
- `takeover_started_at=now`
- `takeover_reason=manual_outgoing`

Incoming customer messages for that exact private `chatJid` are ignored by AI while takeover is active.

Manual re-enable through gateway API:

```bash
curl -X POST http://127.0.0.1:3025/dialogs/ai \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <AI_AGENT_SECRET>" \
  -d '{"chatJid":"240480000454858@lid","ai_enabled":true}'
```

## Filters

Gateway does not answer:

- groups;
- statuses;
- broadcasts;
- system/stub messages;
- its own sent messages;
- old messages after reconnect;
- chats with persisted human takeover.

Media, amoJo, campaigns, and Umnico are intentionally not implemented in this stage.
