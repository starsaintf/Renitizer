import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('the workspace reserves a focused review card for document-cleaning choices', async () => {
  const page = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const app = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');

  assert.match(page, /id="document-plan"/);
  assert.match(page, /Your document clean/);
  assert.match(app, /function renderDocumentPlan\(\)/);
  assert.match(app, /setDocumentPlanAction/);
});
