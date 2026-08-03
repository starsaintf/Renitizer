import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runDocumentSanitizer } from '../runner.mjs';

test('LibreOffice renders a legacy document to a sanitized PDF', {
  skip: process.env.RENITIZER_LIBREOFFICE_SMOKE === '1' ? false : 'Requires the LibreOffice-enabled document processor container.',
}, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'renitizer-document-smoke-'));
  const input = join(directory, 'letter.rtf');
  const output = join(directory, 'clean.pdf');

  try {
    await writeFile(input, '{\\rtf1\\ansi Private address: 42 Example Road\\par}', 'utf8');
    const result = await runDocumentSanitizer({
      documentType: 'office', sourceExtension: 'rtf', inputPath: input, outputPath: output,
    });
    const cleanPdf = await readFile(output);

    assert.deepEqual(result, {
      strategy: 'libreoffice-pdf', outputDocumentType: 'pdf', outputExtension: 'pdf',
    });
    assert.equal(cleanPdf.subarray(0, 5).toString('ascii'), '%PDF-');
    assert.ok(cleanPdf.length > 100, 'Expected LibreOffice and QPDF to create a non-empty clean PDF.');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
