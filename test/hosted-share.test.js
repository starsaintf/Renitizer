import assert from 'node:assert/strict';
import test from 'node:test';
import { File } from 'node:buffer';
import { createHostedShare, downloadHostedShare, revokeHostedShare } from '../src/share/hosted.js';
import * as hostedShare from '../src/share/hosted.js';

const session = { endpoint: 'https://renitizer.example', capability: 'opaque-capability_123456' };
const envelope = { format: 'renitizer-encrypted-package-v1', algorithm: 'AES-GCM', iv: 'iv', ciphertext: 'ciphertext' };
const testNow = () => Date.parse('2026-08-01T12:00:00.000Z');

test('uploads only an opaque encrypted package with the Renvoy capability', async () => {
  let request;
  const result = await createHostedShare({
    session,
    envelope,
    recipientAccountId: 'acct_renvoy_bob',
    expiresAt: '2026-08-09T12:00:00.000Z',
    now: testNow,
    FileCtor: File,
    fetcher: async (url, options) => {
      request = { url, options };
      return Response.json({ share: { id: 'share_12345678', recipientAccountId: 'acct_renvoy_bob', expiresAt: '2026-08-09T12:00:00.000Z' } }, { status: 201 });
    },
  });

  assert.equal(result.share.id, 'share_12345678');
  assert.equal(request.url, 'https://renitizer.example/api/shares');
  assert.equal(request.options.headers.Authorization, 'Renvoy opaque-capability_123456');
  assert.equal(request.options.body.get('recipientAccountId'), 'acct_renvoy_bob');
  assert.equal(request.options.body.get('expiresAt'), '2026-08-09T12:00:00.000Z');
  assert.equal(request.options.body.has('recoveryKey'), false);
  assert.deepEqual(JSON.parse(await request.options.body.get('package').text()), envelope);
});

test('rejects an invalid recipient or recovery secret before uploading', async () => {
  await assert.rejects(() => createHostedShare({ session, envelope, recipientAccountId: 'not-an-account', expiresAt: '2026-08-09T12:00:00.000Z', now: testNow, FileCtor: File }), /recipient/i);
  await assert.rejects(() => createHostedShare({ session, envelope: { ...envelope, recoveryKey: 'secret' }, recipientAccountId: 'acct_renvoy_bob', expiresAt: '2026-08-09T12:00:00.000Z', now: testNow, FileCtor: File }), /recovery key/i);
});

test('validates hosted-share expiry against an injected current time', async () => {
  const result = await createHostedShare({
    session,
    envelope,
    recipientAccountId: 'acct_renvoy_bob',
    expiresAt: '2026-08-01T12:00:00.000Z',
    now: () => Date.parse('2026-07-31T12:00:00.000Z'),
    FileCtor: File,
    fetcher: async () => Response.json({ share: { id: 'share_12345678' } }, { status: 201 }),
  });

  assert.equal(result.share.id, 'share_12345678');
});

test('downloads and revokes a hosted package only through a valid share id', async () => {
  const downloaded = await downloadHostedShare({
    session, shareId: 'share_12345678',
    fetcher: async (url, options) => { assert.equal(url, 'https://renitizer.example/api/shares/share_12345678'); assert.equal(options.headers.Authorization, 'Renvoy opaque-capability_123456'); return new Response('encrypted'); },
  });
  assert.equal(await downloaded.text(), 'encrypted');

  await revokeHostedShare({
    session, shareId: 'share_12345678',
    fetcher: async (url, options) => { assert.equal(url, 'https://renitizer.example/api/shares/share_12345678'); assert.equal(options.method, 'DELETE'); return new Response(null, { status: 204 }); },
  });
});

test('creates a recipient link that contains only the opaque share id', () => {
  assert.equal(typeof hostedShare.createHostedShareLink, 'function');
  const link = hostedShare.createHostedShareLink({
    currentUrl: 'https://starsaintf.github.io/Renitizer/?endpoint=https%3A%2F%2Fprivacy.example%2Fcheck#app',
    shareId: 'share_12345678',
  });

  assert.equal(link, 'https://starsaintf.github.io/Renitizer/?share=share_12345678#decrypt');
  assert.equal(link.includes('recovery'), false);
  assert.throws(() => hostedShare.createHostedShareLink({ currentUrl: 'https://starsaintf.github.io/Renitizer/', shareId: 'not-a-share' }), /share id/i);
});
