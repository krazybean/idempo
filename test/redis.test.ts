import test from "node:test"
import assert from "node:assert/strict"

import { createIdempo } from "../src/create"
import { createRedisStore, RedisDuplicateInFlightError } from "../src/store/redis"

class FakeRedis {
  private readonly data = new Map<string, string>()

  async get(key: string): Promise<string | null> {
    return this.data.get(key) ?? null
  }

  async set(
    key: string,
    value: string,
    _mode: "EX",
    _ttlSeconds: number,
    condition?: "NX"
  ): Promise<"OK" | null> {
    if (condition === "NX" && this.data.has(key)) {
      return null
    }

    this.data.set(key, value)
    return "OK"
  }

  async del(key: string): Promise<number> {
    return this.data.delete(key) ? 1 : 0
  }
}

test("redis store dedupes concurrent calls in same process", async () => {
  const client = new FakeRedis()
  const idempo = createIdempo({ store: createRedisStore(client) })
  let calls = 0

  const handler = async () => {
    calls += 1
    return "ok"
  }

  const [a, b] = await Promise.all([
    idempo.guardRequest({}, { key: "redis-same-process", ttl: 1 }, handler),
    idempo.guardRequest({}, { key: "redis-same-process", ttl: 1 }, handler),
  ])

  assert.equal(a, "ok")
  assert.equal(b, "ok")
  assert.equal(calls, 1)
})

test("redis store surfaces duplicate-in-flight when key exists remotely", async () => {
  const client = new FakeRedis()
  const redisKey = "idempo:remote-busy-key"
  await client.set(redisKey, JSON.stringify({ token: "remote" }), "EX", 60, "NX")

  const idempo = createIdempo({ store: createRedisStore(client) })
  let calls = 0

  await assert.rejects(
    idempo.guardRequest({}, { key: "remote-busy-key", ttl: 1 }, async () => {
      calls += 1
      return "should-not-run"
    }),
    (error: unknown) => {
      assert.ok(error instanceof RedisDuplicateInFlightError)
      assert.equal((error as RedisDuplicateInFlightError).key, "remote-busy-key")
      return true
    }
  )

  assert.equal(calls, 0)
})
