import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('the workspace preserves sampled-video timing when requesting cloud analysis', async () => {
  const [app, page] = await Promise.all([
    fs.readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
    fs.readFile(new URL('../index.html', import.meta.url), 'utf8'),
  ]);

  assert.match(app, /frameContext: frameSamples\?\.map/);
  assert.match(app, /return frames;/);
  assert.match(app, /time, duration/);
  assert.match(page, /id="video-advanced"/);
  assert.match(page, /id="video-track-list"/);
  assert.match(app, /function cleanVideo\(/);
  assert.match(app, /state\.remoteVideo\?\.ready/);
  assert.match(app, /function render\(\) \{[\s\S]*const isImage = state\.file\?\.type\.startsWith\('image\/'\);/);
  assert.match(app, /if \(isImage && finding\.boundingBox\) \{/);
  assert.match(app, /const localScanners = isImage \? \[scanFileFacts, scanMetadata, scanBarcodes, scanFaces\] : \[scanFileFacts, scanMetadata\];/);
  assert.match(app, /state\.availableChecks = new Set\(isImage \? \['metadata', 'barcodes', 'faces'\] : \['metadata'\]\);/);
  assert.match(app, /if \(state\.previewUrl\) URL\.revokeObjectURL\(state\.previewUrl\);\r?\n\s*state\.previewUrl = null;/);
  assert.match(app, /state\.audio = \{ duration: null, manualRanges: \[\], processing: null \};\r?\n\s*state\.video = \{ duration: null, width: null, height: null \};/);
});
