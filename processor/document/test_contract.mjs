import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
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

test('bundles LibreOffice alongside QPDF for legacy Office conversion', async () => {
  const dockerfile = await readFile(new URL('./Dockerfile', import.meta.url), 'utf8');
  assert.match(dockerfile, /libreoffice-writer/);
  assert.match(dockerfile, /libreoffice-calc/);
  assert.match(dockerfile, /libreoffice-impress/);
  assert.match(dockerfile, /qpdf/);
});

test('production verification runs a real LibreOffice document-container smoke check', async () => {
  const workflow = await readFile(new URL('../../.github/workflows/galee-production.yml', import.meta.url), 'utf8');
  assert.match(workflow, /renitizer-document-smoke/);
  assert.match(workflow, /RENITIZER_LIBREOFFICE_SMOKE=1/);
  assert.match(workflow, /test\/libreoffice-smoke\.mjs/);
});
