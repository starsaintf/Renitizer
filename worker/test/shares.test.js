import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createShare,
  ownerManifestKey,
  parseShareRequest,
  publicShare,
  recipientIndexKey,
} from '../src/shares.js';

const now = () => '2026-07-19T12:00:00.000Z';

test('creates an expiring opaque share with account-scoped private keys', () => {
  const result = createShare({
    ownerAccountId: 'acct_renvoy_alice',
    recipientAccountId: 'acct_renvoy_bob',
    expiresAt: '2026-07-20T12:00:00.000Z',
    packageSize: 42,
  }, { createId: () => 'share_12345678', now });

  assert.equal(result.valid, true);
  assert.equal(result.value.packageKey, 'shares/acct_renvoy_alice/share_12345678/package.renitizer');
  assert.equal(ownerManifestKey({ ownerAccountId: 'acct_renvoy_alice', shareId: 'share_12345678' }), 'shares/acct_renvoy_alice/share_12345678/manifest.json');
  assert.equal(recipientIndexKey({ recipientAccountId: 'acct_renvoy_bob', shareId: 'share_12345678' }), 'share-recipients/acct_renvoy_bob/share_12345678.json');
  assert.deepEqual(publicShare(result.value), {
    id: 'share_12345678',
    recipientAccountId: 'acct_renvoy_bob',
    createdAt: '2026-07-19T12:00:00.000Z',
    expiresAt: '2026-07-20T12:00:00.000Z',
  });
  assert.equal(JSON.stringify(result.value).includes('recoveryKey'), false);
});

test('rejects an expired, excessively long, or unsafe hosted-share request', () => {
  const expired = createShare({
    ownerAccountId: 'acct_renvoy_alice', recipientAccountId: 'acct_renvoy_bob',
    expiresAt: '2026-07-19T11:59:59.000Z', packageSize: 42,
  }, { now });
  assert.equal(expired.valid, false);
  assert.match(expired.error, /future/i);

  const tooLong = createShare({
    ownerAccountId: 'acct_renvoy_alice', recipientAccountId: 'acct_renvoy_bob',
    expiresAt: '2026-08-20T12:00:00.000Z', packageSize: 42,
  }, { now });
  assert.equal(tooLong.valid, false);
  assert.match(tooLong.error, /30 days/i);

  const unsafe = createShare({
    ownerAccountId: 'acct_renvoy_alice', recipientAccountId: '../acct_bob',
    expiresAt: '2026-07-20T12:00:00.000Z', packageSize: 42,
  }, { now });
  assert.equal(unsafe.valid, false);
  assert.match(unsafe.error, /recipient/i);
});

test('parses only an opaque encrypted package and never a recovery key', () => {
  const form = new FormData();
  form.set('recipientAccountId', 'acct_renvoy_bob');
  form.set('expiresAt', '2026-07-20T12:00:00.000Z');
  form.set('package', new File(['encrypted'], 'anything.renitizer', { type: 'application/octet-stream' }));
  form.set('recoveryKey', 'this must never be uploaded');

  const result = parseShareRequest(form, 'acct_renvoy_alice', { now, createId: () => 'share_12345678' });
  assert.equal(result.valid, false);
  assert.match(result.error, /recovery key/i);
});
