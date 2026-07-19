export const MAX_SHARE_BYTES = 100 * 1024 * 1024;
const MAX_SHARE_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const ACCOUNT_ID = /^acct_[A-Za-z0-9_-]{2,120}$/;
const SHARE_ID = /^share_[A-Za-z0-9_-]{8,128}$/;

export function ownerManifestKey({ ownerAccountId, shareId }) {
  return `shares/${ownerAccountId}/${shareId}/manifest.json`;
}

export function packageObjectKey({ ownerAccountId, shareId }) {
  return `shares/${ownerAccountId}/${shareId}/package.renitizer`;
}

export function recipientIndexKey({ recipientAccountId, shareId }) {
  return `share-recipients/${recipientAccountId}/${shareId}.json`;
}

export function createShare(input, { createId = defaultShareId, now = () => new Date().toISOString() } = {}) {
  const ownerAccountId = input?.ownerAccountId;
  const recipientAccountId = input?.recipientAccountId;
  const packageSize = input?.packageSize;
  const currentTime = Date.parse(now());
  const expiryTime = Date.parse(input?.expiresAt);
  if (!isAccountId(ownerAccountId)) return invalid('The sending Renvoy account is invalid.');
  if (!isAccountId(recipientAccountId)) return invalid('Choose a valid recipient Renvoy account.');
  if (recipientAccountId === ownerAccountId) return invalid('Choose a different recipient account.');
  if (!Number.isInteger(packageSize) || packageSize < 1 || packageSize > MAX_SHARE_BYTES) return invalid('The encrypted package must be between 1 byte and 100 MB.');
  if (!Number.isFinite(expiryTime) || expiryTime <= currentTime) return invalid('The share expiry must be in the future.');
  if (expiryTime - currentTime > MAX_SHARE_LIFETIME_MS) return invalid('Hosted shares can last for up to 30 days.');
  const id = createId();
  if (!SHARE_ID.test(id)) return invalid('Could not create a secure share ID.');
  const createdAt = new Date(currentTime).toISOString();
  const expiresAt = new Date(expiryTime).toISOString();
  return {
    valid: true,
    value: {
      id,
      ownerAccountId,
      recipientAccountId,
      createdAt,
      expiresAt,
      packageKey: packageObjectKey({ ownerAccountId, shareId: id }),
    },
  };
}

export function parseShareRequest(form, ownerAccountId, options = {}) {
  if (form.has('recoveryKey') || form.has('key') || form.has('passphrase')) {
    return invalid('The recovery key stays with the sender and cannot be uploaded.');
  }
  const encryptedPackage = form.get('package');
  if (!(encryptedPackage instanceof File)) return invalid('Attach an encrypted Renitizer package.');
  const share = createShare({
    ownerAccountId,
    recipientAccountId: String(form.get('recipientAccountId') ?? ''),
    expiresAt: String(form.get('expiresAt') ?? ''),
    packageSize: encryptedPackage.size,
  }, optionsWithPackage(options, encryptedPackage));
  return share.valid ? { valid: true, value: { ...share.value, encryptedPackage } } : share;
}

export function publicShare(share) {
  return {
    id: share.id,
    recipientAccountId: share.recipientAccountId,
    createdAt: share.createdAt,
    expiresAt: share.expiresAt,
  };
}

export function recipientIndex(share) {
  return { ownerAccountId: share.ownerAccountId, expiresAt: share.expiresAt };
}

export function isExpired(share, now = () => new Date().toISOString()) {
  return Date.parse(share.expiresAt) <= Date.parse(now());
}

export function isAccountId(value) { return typeof value === 'string' && ACCOUNT_ID.test(value); }

function optionsWithPackage(options, encryptedPackage) {
  return { ...options, encryptedPackage };
}

function defaultShareId() {
  return `share_${crypto.randomUUID().replaceAll('-', '')}`;
}

function invalid(error) { return { valid: false, error }; }
