import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('the file chooser lists every Office and RTF format the private processor accepts', async () => {
  const page = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const accept = page.match(/<input id="file-input"[^>]*accept="([^"]+)"/i)?.[1] || '';

  for (const extension of ['docm', 'dot', 'dotx', 'dotm', 'xlsm', 'xlt', 'xltx', 'xltm', 'pptm', 'pot', 'potx', 'potm', 'pps', 'ppsx', 'ppsm', 'rtf']) {
    assert.match(accept, new RegExp(`\\.${extension}(?:,|$)`));
  }
});
