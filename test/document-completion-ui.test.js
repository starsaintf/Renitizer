import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('a completed private document job updates the receipt from processor-confirmed removals', async () => {
  const app = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');

  assert.match(app, /removedCategories: status\.job\?\.output\?\.removedCategories/);
  assert.match(app, /state\.receiptReady = true;\s*updateReport\(\);/);
});
