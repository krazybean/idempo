import type { Entry, Store } from "../types"

type StoredEntry<T> = {
  entry: Entry<T>
  expiresAt: number
}

export class MemoryRequestStore implements Store {
  private readonly data = new Map<string, StoredEntry<unknown>>()
  private readonly now: () => number

  constructor(options?: { now?: () => number }) {
    this.now = options?.now ?? Date.now
  }

  get<T>(key: string): Entry<T> | undefined {
    const stored = this.data.get(key)
    if (!stored) {
      return undefined
    }

    if (this.isExpired(stored)) {
      this.data.delete(key)
      return undefined
    }

    return stored.entry as Entry<T>
  }

  set<T>(key: string, entry: Entry<T>, ttlSeconds: number): void {
    const expiresAt = this.now() + ttlSeconds * 1000
    this.data.set(key, {
      entry: entry as Entry<unknown>,
      expiresAt,
    })
    this.sweepExpired()
  }

  delete(key: string): void {
    this.data.delete(key)
  }

  deleteIfSame<T>(key: string, entry: Entry<T>): void {
    const current = this.data.get(key)
    if (current?.entry === entry) {
      this.data.delete(key)
    }
  }

  private sweepExpired(): void {
    const now = this.now()
    for (const [key, stored] of this.data.entries()) {
      if (stored.expiresAt <= now) {
        this.data.delete(key)
      }
    }
  }

  private isExpired(stored: StoredEntry<unknown>): boolean {
    return stored.expiresAt <= this.now()
  }
}

export const memoryStore = new MemoryRequestStore()
