import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';

test('the workspace lets a completed private output enter local encrypted sharing', async () => {
  const [app, page] = await Promise.all([
    fs.readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
    fs.readFile(new URL('../index.html', import.meta.url), 'utf8'),
  ]);

  assert.match(app, /import \{ createGenericOriginalArchiveFile, createGenericPackageFile, getShareableCleanOutput, resolveShareableCleanOutput \} from '\.\/share\/remote-output\.js';/);
  assert.match(app, /getShareableCleanOutput\(\{ cleanFile: state\.cleanFile, remoteVideo: state\.remoteVideo, remoteDocument: state\.remoteDocument \}\)/);
  assert.match(app, /resolveShareableCleanOutput\(\{ cleanFile: state\.cleanFile, remoteVideo: state\.remoteVideo, remoteDocument: state\.remoteDocument, downloadRemoteJob \}\)/);
  assert.match(app, /encryptCleanCopy\(createGenericPackageFile\(cleanOutput\),/);
  assert.match(page, /id="archive-original-button"/);
  assert.match(page, /id="archive-original-key-button"/);
  assert.match(app, /ui\['archive-original-button'\]\.addEventListener\('click', archiveOriginalFile\);/);
  assert.match(app, /encryptCleanCopy\(createGenericOriginalArchiveFile\(state\.file\)/);
  assert.match(app, /renitizer-encrypted-original\.json/);
  assert.match(app, /function downloadOriginalArchiveKey\(\)/);
});
