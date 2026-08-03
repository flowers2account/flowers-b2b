export type AmoRecoveryStage =
  | 'amo_stale_link_detected'
  | 'amo_link_reset'
  | 'amo_message_retry_started'
  | 'amo_chat_recreated'

interface StaleErrorShape {
  status?: unknown
  staleEntity?: unknown
  staleLink?: unknown
}

export function isStaleAmoLinkError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false

  const candidate = error as StaleErrorShape
  const status = typeof candidate.status === 'number' ? candidate.status : undefined

  if (status === 401 || status === 403 || status === 429 || (status !== undefined && status >= 500)) {
    return false
  }

  if (status === 404 || status === 410) return true
  return status === 400 && (candidate.staleEntity === true || candidate.staleLink === true)
}

export async function withSingleStaleLinkRecovery<T>(input: {
  attempt: (retryCount: 0 | 1) => Promise<T>
  resetLink: () => Promise<void>
  onStage?: (stage: AmoRecoveryStage, retryCount: 0 | 1) => void
}): Promise<{ value: T; retryCount: 0 | 1 }> {
  try {
    return { value: await input.attempt(0), retryCount: 0 }
  } catch (error) {
    if (!isStaleAmoLinkError(error)) throw error

    input.onStage?.('amo_stale_link_detected', 0)
    await input.resetLink()
    input.onStage?.('amo_link_reset', 0)
    input.onStage?.('amo_message_retry_started', 1)

    const value = await input.attempt(1)
    input.onStage?.('amo_chat_recreated', 1)
    return { value, retryCount: 1 }
  }
}
