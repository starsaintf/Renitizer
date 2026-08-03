import assert from 'node:assert/strict';
import test from 'node:test';
import { documentSanitizationPlan, runDocumentSanitizer } from './runner.mjs';

test('runs PDF cleaning with the fixed QPDF command', async () => {
  const calls = [];
  await runDocumentSanitizer({
    documentType: 'pdf', inputPath: '/tmp/input', outputPath: '/tmp/output',
    execute: async (command, args) => { calls.push({ command, args }); },
  });
  assert.deepEqual(calls, [{ command: 'qpdf', args: [
    '--remove-info', '--remove-metadata', '--remove-page-labels', '--remove-structure',
    '--flatten-annotations=all', '--remove-acroform', '/tmp/input', '/tmp/output',
  ] }]);
});

test('runs Office cleaning with the packaged sanitizer script', async () => {
  const calls = [];
  await runDocumentSanitizer({
    documentType: 'office', inputPath: '/tmp/input', outputPath: '/tmp/output', officeScriptPath: '/app/office.py',
    execute: async (command, args) => { calls.push({ command, args }); },
  });
  assert.deepEqual(calls, [{ command: 'python3', args: ['/app/office.py', '/tmp/input', '/tmp/output'] }]);
});

test('plans a LibreOffice PDF fallback for legacy and OpenDocument files', () => {
  assert.deepEqual(documentSanitizationPlan({ documentType: 'office', sourceExtension: 'doc' }), {
    strategy: 'libreoffice-pdf', outputDocumentType: 'pdf', outputExtension: 'pdf',
  });
  assert.deepEqual(documentSanitizationPlan({ documentType: 'office', sourceExtension: 'ods' }), {
    strategy: 'libreoffice-pdf', outputDocumentType: 'pdf', outputExtension: 'pdf',
  });
});

test('keeps macro-enabled Open XML documents in the package cleaner so embedded macros are removed', () => {
  assert.deepEqual(documentSanitizationPlan({ documentType: 'office', sourceExtension: 'xlsm' }), {
    strategy: 'office-package', outputDocumentType: 'office', outputExtension: 'xlsm',
  });
});

test('converts a legacy Office file to PDF and sanitizes that PDF before returning it', async () => {
  const calls = [];
  const result = await runDocumentSanitizer({
    documentType: 'office', sourceExtension: 'doc', inputPath: '/tmp/input.doc', outputPath: '/tmp/output.pdf',
    execute: async (command, args) => { calls.push({ command, args }); },
  });

  assert.deepEqual(result, { strategy: 'libreoffice-pdf', outputDocumentType: 'pdf', outputExtension: 'pdf' });
  assert.deepEqual(calls, [
    { command: 'libreoffice', args: ['--headless', '--nologo', '--nodefault', '--nolockcheck', '--norestore', '--convert-to', 'pdf', '--outdir', '/tmp', '/tmp/input.doc'] },
    { command: 'qpdf', args: ['--remove-info', '--remove-metadata', '--remove-page-labels', '--remove-structure', '--flatten-annotations=all', '--remove-acroform', '/tmp/input.pdf', '/tmp/output.pdf'] },
  ]);
});
