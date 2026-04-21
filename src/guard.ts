import { memoryStore } from "./store/memory"
import type { Entry, GuardOptions, Hooks, IdempoRequest, Store } from "./types"

const DEFAULT_TTL_SECONDS = 60

function isPromiseLike<T>(value: unknown): value is PromiseLike<T> {
  return (
    typeof value === "object" &&
    value !== null &&
    "then" in value &&
    typeof (value as { then?: unknown }).then === "function"
  )
}

function readIdempotencyKeyFromRequest(req: IdempoRequest): string | undefined {
  const header = req.headers?.["idempotency-key"]

  if (typeof header === "string") {
    return header
  }

  if (Array.isArray(header)) {
    return header[0]
  }

  return undefined
}

function getTtlSeconds(ttl?: number): number {
  if (typeof ttl !== "number" || Number.isNaN(ttl) || ttl <= 0) {
    return DEFAULT_TTL_SECONDS
  }

  return ttl
}

function resolveKey(req: IdempoRequest, options: GuardOptions): string | undefined {
  if (typeof options.key === "function") {
    return options.key()
  }

  if (typeof options.key === "string") {
    return options.key
  }

  return readIdempotencyKeyFromRequest(req)
}

export function createGuardRequest(store: Store) {
  return createGuardRequestWithHooks(store)
}

function emitHook(callback: (() => void) | undefined): void {
  try {
    callback?.()
  } catch {
    // Hook failures are intentionally isolated from request flow.
  }
}

export function createGuardRequestWithHooks(store: Store, hooks?: Hooks) {
  return async function guardRequest<T>(
    req: any,
    options: GuardOptions,
    handler: () => Promise<T>
  ): Promise<T> {
    const key = resolveKey(req ?? {}, options)
    if (!key) {
      return handler()
    }

    const maybeExisting = store.get<T>(key)
    const existing = isPromiseLike<Entry<T> | undefined>(maybeExisting)
      ? await maybeExisting
      : maybeExisting
    if (existing) {
      emitHook(() => hooks?.onHit?.(key))
      return existing.promise
    }

    emitHook(() => hooks?.onMiss?.(key))

    const ttlSeconds = getTtlSeconds(options.ttl)
    let resolveShared: (value: T) => void
    let rejectShared: (reason?: unknown) => void
    const sharedPromise = new Promise<T>((resolve, reject) => {
      resolveShared = resolve
      rejectShared = reject
    })

    const entry: Entry<T> = {
      promise: sharedPromise,
    }

    try {
      const maybeSet = store.set<T>(key, entry, ttlSeconds)
      if (isPromiseLike<void>(maybeSet)) {
        await maybeSet
      }
    } catch (error) {
      const maybeRaceWinner = store.get<T>(key)
      const raceWinner = isPromiseLike<Entry<T> | undefined>(maybeRaceWinner)
        ? await maybeRaceWinner
        : maybeRaceWinner
      if (raceWinner) {
        emitHook(() => hooks?.onHit?.(key))
        return raceWinner.promise
      }
      throw error
    }

    void handler()
      .then((value) => {
        resolveShared!(value)
      })
      .catch(async (error: unknown) => {
        emitHook(() => hooks?.onError?.(key, error))
        await store.deleteIfSame(key, entry)
        rejectShared!(error)
      })

    return sharedPromise
  }
}

export const guardRequest = createGuardRequest(memoryStore)
