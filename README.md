# idempo — Safe, minimal idempotency for APIs
[![npm version](https://img.shields.io/npm/v/idempo.svg)](https://www.npmjs.com/package/idempo)
![npm downloads](https://img.shields.io/npm/dm/idempo)
![license](https://img.shields.io/npm/l/idempo)

Stop duplicate requests from breaking your API.

idempo ensures:
- one execution per request key
- safe retries
- concurrency protection

## Install

```bash
npm install idempo
```

Works with any framework. No lock-in.

`idempo` helps API services avoid duplicate side effects from retries, repeated submissions, and concurrent requests.

## Problem

APIs in production commonly face:
- Duplicate requests from impatient users or clients retrying on timeouts
- Automatic retries from load balancers, SDKs, queues, or network middleware
- Race conditions where two requests with the same intent execute at the same time

Without idempotency controls, these can create double charges, duplicated writes, and inconsistent state.

## When should I use idempo?

Use idempo if your API:

- charges users (payments)
- creates records (orders, tickets, etc.)
- processes retries (queues, webhooks)
- runs in distributed environments

If duplicate requests would cause problems — you need idempo.

## Why idempo

- Prevents duplicate side effects with key-based request guarding
- Handles concurrency safely under in-flight duplicate requests
- Keeps a minimal API surface that is easy to audit and adopt
- Stays framework-agnostic with no framework lock-in

## Quick Start

```ts
import { guardRequest } from "idempo"

await guardRequest(req, {
  key: req.headers["idempotency-key"],
  ttl: 60,
}, async () => {
  return await handler()
})
```

## 30-second example

Without idempo:

```ts
await createOrder(req.body) // may run twice
```

## Concurrency Guarantees

idempo ensures:

- Only one handler executes per key
- Concurrent requests share the same result
- Failed requests do not poison future retries
- Expired entries allow safe re-execution

This behavior is enforced through a deterministic request lifecycle and strict state transitions.

**Best-effort locking only**

- This implementation does NOT provide full distributed locking guarantees
- Does NOT implement Redlock or multi-node consensus
- Suitable for most API retry protection scenarios, but not strict distributed coordination