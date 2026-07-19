import test from 'node:test';
import assert from 'node:assert/strict';
import { createReceipt } from '../src/core/receipt.js';

test('creates clear receipt lists from resolved, kept, and unavailable findings', () => {
  const receipt = createReceipt({
    findings: [
      { id: 'gps', title: 'Location details found', resolved: true, redactionAction: 'remove' },
      { id: 'face', title: 'A face was found', resolved: false, redactionAction: 'keep' },
      { id: 'ocr', title: 'Writing may be visible', assessment: 'unavailable', resolved: false },
    ],
    report: { counts: { total: 3, resolved: 1, unresolved: 2 } },
  });

  assert.deepEqual(receipt.found, ['Location details found', 'A face was found']);
  assert.deepEqual(receipt.changed, ['Removed: Location details found']);
  assert.deepEqual(receipt.kept, ['Kept: A face was found']);
  assert.deepEqual(receipt.notChecked, ['Writing may be visible']);
  assert.equal(receipt.summary, '1 change made · 1 item kept · 1 check not available');
});

test('records verification checks and document processor status as not checked', () => {
  const receipt = createReceipt({
    findings: [],
    report: { counts: { total: 0, resolved: 0, unresolved: 0 } },
    verification: { checks: { visibleText: { status: 'not-assessed', reason: 'No writing check was run.' } } },
    documentCleaning: { state: 'processor-unconfigured', message: 'A clean document has not been produced.' },
  });

  assert.deepEqual(receipt.notChecked, ['Visible text: No writing check was run.', 'A clean document has not been produced.']);
  assert.equal(receipt.summary, 'No changes made · 2 checks not available');
});

test('keeps an informational resolved finding out of the kept list', () => {
  const receipt = createReceipt({
    findings: [{ id: 'file-facts', title: 'File inspected', resolved: true }],
    report: { counts: { total: 1, resolved: 1, unresolved: 0 } },
  });

  assert.deepEqual(receipt.found, ['File inspected']);
  assert.deepEqual(receipt.changed, []);
  assert.deepEqual(receipt.kept, []);
});
