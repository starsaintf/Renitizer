import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSafeShareReport,
  getShareState,
  validateShareExpiry,
} from '../src/share/policy.js';

const now = new Date('2026-07-19T12:00:00.000Z');

test('validateShareExpiry accepts a future supported expiry and rejects elapsed or unsupported choices', () => {
  assert.deepEqual(validateShareExpiry('7-days', now), {
    valid: true,
    value: { option: '7-days', expiresAt: '2026-07-26T12:00:00.000Z' },
  });
  assert.deepEqual(validateShareExpiry('forever', now), { valid: false, error: 'Choose a supported expiry period.' });
  assert.deepEqual(validateShareExpiry('1-day', new Date('invalid')), { valid: false, error: 'A valid current time is required.' });
});

test('getShareState offers only a local encrypted package when a clean copy exists without a share backend', () => {
  assert.deepEqual(getShareState({ hasCleanCopy: false, expiry: '7-days', now }), {
    state: 'not-ready',
    available: false,
    delivery: 'unconfigured',
    message: 'Make a clean copy before preparing an encrypted package.',
  });
  assert.deepEqual(getShareState({ hasCleanCopy: true, expiry: '7-days', now }), {
    state: 'ready',
    available: true,
    delivery: 'unconfigured',
    message: 'Encrypted package download only. No public link or server storage is configured.',
    expiresAt: '2026-07-26T12:00:00.000Z',
  });
});

test('createSafeShareReport excludes source name and raw findings unless detailed findings are explicitly included', () => {
  const input = {
    originalFileName: 'passport-and-address.jpg',
    report: { safetyScore: 86, counts: { total: 2, unresolved: 0, resolved: 2 }, signals: { metadata: 1 } },
    verification: { readiness: { state: 'ready', label: 'Ready to save' } },
    findings: [{ id: 'ocr-email', detail: 'visible@example.test' }],
    expiresAt: '2026-07-26T12:00:00.000Z',
  };

  const safe = createSafeShareReport(input);
  assert.equal('originalFileName' in safe, false);
  assert.equal('findings' in safe, false);
  assert.equal(safe.expiresAt, input.expiresAt);
  assert.deepEqual(createSafeShareReport({ ...input, includeDetailedFindings: true }).findings, input.findings);
});
