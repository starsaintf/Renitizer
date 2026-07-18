# Renitizer v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a static, local-first Renitizer privacy-sanitization PWA with genuine browser analysis, opt-in cloud analysis integration, and publishable GitHub Pages-compatible assets.

**Architecture:** Browser code is split into pure analysis/report modules and a thin UI controller. Browser-local features run only when their capability is present; an optional endpoint returns the same finding shape for cloud vision, audio PII, and video-frame analysis. A canvas pipeline creates metadata-free image copies.

**Tech Stack:** HTML, CSS, browser ES modules, Node test runner, Tesseract.js CDN loader, PWA manifest/service worker, optional Cloudflare Worker-compatible endpoint, Capacitor configuration.

---

### Task 1: Establish the pure privacy-domain model

**Files:**
- Create: `src/core/findings.js`
- Create: `src/core/risk-score.js`
- Create: `src/core/report.js`
- Create: `test/risk-score.test.js`

- [ ] **Step 1: Write failing score tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateRisk } from '../src/core/risk-score.js';

test('an unresolved high-confidence critical finding lowers safety', () => {
  const result = calculateRisk([{ severity: 'critical', confidence: 0.9, resolved: false }]);
  assert.ok(result.safetyScore < 50);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/risk-score.test.js`

Expected: FAIL because `risk-score.js` does not exist.

- [ ] **Step 3: Implement findings, scoring, and report helpers**

```js
export function calculateRisk(findings) {
  const weights = { low: 6, medium: 14, high: 27, critical: 42 };
  const exposure = findings.filter((finding) => !finding.resolved)
    .reduce((sum, finding) => sum + (weights[finding.severity] ?? 0) * finding.confidence, 0);
  return { safetyScore: Math.max(0, Math.round(100 - exposure)) };
}
```

- [ ] **Step 4: Run the unit tests**

Run: `node --test test/risk-score.test.js`

Expected: PASS.

### Task 2: Establish browser-local media inspection and sanitization

**Files:**
- Create: `src/scanners/file-facts.js`
- Create: `src/scanners/metadata.js`
- Create: `src/sanitize/image.js`
- Create: `test/metadata.test.js`

- [ ] **Step 1: Write failing tests for metadata marker detection**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { detectMetadataMarkers } from '../src/scanners/metadata.js';

test('recognizes EXIF and GPS marker strings in a byte buffer', () => {
  const bytes = new TextEncoder().encode('Exif GPSLatitude CameraModel').buffer;
  assert.deepEqual(detectMetadataMarkers(bytes), ['exif', 'gps', 'device']);
});
```

- [ ] **Step 2: Run the failing test**

Run: `node --test test/metadata.test.js`

Expected: FAIL because `metadata.js` does not exist.

- [ ] **Step 3: Implement byte marker scanning and canvas re-encoding**

```js
export function detectMetadataMarkers(buffer) {
  const text = new TextDecoder('latin1').decode(buffer);
  return [
    ['exif', /exif/i], ['gps', /gps(latitude|longitude|info)?/i], ['device', /camera(model|make)|apple|android/i]
  ].filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
}
```

- [ ] **Step 4: Run the unit tests**

Run: `node --test test/metadata.test.js`

Expected: PASS.

### Task 3: Add local AI and cloud-analysis adapters

**Files:**
- Create: `src/scanners/ocr.js`
- Create: `src/scanners/barcode.js`
- Create: `src/scanners/cloud.js`
- Create: `src/scanners/orchestrator.js`
- Create: `test/orchestrator.test.js`
- Create: `worker/src/index.js`
- Create: `worker/wrangler.toml`

- [ ] **Step 1: Write failing orchestration tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { runScanners } from '../src/scanners/orchestrator.js';

test('runs enabled scanners and preserves their findings', async () => {
  const findings = await runScanners({}, [async () => [{ id: 'gps' }]]);
  assert.deepEqual(findings, [{ id: 'gps' }]);
});
```

- [ ] **Step 2: Run the failing test**

Run: `node --test test/orchestrator.test.js`

Expected: FAIL because `orchestrator.js` does not exist.

- [ ] **Step 3: Implement capability-aware adapters and consented endpoint calls**

```js
export async function runScanners(input, scanners) {
  return (await Promise.all(scanners.map((scanner) => scanner(input)))).flat();
}
```

- [ ] **Step 4: Run the unit tests**

Run: `node --test test/orchestrator.test.js`

Expected: PASS.

### Task 4: Build the Renitizer privacy-lab interface

**Files:**
- Create: `index.html`
- Create: `styles.css`
- Create: `src/main.js`
- Create: `test/report.test.js`

- [ ] **Step 1: Write failing report behavior tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeReport } from '../src/core/report.js';

test('reports unresolved high findings as residual risks', () => {
  const report = makeReport([{ title: 'Address', severity: 'high', resolved: false }]);
  assert.equal(report.residualRisks.length, 1);
});
```

- [ ] **Step 2: Run the failing test**

Run: `node --test test/report.test.js`

Expected: FAIL because `makeReport` does not exist.

- [ ] **Step 3: Implement the responsive workflow UI**

```js
const input = document.querySelector('#file-input');
input.addEventListener('change', async () => {
  // render scan, review, sanitize, verify, and report states from scanner output
});
```

- [ ] **Step 4: Run all unit tests**

Run: `node --test`

Expected: PASS.

### Task 5: Add installation, wrapper, and project guidance

**Files:**
- Create: `manifest.webmanifest`
- Create: `service-worker.js`
- Create: `capacitor.config.json`
- Create: `tauri.conf.json`
- Create: `config.example.js`
- Create: `README.md`

- [ ] **Step 1: Configure installable app metadata and static asset cache**

```js
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open('renitizer-v1').then((cache) => cache.addAll(['/', '/index.html', '/styles.css'])));
});
```

- [ ] **Step 2: Document safe cloud endpoint setup and wrapper commands**

```markdown
Cloud credentials belong in the worker secret store; never add them to `config.js` or the static site.
```

### Task 6: Verify and publish

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Run validation**

Run: `node --test`

Expected: every test passes.

- [ ] **Step 2: Check static entry point and repository state**

Run: `git status --short && git diff --check`

Expected: no whitespace errors; only intended files.

- [ ] **Step 3: Initialize, commit, and publish**

Run: `git init && git add . && git commit -m "feat: build Renitizer privacy lab" && gh repo create galee-labs/renitizer --public --source=. --remote=origin --push`

Expected: GitHub returns the public repository URL.
