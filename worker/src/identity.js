const RENVOY_AUTHORIZATION = /^Renvoy ([A-Za-z0-9._-]{16,8192})$/;
const RENITIZER_SCOPE = 'renitizer:use';

export function parseRenvoyAuthorization(value) {
  const match = RENVOY_AUTHORIZATION.exec(String(value ?? ''));
  return match ? match[1] : null;
}

export async function introspectRenvoyIdentity(headers, env, fetcher = fetch) {
  const endpoint = env?.RENVOY_IDENTITY_VERIFICATION_URL;
  if (typeof endpoint !== 'string' || !endpoint.trim()) return { state: 'unconfigured' };

  const authorization = headers?.get?.('Authorization') ?? headers?.get?.('authorization');
  if (!parseRenvoyAuthorization(authorization)) return { state: 'unauthorized' };

  try {
    const response = await fetcher(endpoint, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: '{}',
    });
    if (!response.ok) return { state: 'unauthorized' };
    const payload = await response.json();
    const principal = normalizePrincipal(payload?.principal);
    return principal ? { state: 'authenticated', principal } : { state: 'unauthorized' };
  } catch {
    return { state: 'unavailable' };
  }
}

function normalizePrincipal(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (!identifier(value.accountId) || !identifier(value.deviceId)) return null;
  if (!Array.isArray(value.scopes) || !value.scopes.includes(RENITIZER_SCOPE)) return null;
  return {
    accountId: value.accountId,
    deviceId: value.deviceId,
    scopes: [RENITIZER_SCOPE],
  };
}

function identifier(value) {
  return typeof value === 'string' && /^[A-Za-z0-9._~:-]{1,512}$/.test(value);
}
