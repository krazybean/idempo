## Overview
idempo provides idempotency and duplicate request protection for APIs.

## Problem
APIs frequently suffer from duplicate submissions, retries, and race conditions that corrupt data or cause unintended side effects.

## Philosophy
- Prevent bugs, not just detect them
- Minimal and explicit
- Works with real-world retries and failures
- No framework lock-in

## Scope (v1)
- Idempotency key support
- Request deduplication
- TTL-based in-memory store
- Simple middleware/helper function

## Non-Goals
- No database adapters (yet)
- No distributed locking (yet)
- No framework-specific integrations

## API Design Principles
- Single function: `guardRequest`
- Works with plain request objects
- Optional configuration only
