# Hosted Encrypted Sharing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store an existing encrypted package privately, permit only its Renvoy sender or named recipient to retrieve it, and enforce expiry and sender revocation without ever storing the recovery key.

**Architecture:** The Worker accepts a package as opaque bytes, writes it plus an owner manifest and recipient index in private R2 paths, and uses Renvoy account IDs for every read/delete decision. Retrieval checks expiry before streaming bytes; revocation removes all three objects. The browser’s existing decrypt screen remains responsible for recovery-key import and AES-GCM decryption.

**Tech Stack:** Cloudflare Worker/R2, Renvoy capability verification, browser AES-GCM packages, Node built-in test runner.

---

### Task 1: Define opaque-share records and deterministic private keys

**Files:**
- Create: `worker/src/shares.js`
- Create: `worker/test/shares.test.js`

- [x] Write failing tests for expiring share records, owner manifest keys, recipient index keys, and no recovery-key field.
- [x] Implement input validation, keys, and public response serialization.
- [x] Run the focused share tests (using the available WSL Node 22 runtime).

### Task 2: Add authenticated create, retrieve, and revoke routes

**Files:**
- Modify: `worker/src/index.js`
- Modify: `worker/test/jobs.test.js`

- [x] Write failing route tests for recipient-only retrieval, expiry enforcement, and owner-only revocation.
- [x] Implement multipart package storage, R2 streaming download, cleanup on failure, and `DELETE /api/shares/:id`.
- [x] Run the worker tests for the hosted-share routes (using the available WSL Node 22 runtime).

### Task 3: Document and publish

**Files:**
- Modify: `README.md`
- Modify: `worker/wrangler.toml`
- Modify: `docs/superpowers/plans/2026-07-19-hosted-encrypted-sharing.md`

- [x] Document expiry/revocation and the recovery-key boundary.
- [ ] Run all test groups, syntax checks, and `git diff --check`.
- [ ] Commit and push only the hosted-share scope.
