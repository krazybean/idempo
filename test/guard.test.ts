import test from "node:test"
import assert from "node:assert/strict"

import { createIdempo } from "../src/create"
import { guardRequest } from "../src/guard"
import { MemoryRequestStore } from "../src/store/memory"

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

test("runs handler once for concurrent requests with same key", async () => {
  let calls = 0

  const handler = async () => {
    calls += 1
    return { ok: true }
  }

  const [a, b] = await Promise.all([
    guardRequest({}, { key: "same-key", ttl: 1 }, handler),
    guardRequest({}, { key: "same-key", ttl: 1 }, handler),
  ])

  assert.deepEqual(a, { ok: true })
  assert.deepEqual(b, { ok: true })
  assert.equal(calls, 1)
})

test("returns cached result during ttl window", async () => {
  let calls = 0

  const first = await guardRequest(
    {},
    { key: "cache-key", ttl: 1 },
    async () => {
      calls += 1
      return "value"
    }
  )

  const second = await guardRequest(
    {},
    { key: "cache-key", ttl: 1 },
    async () => {
      calls += 1
      return "new-value"
    }
  )

  assert.equal(first, "value")
  assert.equal(second, "value")
  assert.equal(calls, 1)
})

test("executes without key", async () => {
  let calls = 0

  const result = await guardRequest({}, {}, async () => {
    calls += 1
    return 42
  })

  assert.equal(result, 42)
  assert.equal(calls, 1)
})

test("supports key as function", async () => {
  let calls = 0

  const [a, b] = await Promise.all([
    guardRequest({}, { key: () => "fn-key", ttl: 1 }, async () => {
      calls += 1
      return "ok"
    }),
    guardRequest({}, { key: () => "fn-key", ttl: 1 }, async () => {
      calls += 1
      return "ok"
    }),
  ])

  assert.equal(a, "ok")
  assert.equal(b, "ok")
  assert.equal(calls, 1)
})

test("skips dedupe when key function returns empty string", async () => {
  let calls = 0

  const first = await guardRequest({}, { key: () => "", ttl: 1 }, async () => {
    calls += 1
    return "first"
  })

  const second = await guardRequest({}, { key: () => "", ttl: 1 }, async () => {
    calls += 1
    return "second"
  })

  assert.equal(first, "first")
  assert.equal(second, "second")
  assert.equal(calls, 2)
})

test("removes failed execution so retry can run", async () => {
  let calls = 0

  await assert.rejects(
    guardRequest({}, { key: "fails-once", ttl: 1 }, async () => {
      calls += 1
      throw new Error("boom")
    }),
    /boom/
  )

  const value = await guardRequest({}, { key: "fails-once", ttl: 1 }, async () => {
    calls += 1
    return "ok"
  })

  assert.equal(value, "ok")
  assert.equal(calls, 2)
})

test("re-executes handler after ttl expiration", async () => {
  let calls = 0

  const first = await guardRequest({}, { key: "ttl-expiry", ttl: 0.01 }, async () => {
    calls += 1
    return "first"
  })

  await sleep(20)

  const second = await guardRequest({}, { key: "ttl-expiry", ttl: 0.01 }, async () => {
    calls += 1
    return "second"
  })

  assert.equal(first, "first")
  assert.equal(second, "second")
  assert.equal(calls, 2)
})

test("stale failed promise does not delete newer entry", async () => {
  let rejectFirst: ((error: Error) => void) | undefined
  let secondCalls = 0

  const first = guardRequest({}, { key: "stale-delete-race", ttl: 0.01 }, async () => {
    return new Promise<string>((_, reject) => {
      rejectFirst = reject
    })
  })

  await sleep(20)

  const second = await guardRequest({}, { key: "stale-delete-race", ttl: 1 }, async () => {
    secondCalls += 1
    return "fresh"
  })

  rejectFirst?.(new Error("stale-failure"))
  await assert.rejects(first, /stale-failure/)

  const third = await guardRequest({}, { key: "stale-delete-race", ttl: 1 }, async () => {
    secondCalls += 1
    return "should-not-run"
  })

  assert.equal(second, "fresh")
  assert.equal(third, "fresh")
  assert.equal(secondCalls, 1)
})

test("createIdempo creates isolated instances by default", async () => {
  const instanceA = createIdempo()
  const instanceB = createIdempo()

  let callsA = 0
  let callsB = 0

  const a = await instanceA.guardRequest({}, { key: "shared-key", ttl: 1 }, async () => {
    callsA += 1
    return "a"
  })

  const b = await instanceB.guardRequest({}, { key: "shared-key", ttl: 1 }, async () => {
    callsB += 1
    return "b"
  })

  assert.equal(a, "a")
  assert.equal(b, "b")
  assert.equal(callsA, 1)
  assert.equal(callsB, 1)
})

test("createIdempo uses injected store across instances", async () => {
  const sharedStore = new MemoryRequestStore()
  const instanceA = createIdempo({ store: sharedStore })
  const instanceB = createIdempo({ store: sharedStore })

  let calls = 0
  const handler = async () => {
    calls += 1
    return "value"
  }

  const [a, b] = await Promise.all([
    instanceA.guardRequest({}, { key: "injected-store-key", ttl: 1 }, handler),
    instanceB.guardRequest({}, { key: "injected-store-key", ttl: 1 }, handler),
  ])

  assert.equal(a, "value")
  assert.equal(b, "value")
  assert.equal(calls, 1)
})

test("fires onMiss then onHit hooks for keyed requests", async () => {
  const events: string[] = []
  const idempo = createIdempo({
    hooks: {
      onMiss: (key) => events.push(`miss:${key}`),
      onHit: (key) => events.push(`hit:${key}`),
    },
  })

  await idempo.guardRequest({}, { key: "hook-key", ttl: 1 }, async () => "value")
  await idempo.guardRequest({}, { key: "hook-key", ttl: 1 }, async () => "other")

  assert.deepEqual(events, ["miss:hook-key", "hit:hook-key"])
})

test("fires onError hook when handler fails for keyed requests", async () => {
  const events: string[] = []
  const idempo = createIdempo({
    hooks: {
      onError: (key, error) => {
        const message = error instanceof Error ? error.message : String(error)
        events.push(`error:${key}:${message}`)
      },
    },
  })

  await assert.rejects(
    idempo.guardRequest({}, { key: "error-key", ttl: 1 }, async () => {
      throw new Error("boom")
    }),
    /boom/
  )

  assert.deepEqual(events, ["error:error-key:boom"])
})

test("isolates hook exceptions from request lifecycle", async () => {
  const idempo = createIdempo({
    hooks: {
      onMiss: () => {
        throw new Error("hook-failure")
      },
    },
  })

  const value = await idempo.guardRequest({}, { key: "safe-hook-key", ttl: 1 }, async () => {
    return "ok"
  })

  assert.equal(value, "ok")
})
