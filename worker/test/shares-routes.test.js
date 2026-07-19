import assert from 'node:assert/strict';
import test from 'node:test';
import { createWorker } from '../src/index.js';
import { ownerManifestKey, packageObjectKey, recipientIndexKey } from '../src/shares.js';

const identityEnv = { RENVOY_IDENTITY_VERIFICATION_URL: 'https://renvoy.example/v1/identity/renitizer/verify' };

function workerFor(accountId) {
  return createWorker({
    identityFetcher: async () => Response.json({ principal: { accountId, deviceId: 'device_test', scopes: ['renitizer:use'] } }),
  });
}

function memoryBucket() {
  const values = new Map();
  return {
    values,
    async put(key, body, options = {}) { values.set(key, { body, options }); },
    async get(key) {
      const value = values.get(key);
      if (!value) return null;
      return {
        body: typeof value.body === 'string' ? new Blob([value.body]).stream() : value.body.stream(),
        httpMetadata: value.options.httpMetadata,
        json: async () => JSON.parse(typeof value.body === 'string' ? value.body : await value.body.text()),
      };
    },
    async delete(key) { values.delete(key); },
  };
}

function requestHeaders() { return { Authorization: 'Renvoy opaque-capability' }; }

test('only the named Renvoy recipient can download an opaque encrypted package', async () => {
  const bucket = memoryBucket();
  const form = new FormData();
  form.set('recipientAccountId', 'acct_renvoy_bob');
  form.set('expiresAt', new Date(Date.now() + 60 * 60 * 1000).toISOString());
  form.set('package', new File(['encrypted bytes'], 'package.renitizer', { type: 'application/octet-stream' }));
  const created = await workerFor('acct_renvoy_alice').fetch(new Request('https://worker.example/api/shares', {
    method: 'POST', headers: requestHeaders(), body: form,
  }), { ...identityEnv, MEDIA_BUCKET: bucket });

  assert.equal(created.status, 201);
  const { share } = await created.json();
  assert.equal('packageKey' in share, false);
  const recipient = await workerFor('acct_renvoy_bob').fetch(new Request(`https://worker.example/api/shares/${share.id}`, { headers: requestHeaders() }), { ...identityEnv, MEDIA_BUCKET: bucket });
  assert.equal(recipient.status, 200);
  assert.equal(await recipient.text(), 'encrypted bytes');

  const unrelated = await workerFor('acct_renvoy_charlie').fetch(new Request(`https://worker.example/api/shares/${share.id}`, { headers: requestHeaders() }), { ...identityEnv, MEDIA_BUCKET: bucket });
  assert.equal(unrelated.status, 404);
});

test('only the owner can revoke a share and revocation removes its package and indexes', async () => {
  const bucket = memoryBucket();
  const share = {
    id: 'share_12345678', ownerAccountId: 'acct_renvoy_alice', recipientAccountId: 'acct_renvoy_bob',
    createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    packageKey: packageObjectKey({ ownerAccountId: 'acct_renvoy_alice', shareId: 'share_12345678' }),
  };
  await bucket.put(share.packageKey, new File(['encrypted'], 'package.renitizer'));
  await bucket.put(ownerManifestKey({ ownerAccountId: share.ownerAccountId, shareId: share.id }), JSON.stringify(share));
  await bucket.put(recipientIndexKey({ recipientAccountId: share.recipientAccountId, shareId: share.id }), JSON.stringify({ ownerAccountId: share.ownerAccountId, expiresAt: share.expiresAt }));

  const recipient = await workerFor('acct_renvoy_bob').fetch(new Request(`https://worker.example/api/shares/${share.id}`, { method: 'DELETE', headers: requestHeaders() }), { ...identityEnv, MEDIA_BUCKET: bucket });
  assert.equal(recipient.status, 404);
  const owner = await workerFor('acct_renvoy_alice').fetch(new Request(`https://worker.example/api/shares/${share.id}`, { method: 'DELETE', headers: requestHeaders() }), { ...identityEnv, MEDIA_BUCKET: bucket });
  assert.equal(owner.status, 204);
  assert.equal(bucket.values.size, 0);
});

test('an expired share is deleted before it can be downloaded', async () => {
  const bucket = memoryBucket();
  const share = {
    id: 'share_12345678', ownerAccountId: 'acct_renvoy_alice', recipientAccountId: 'acct_renvoy_bob',
    createdAt: '2026-01-01T00:00:00.000Z', expiresAt: '2026-01-02T00:00:00.000Z',
    packageKey: packageObjectKey({ ownerAccountId: 'acct_renvoy_alice', shareId: 'share_12345678' }),
  };
  await bucket.put(share.packageKey, new File(['encrypted'], 'package.renitizer'));
  await bucket.put(ownerManifestKey({ ownerAccountId: share.ownerAccountId, shareId: share.id }), JSON.stringify(share));
  await bucket.put(recipientIndexKey({ recipientAccountId: share.recipientAccountId, shareId: share.id }), JSON.stringify({ ownerAccountId: share.ownerAccountId, expiresAt: share.expiresAt }));

  const response = await workerFor('acct_renvoy_bob').fetch(new Request(`https://worker.example/api/shares/${share.id}`, { headers: requestHeaders() }), { ...identityEnv, MEDIA_BUCKET: bucket });
  assert.equal(response.status, 410);
  assert.equal((await response.json()).error.code, 'share-expired');
  assert.equal(bucket.values.size, 0);
});
