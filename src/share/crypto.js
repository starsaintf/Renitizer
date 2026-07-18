const PACKAGE_FORMAT = 'renitizer-encrypted-package-v1';

export async function encryptCleanCopy(cleanCopy, { expiresAt, report = null, cryptoImpl = globalThis.crypto } = {}) {
  if (!cleanCopy || typeof cleanCopy.arrayBuffer !== 'function') throw new Error('A clean copy is required to create an encrypted package.');
  const crypto = requireWebCrypto(cryptoImpl);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const plaintext = await cleanCopy.arrayBuffer();
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  const rawKey = await crypto.subtle.exportKey('raw', key);

  return {
    key,
    recoveryKey: bytesToBase64(new Uint8Array(rawKey)),
    envelope: {
      format: PACKAGE_FORMAT,
      algorithm: 'AES-GCM',
      createdAt: new Date().toISOString(),
      expiresAt: expiresAt || null,
      mimeType: cleanCopy.type || 'application/octet-stream',
      iv: bytesToBase64(iv),
      ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
      report,
    },
  };
}

export async function decryptCleanCopy(envelope, key, cryptoImpl = globalThis.crypto) {
  const crypto = requireWebCrypto(cryptoImpl);
  if (!envelope || envelope.format !== PACKAGE_FORMAT || envelope.algorithm !== 'AES-GCM') throw new Error('This is not a supported encrypted package.');
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(envelope.iv) }, key, base64ToBytes(envelope.ciphertext));
}

function requireWebCrypto(cryptoImpl) {
  if (!cryptoImpl?.subtle || typeof cryptoImpl.getRandomValues !== 'function') throw new Error('Web Crypto is not available in this browser.');
  return cryptoImpl;
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  return btoa(binary);
}

function base64ToBytes(value) {
  if (typeof value !== 'string') throw new Error('Encrypted package data is malformed.');
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
