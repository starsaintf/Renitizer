const capabilityPattern = /^[A-Za-z0-9._-]{16,8192}$/;

export async function requestRenvoySession(host = globalThis) {
  const bridge = host?.RenvoyRenitizer;
  if (!bridge || typeof bridge.getSession !== 'function') return { available: false, reason: 'bridge-unavailable' };
  try {
    const session = await bridge.getSession({ scope: 'renitizer:use' });
    const url = new URL(session?.endpoint);
    if (url.protocol !== 'https:' || !capabilityPattern.test(session?.capability ?? '')) return { available: false, reason: 'bridge-invalid' };
    return { available: true, endpoint: url.origin, capability: session.capability };
  } catch {
    return { available: false, reason: 'bridge-unavailable' };
  }
}
