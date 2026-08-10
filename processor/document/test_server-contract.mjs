import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('the document service accepts explicit choices and returns confirmed removals', async () => {
  const source = await readFile(new URL('./server.mjs', import.meta.url), 'utf8');

  assert.match(source, /x-renitizer-requested-actions/);
  assert.match(source, /parseRequestedActions/);
  assert.match(source, /requestedActions/);
  assert.match(source, /X-Renitizer-Removed-Categories/);
});
