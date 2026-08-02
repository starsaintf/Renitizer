import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';

test('the workspace lets a completed private output enter local encrypted sharing', async () => {
  const app = await fs.readFile(new URL('../src/main.js', import.meta.url), 'utf8');

  assert.match(app, /import \{ createGenericPackageFile, getShareableCleanOutput, resolveShareableCleanOutput \} from '\.\/share\/remote-output\.js';/);
  assert.match(app, /getShareableCleanOutput\(\{ cleanFile: state\.cleanFile, remoteVideo: state\.remoteVideo, remoteDocument: state\.remoteDocument \}\)/);
  assert.match(app, /resolveShareableCleanOutput\(\{ cleanFile: state\.cleanFile, remoteVideo: state\.remoteVideo, remoteDocument: state\.remoteDocument, downloadRemoteJob \}\)/);
  assert.match(app, /encryptCleanCopy\(createGenericPackageFile\(cleanOutput\),/);
});
