const DEFAULT_RETRY_DELAYS_MS = [0, 150, 350, 750] as const

export async function findKnownOutgoingWithRetry<T>(
  lookup: () => Promise<T | null>,
  delaysMs: readonly number[] = DEFAULT_RETRY_DELAYS_MS,
): Promise<T | null> {
  for (const delayMs of delaysMs) {
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs))
    const outgoing = await lookup()
    if (outgoing) return outgoing
  }
  return null
}
