# Secure Sharing Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user download an expiry-labelled encrypted clean-copy package and a privacy report without creating a server-side share or leaking source names/findings by default.

**Architecture:** Keep the policy/report boundary pure in `src/share/policy.js`. Keep AES-GCM and base64 envelope serialization in `src/share/crypto.js`; the generated key stays in its return value and is omitted from the envelope. The browser entry point presents the capability only after a clean copy exists.

**Tech Stack:** Browser ES modules, Web Crypto AES-GCM, Node test runner, static HTML/CSS.

---

### Task 1: Share policy and private report boundary

**Files:**
- Create: `src/share/policy.js`
- Create: `test/share-policy.test.js`

- [ ] **Step 1: Write failing tests** for expiry validation, ready/unconfigured package state, and a default report payload that omits `originalFileName` and `findings`.
- [ ] **Step 2: Run** `node --test test/share-policy.test.js` and confirm it fails because the module does not exist.
- [ ] **Step 3: Implement** the minimal pure helpers and explicitly opt in to detailed findings.
- [ ] **Step 4: Run** `node --test test/share-policy.test.js` and confirm it passes.

### Task 2: Encrypted package serialization

**Files:**
- Create: `src/share/crypto.js`
- Create: `test/share-crypto.test.js`

- [ ] **Step 1: Write failing tests** proving the exported package can be decrypted with the returned in-memory key and its serialized envelope contains no key material.
- [ ] **Step 2: Run** `node --test test/share-crypto.test.js` and confirm it fails because the module does not exist.
- [ ] **Step 3: Implement** AES-256-GCM encryption with a random IV and JSON-safe base64 envelope.
- [ ] **Step 4: Run** `node --test test/share-crypto.test.js` and confirm it passes.

### Task 3: Optional local-only sharing UI

**Files:**
- Modify: `index.html`
- Modify: `styles.css`
- Modify: `src/main.js`
- Modify: `README.md`

- [ ] **Step 1: Add a disabled-by-default Share safely section** after the clean-copy controls, including expiry, optional findings consent, package download, recovery-key download, privacy-report download, and an explicit unconfigured delivery message.
- [ ] **Step 2: Wire it only after clean-copy creation**, invalidate it when the clean copy changes, and use the tested policy/crypto modules.
- [ ] **Step 3: Update documentation** to state that packages are downloaded locally and no public link/storage is provided without a backend.
- [ ] **Step 4: Run** `npm test` and `npm run check`.

### Task 4: Review and commit

**Files:**
- Modify: all files above

- [ ] **Step 1: Inspect** `git diff --check` and `git diff --stat`.
- [ ] **Step 2: Run full verification** with `npm test` and `npm run check`.
- [ ] **Step 3: Commit** the scoped share foundations with a conventional message.
