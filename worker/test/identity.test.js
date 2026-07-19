import test from 'node:test';
import assert from 'node:assert/strict';
import { introspectRenvoyIdentity, parseRenvoyAuthorization } from '../src/identity.js';

test('parses only a single Renvoy authorization credential', () => {
  assert.equal(parseRenvoyAuthorization('Renvoy opaque-token_123'), 'opaque-token_123');
  assert.equal(parseRenvoyAuthorization('Bearer opaque-token_123'), null);
  assert.equal(parseRenvoyAuthorization('Renvoy '), null);
  assert.equal(parseRenvoyAuthorization('Renvoy one two'), null);
});

test('reports an explicit unconfigured state without trying to validate a token', async () => {
  let requested = false;
  const result = await introspectRenvoyIdentity(new Headers({ Authorization: 'Renvoy opaque-token_123' }), {}, async () => {
    requested = true;
    throw new Error('must not fetch');
  });

  assert.deepEqual(result, { state: 'unconfigured' });
  assert.equal(requested, false);
});

test('rejects a request with no valid Renvoy authorization header', async () => {
  const result = await introspectRenvoyIdentity(new Headers(), {
    RENVOY_IDENTITY_VERIFICATION_URL: 'https://identity.renvoy.example/v1/identity/renitizer/verify',
  }, async () => {
    throw new Error('must not fetch');
  });

  assert.deepEqual(result, { state: 'unauthorized' });
});

test('derives account identity only from Renvoy’s scoped verification response', async () => {
  let request;
  const result = await introspectRenvoyIdentity(new Headers({ Authorization: 'Renvoy opaque-token_123' }), {
    RENVOY_IDENTITY_VERIFICATION_URL: 'https://identity.renvoy.example/v1/identity/renitizer/verify',
  }, async (url, options) => {
    request = { url, options };
    return Response.json({ principal: { accountId: 'acct_renvoy_alice', deviceId: 'dev_phone', scopes: ['renitizer:use'] } });
  });

  assert.deepEqual(result, {
    state: 'authenticated',
    principal: { accountId: 'acct_renvoy_alice', deviceId: 'dev_phone', scopes: ['renitizer:use'] },
  });
  assert.equal(request.url, 'https://identity.renvoy.example/v1/identity/renitizer/verify');
  assert.deepEqual(request.options, {
    method: 'POST',
    headers: {
      Authorization: 'Renvoy opaque-token_123',
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
});

test('does not accept token claims or malformed Renvoy verification responses', async () => {
  const result = await introspectRenvoyIdentity(new Headers({ Authorization: 'Renvoy acct_eve.jobs:read' }), {
    RENVOY_IDENTITY_VERIFICATION_URL: 'https://identity.renvoy.example/v1/identity/renitizer/verify',
  }, async () => Response.json({ principal: { accountId: '', scopes: 'renitizer:use' } }));

  assert.deepEqual(result, { state: 'unauthorized' });
});

test('fails closed when Renvoy is unavailable or does not grant Renitizer use', async () => {
  const headers = new Headers({ Authorization: 'Renvoy opaque-token_123' });
  const env = { RENVOY_IDENTITY_VERIFICATION_URL: 'https://identity.renvoy.example/v1/identity/renitizer/verify' };

  const unavailable = await introspectRenvoyIdentity(headers, env, async () => { throw new Error('network unavailable'); });
  assert.deepEqual(unavailable, { state: 'unavailable' });

  const noScopes = await introspectRenvoyIdentity(headers, env, async () => Response.json({
    principal: { accountId: 'acct_renvoy_alice', deviceId: 'dev_phone', scopes: [] },
  }));
  assert.deepEqual(noScopes, { state: 'unauthorized' });
});
