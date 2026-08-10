import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';

test('the workspace offers a recovery-key-first Renvoy encrypted-share flow', async () => {
  const [app, page] = await Promise.all([
    fs.readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
    fs.readFile(new URL('../index.html', import.meta.url), 'utf8'),
  ]);

  assert.match(page, /id="share-hosted-details"/);
  assert.match(page, /id="share-recipient-account"/);
  assert.match(page, /id="share-hosted-button"/);
  assert.match(page, /id="share-revoke-button"/);
  assert.match(page, /id="share-link-button"/);
  assert.match(app, /import \{ createHostedShare, createHostedShareLink, downloadHostedShare, isHostedShareId, revokeHostedShare \} from '\.\/share\/hosted\.js';/);
  assert.match(app, /ui\['share-hosted-button'\]\.addEventListener\('click', createHostedEncryptedShare\);/);
  assert.match(app, /ui\['share-link-button'\]\.addEventListener\('click', copyCurrentShareLink\);/);
  assert.match(app, /if \(!state\.recoveryKeySaved\) \{ ui\['share-hosted-status'\]\.textContent = 'Save your recovery key before sending this package\.'; return; \}/);
  assert.match(app, /await createHostedShare\(\{ session, envelope: state\.share\.envelope,/);
  assert.match(app, /createHostedShareLink\(\{ currentUrl: location\.href, shareId: result\.share\.id \}\)/);
});

test('the decrypt screen can fetch a recipient-authorized encrypted package from Renvoy', async () => {
  const [app, page] = await Promise.all([
    fs.readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
    fs.readFile(new URL('../index.html', import.meta.url), 'utf8'),
  ]);

  assert.match(page, /id="receive-hosted-details"/);
  assert.match(page, /id="receive-share-id"/);
  assert.match(page, /id="receive-hosted-button"/);
  assert.match(app, /const shareFromQuery = new URLSearchParams\(location\.search\)\.get\('share'\);/);
  assert.match(app, /if \(isHostedShareId\(shareFromQuery\)\) ui\['receive-share-id'\]\.value = shareFromQuery;/);
  assert.match(app, /import \{ createHostedShare, createHostedShareLink, downloadHostedShare, isHostedShareId, revokeHostedShare \} from '\.\/share\/hosted\.js';/);
  assert.match(app, /ui\['receive-hosted-button'\]\.addEventListener\('click', downloadIncomingHostedShare\);/);
  assert.match(app, /ui\['encrypted-package-input'\]\.addEventListener\('change', \(\) => \{ state\.receivedHostedPackage = null; \}\);/);
  assert.match(app, /const packageFile = state\.receivedHostedPackage \|\| ui\['encrypted-package-input'\]\.files\[0\];/);
  assert.match(app, /await downloadHostedShare\(\{ session, shareId \}\)/);
});
