import test from 'node:test';
import assert from 'node:assert/strict';
import { decryptCleanCopy, encryptCleanCopy, importRecoveryKey } from '../src/share/crypto.js';

test('encryptCleanCopy uses a client-side AES-GCM key and serializes an envelope without it', async () => {
  const cleanCopy = new Blob(['clean pixel bytes'], { type: 'image/png' });
  const { envelope, key, recoveryKey } = await encryptCleanCopy(cleanCopy, {
    expiresAt: '2026-07-26T12:00:00.000Z',
    report: { format: 'renitizer-privacy-report-v1', summary: { safetyScore: 100 } },
  });

  assert.equal(envelope.format, 'renitizer-encrypted-package-v1');
  assert.equal(envelope.algorithm, 'AES-GCM');
  assert.equal(envelope.mimeType, 'image/png');
  assert.equal(envelope.expiresAt, '2026-07-26T12:00:00.000Z');
  assert.equal(typeof recoveryKey, 'string');
  assert.ok(recoveryKey.length > 30);
  assert.equal(JSON.stringify(envelope).includes(recoveryKey), false);
  assert.equal('key' in envelope, false);
  assert.equal('recoveryKey' in envelope, false);

  const decrypted = await decryptCleanCopy(envelope, key);
  assert.equal(new TextDecoder().decode(decrypted), 'clean pixel bytes');
});

test('imports a recovery key file and decrypts its matching package', async () => {
  const cleanCopy = new Blob(['private clean copy'], { type: 'text/plain' });
  const { envelope, recoveryKey } = await encryptCleanCopy(cleanCopy);

  const key = await importRecoveryKey({
    format: 'renitizer-recovery-key-v1',
    algorithm: 'AES-256-GCM',
    recoveryKey,
  });
  const decrypted = await decryptCleanCopy(envelope, key);

  assert.equal(new TextDecoder().decode(decrypted), 'private clean copy');
});

test('rejects a malformed recovery key before attempting decryption', async () => {
  await assert.rejects(
    () => importRecoveryKey({ format: 'renitizer-recovery-key-v1', algorithm: 'AES-256-GCM', recoveryKey: 'not base64!' }),
    /recovery key/i,
  );
});
