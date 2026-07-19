import assert from 'node:assert/strict';
import test from 'node:test';
import { runDocumentSanitizer } from './runner.mjs';

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
