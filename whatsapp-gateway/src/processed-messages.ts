export class ProcessedMessageStore {
  private readonly seenIds = new Map<string, number>()

  constructor(
    private readonly ttlMs = 24 * 60 * 60 * 1000,
    private readonly maxSize = 5000,
  ) {}

  hasSeen(id: string): boolean {
    this.cleanup()

    if (this.seenIds.has(id)) {
      return true
    }

    this.seenIds.set(id, Date.now())

    if (this.seenIds.size > this.maxSize) {
      const oldest = this.seenIds.keys().next().value
      if (oldest) this.seenIds.delete(oldest)
    }

    return false
  }

  private cleanup(): void {
    const threshold = Date.now() - this.ttlMs

    for (const [id, createdAt] of this.seenIds.entries()) {
      if (createdAt < threshold) {
        this.seenIds.delete(id)
      }
    }
  }
}
