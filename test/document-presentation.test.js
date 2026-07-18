import test from 'node:test';
import assert from 'node:assert/strict';
import { documentUiCopy } from '../src/documents/presentation.js';

test('uses plain language for a PDF cleaning request without promising a clean file', () => {
  assert.deepEqual(documentUiCopy('pdf'), {
    fileLabel: 'PDF document',
    saveCopy: 'We can prepare a request to remove private document details. A clean PDF is only available after a document-cleaning processor returns it.',
    actionLabel: 'Prepare cleaning request',
  });
});

test('uses plain language for Office files without calling a request a clean copy', () => {
  const copy = documentUiCopy('office');

  assert.equal(copy.fileLabel, 'Office document');
  assert.match(copy.saveCopy, /processor returns it/i);
  assert.equal(copy.actionLabel, 'Prepare cleaning request');
  assert.equal(`${copy.saveCopy} ${copy.actionLabel}`.includes('clean copy'), false);
});
