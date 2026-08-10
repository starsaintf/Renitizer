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

test('uses a plain-language name when a face re-check is unavailable', () => {
  const receipt = createReceipt({
    findings: [],
    report: { counts: { total: 0, resolved: 0, unresolved: 0 } },
    verification: { checks: { faces: { status: 'not-assessed', reason: 'Faces could not be checked again on the clean copy.' } } },
  });

  assert.deepEqual(receipt.notChecked, ['Faces: Faces could not be checked again on the clean copy.']);
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

test('records a completed document clean from processor-confirmed categories only', () => {
  const receipt = createReceipt({
    findings: [],
    report: { counts: { total: 0, resolved: 0, unresolved: 0 } },
    documentCleaning: {
      state: 'complete',
      cleanDocumentProduced: true,
      removedCategories: ['comment', 'signature'],
      actions: [{ category: 'font', action: 'keep', state: 'supported' }],
    },
  });

  assert.deepEqual(receipt.changed, ['Created: Private clean document', 'Removed: Comments and notes', 'Removed: Digital signatures']);
  assert.deepEqual(receipt.kept, ['Kept: Embedded fonts']);
  assert.equal(receipt.summary, '3 changes made · 1 item kept');
});
