# idempo — Safe, minimal idempotency for APIs

`idempo` helps API services avoid duplicate side effects from retries, repeated submissions, and concurrent requests.

## Problem

APIs in production commonly face:
- Duplicate requests from impatient users or clients retrying on timeouts
- Automatic retries from load balancers, SDKs, queues, or network middleware
- Race conditions where two requests with the same intent execute at the same time

Without idempotency controls, these can create double charges, duplicated writes, and inconsistent state.

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
