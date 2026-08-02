const ACCOUNT_ID = /^acct_[A-Za-z0-9_-]{2,120}$/;
const SHARE_ID = /^share_[A-Za-z0-9_-]{8,128}$/;

export async function createHostedShare({ session, envelope, recipientAccountId, expiresAt, fetcher = fetch, FileCtor = File, now = () => Date.now() } = {}) {
  const endpoint = trustedEndpoint(session);
  if (!ACCOUNT_ID.test(String(recipientAccountId || ''))) throw new Error('Choose a valid recipient Renvoy account.');
  if (!validFutureExpiry(expiresAt, now)) throw new Error('Choose a future share expiry.');
  if (containsRecoverySecret(envelope)) throw new Error('The recovery key must stay with you and cannot be uploaded.');
  if (typeof FileCtor !== 'function') throw new Error('This browser cannot prepare an encrypted package for hosted sharing.');
  let encoded;
  try { encoded = JSON.stringify(envelope); } catch { throw new Error('The encrypted package could not be prepared.'); }
  if (!encoded || encoded === 'null') throw new Error('The encrypted package could not be prepared.');
  const form = new FormData();
  form.set('recipientAccountId', recipientAccountId);
  form.set('expiresAt', expiresAt);
  form.set('package', new FileCtor([encoded], 'renitizer-encrypted-package.renitizer', { type: 'application/octet-stream' }));
  const response = await fetcher(`${endpoint}/api/shares`, { method: 'POST', headers: { Authorization: `Renvoy ${session.capability}` }, body: form });
  if (!response.ok) throw new Error('The encrypted package could not be sent through Renvoy.');
  const payload = await response.json();
  if (!SHARE_ID.test(String(payload?.share?.id || ''))) throw new Error('Renvoy did not confirm the encrypted share.');
  return payload;
}

export async function downloadHostedShare({ session, shareId, fetcher = fetch } = {}) {
  const endpoint = trustedEndpoint(session);
  if (!SHARE_ID.test(String(shareId || ''))) throw new Error('Enter a valid Renvoy share ID.');
  const response = await fetcher(`${endpoint}/api/shares/${shareId}`, { headers: { Authorization: `Renvoy ${session.capability}` } });
  if (!response.ok) throw new Error('This encrypted share is unavailable.');
  return response.blob();
}

export async function revokeHostedShare({ session, shareId, fetcher = fetch } = {}) {
  const endpoint = trustedEndpoint(session);
  if (!SHARE_ID.test(String(shareId || ''))) throw new Error('This Renvoy share is invalid.');
  const response = await fetcher(`${endpoint}/api/shares/${shareId}`, { method: 'DELETE', headers: { Authorization: `Renvoy ${session.capability}` } });
  if (!response.ok) throw new Error('This encrypted share could not be revoked.');
}

function trustedEndpoint(session) {
  const capability = String(session?.capability || '');
  let url;
  try { url = new URL(session?.endpoint); } catch { throw new Error('Renvoy private sharing is unavailable.'); }
  if (url.protocol !== 'https:' || !capability) throw new Error('Renvoy private sharing is unavailable.');
  return url.origin;
}

function validFutureExpiry(value, now) {
  const currentTime = Number(now?.());
  const expiryTime = Date.parse(value);
  return Number.isFinite(currentTime) && Number.isFinite(expiryTime) && expiryTime > currentTime;
}

function containsRecoverySecret(value) {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(containsRecoverySecret);
  return Object.entries(value).some(([key, child]) => /^(recoverykey|key|passphrase)$/i.test(key) || containsRecoverySecret(child));
}
