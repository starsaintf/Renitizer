import assert from 'node:assert/strict';
import test from 'node:test';
import { requestRenvoySession } from '../src/remote/renvoy-bridge.js';

test('accepts an ephemeral Renvoy session supplied by a trusted host bridge', async () => {
  const result = await requestRenvoySession({
    RenvoyRenitizer: { getSession: async () => ({ endpoint: 'https://renitizer.example', capability: 'opaque-capability_123456' }) },
  });
  assert.deepEqual(result, { available: true, endpoint: 'https://renitizer.example', capability: 'opaque-capability_123456' });
});

test('does not accept credentials from an absent or malformed bridge', async () => {
  assert.deepEqual(await requestRenvoySession({}), { available: false, reason: 'bridge-unavailable' });
  assert.deepEqual(await requestRenvoySession({ RenvoyRenitizer: { getSession: async () => ({ endpoint: 'http://not-secure.example', capability: 'short' }) } }), { available: false, reason: 'bridge-invalid' });
});
