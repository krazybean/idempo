import type { Entry, Store } from "../types"

type RedisLike = {
  get(key: string): Promise<string | null> | string | null
  set(
    key: string,
    value: string,
    mode: "EX",
    ttlSeconds: number,
    condition?: "NX"
  ): Promise<"OK" | null> | "OK" | null
  del(key: string): Promise<number> | number
}

type LocalEntry<T> = {
  entry: Entry<T>
  token: string
}

type RedisMarker = {
  token: string
}

export type RedisStoreOptions = {
  prefix?: string
}

export class RedisDuplicateInFlightError extends Error {
  readonly key: string

  constructor(key: string) {
    super(`idempo duplicate in flight for key: ${key}`)
    this.name = "RedisDuplicateInFlightError"
    this.key = key
  }
}

function toRedisKey(prefix: string, key: string): string {
  return `${prefix}:${key}`
}

function createToken(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

function safeParseMarker(value: string | null): RedisMarker | null {
  if (!value) {
    return null
  }

  try {
    const parsed = JSON.parse(value) as Partial<RedisMarker>
    if (typeof parsed.token === "string" && parsed.token.length > 0) {
      return { token: parsed.token }
    }
    return null
  } catch {
    return null
  }
}

export function createRedisStore(client: RedisLike, options?: RedisStoreOptions): Store {
  const prefix = options?.prefix ?? "idempo"
  const local = new Map<string, LocalEntry<unknown>>()

  return {
    get<T>(key: string): Entry<T> | undefined {
      const redisKey = toRedisKey(prefix, key)
      const localEntry = local.get(redisKey)
      if (localEntry) {
        return localEntry.entry as Entry<T>
      }
      return undefined
    },

    async set<T>(key: string, entry: Entry<T>, ttlSeconds: number): Promise<void> {
      const redisKey = toRedisKey(prefix, key)
      const token = createToken()
      local.set(redisKey, {
        entry: entry as Entry<unknown>,
        token,
      })

      const marker: RedisMarker = { token }
      const result = await client.set(
        redisKey,
        JSON.stringify(marker),
        "EX",
        Math.max(1, Math.ceil(ttlSeconds)),
        "NX"
      )

      if (result === null) {
        local.delete(redisKey)
        throw new RedisDuplicateInFlightError(key)
      }

      void entry.promise.finally(async () => {
        await this.deleteIfSame(key, entry)
      })
    },

    async delete(key: string): Promise<void> {
      const redisKey = toRedisKey(prefix, key)
      local.delete(redisKey)
      await client.del(redisKey)
    },

    async deleteIfSame<T>(key: string, entry: Entry<T>): Promise<void> {
      const redisKey = toRedisKey(prefix, key)
      const current = local.get(redisKey)
      if (!current || current.entry !== entry) {
        return
      }

      local.delete(redisKey)

      const markerRaw = await client.get(redisKey)
      const marker = safeParseMarker(markerRaw)
      if (marker && marker.token === current.token) {
        await client.del(redisKey)
      }
    },
  }
}
