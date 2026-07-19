import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPdfSanitizeCommand, normalizeDocumentType } from './contract.mjs';

test('builds a fixed PDF sanitization command without accepting caller-supplied options', () => {
  assert.deepEqual(buildPdfSanitizeCommand('/work/input.pdf', '/work/output.pdf'), [
    '--remove-info', '--remove-metadata', '--remove-page-labels', '--remove-structure',
    '--flatten-annotations=all', '--remove-acroform', '/work/input.pdf', '/work/output.pdf',
  ]);
});

test('accepts only PDF and Office document processor types', () => {
  assert.equal(normalizeDocumentType('pdf'), 'pdf');
  assert.equal(normalizeDocumentType('office'), 'office');
  assert.throws(() => normalizeDocumentType('video'), /Unsupported document type/);
});
