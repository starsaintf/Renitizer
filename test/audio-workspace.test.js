import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('the workspace includes controls to review detected audio ranges', async () => {
  const [app, page] = await Promise.all([
    fs.readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
    fs.readFile(new URL('../index.html', import.meta.url), 'utf8'),
  ]);

  assert.match(page, /id="audio-advanced"/);
  assert.match(page, /id="audio-range-list"/);
  assert.match(app, /function renderAudioAdvanced\(/);
  assert.match(app, /\['mute', 'bleep', 'keep'\]/);
});
