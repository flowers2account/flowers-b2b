module.exports = {
  apps: [
    {
      name: 'flowers-whatsapp-gateway',
      cwd: '/srv/flowers-b2b/whatsapp-gateway',
      script: 'dist/index.js',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      env: {
        NODE_ENV: 'production',
        PORT: '3025',
        HOST: '127.0.0.1',
        LOG_LEVEL: process.env.LOG_LEVEL || 'info',
        AUTH_STATE_DIR: process.env.AUTH_STATE_DIR || '/srv/flowers-b2b/whatsapp-gateway/auth',
        AI_ENABLED: process.env.AI_ENABLED || 'true',
        AI_AGENT_URL: process.env.AI_AGENT_URL || 'http://127.0.0.1:3000/api/internal/ai/whatsapp-reply',
        AI_AGENT_SECRET: process.env.AI_AGENT_SECRET,
        WHATSAPP_EVENT_SECRET: process.env.WHATSAPP_EVENT_SECRET,
        AI_TIMEOUT_MS: process.env.AI_TIMEOUT_MS || '70000',
        STALE_MESSAGE_MAX_AGE_MS: process.env.STALE_MESSAGE_MAX_AGE_MS || '300000',
      },
    },
  ],
}
