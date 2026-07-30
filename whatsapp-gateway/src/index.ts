import { loadConfig } from './config.js'
import { HttpAiAgentClient } from './ai/http-ai-agent-client.js'
import { AiMessageHandler } from './handlers/ai-message-handler.js'
import { TestAutoReplyHandler } from './handlers/test-auto-reply.js'
import { HttpServer } from './http-server.js'
import { createLogger } from './logger.js'
import { InMemoryMessageStore } from './message-store.js'
import { MainProjectClient } from './main-project-client.js'
import { WhatsAppClient } from './whatsapp-client.js'

const config = loadConfig()
const logger = createLogger(config)
const messageStore = new InMemoryMessageStore(logger)
const mainProject = new MainProjectClient(config, logger)
const handler = config.AI_ENABLED
  ? new AiMessageHandler(new HttpAiAgentClient(config, logger), logger)
  : new TestAutoReplyHandler(config)
const whatsapp = new WhatsAppClient(config, handler, messageStore, mainProject, logger)
const httpServer = new HttpServer(config, whatsapp, logger)

async function main(): Promise<void> {
  await httpServer.start()
  await whatsapp.connect()
}

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  logger.info({ signal }, 'shutdown requested')

  try {
    await httpServer.stop()
    await whatsapp.shutdown()
    process.exit(0)
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : String(error) }, 'shutdown failed')
    process.exit(1)
  }
}

process.once('SIGINT', (signal) => {
  void shutdown(signal)
})

process.once('SIGTERM', (signal) => {
  void shutdown(signal)
})

main().catch((error) => {
  logger.error({ error: error instanceof Error ? error.message : String(error) }, 'fatal startup error')
  process.exit(1)
})
