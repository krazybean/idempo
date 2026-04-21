export type IdempoRequest = {
  headers?: Record<string, string | string[] | undefined>
}

export type GuardOptions = {
  key?: string | (() => string)
  ttl?: number
}

export type Hooks = {
  onHit?: (key: string) => void
  onMiss?: (key: string) => void
  onError?: (key: string, error: unknown) => void
}

export type Entry<T = unknown> = {
  promise: Promise<T>
}

export type MaybePromise<T> = T | Promise<T>

export interface Store {
  get<T>(key: string): MaybePromise<Entry<T> | undefined>
  set<T>(key: string, entry: Entry<T>, ttlSeconds: number): MaybePromise<void>
  delete(key: string): MaybePromise<void>
  deleteIfSame<T>(key: string, entry: Entry<T>): MaybePromise<void>
}

export type RequestStore = Store

export type CreateIdempoConfig = {
  store?: Store
  hooks?: Hooks
}
