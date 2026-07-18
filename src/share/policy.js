export const SHARE_EXPIRY_OPTIONS = Object.freeze({
  '1-day': 1,
  '7-days': 7,
  '30-days': 30,
});

export function validateShareExpiry(option, now = new Date()) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) return { valid: false, error: 'A valid current time is required.' };
  const days = SHARE_EXPIRY_OPTIONS[option];
  if (!days) return { valid: false, error: 'Choose a supported expiry period.' };
  return {
    valid: true,
    value: { option, expiresAt: new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString() },
  };
}

export function getShareState({ hasCleanCopy, expiry, now = new Date() }) {
  if (!hasCleanCopy) return {
    state: 'not-ready',
    available: false,
    delivery: 'unconfigured',
    message: 'Make a clean copy before preparing an encrypted package.',
  };
  const expiryResult = validateShareExpiry(expiry, now);
  if (!expiryResult.valid) return { state: 'invalid', available: false, delivery: 'unconfigured', message: expiryResult.error };
  return {
    state: 'ready',
    available: true,
    delivery: 'unconfigured',
    message: 'Encrypted package download only. No public link or server storage is configured.',
    expiresAt: expiryResult.value.expiresAt,
  };
}

export function createSafeShareReport({ report = {}, verification = null, findings = [], expiresAt = null, includeDetailedFindings = false } = {}) {
  const payload = {
    format: 'renitizer-privacy-report-v1',
    generatedAt: new Date().toISOString(),
    expiresAt,
    summary: {
      safetyScore: report.safetyScore ?? null,
      counts: report.counts ?? { total: 0, unresolved: 0, resolved: 0 },
      signals: summarizeSignals(report.signals),
      readiness: verification?.readiness ?? null,
      audioRedactions: report.audioRedactions ?? [],
    },
  };
  if (includeDetailedFindings) payload.findings = findings;
  return payload;
}

function summarizeSignals(signals = {}) {
  return Object.fromEntries(Object.entries(signals).map(([name, value]) => [name, {
    assessment: value?.assessment ?? null,
    count: Array.isArray(value?.findings) ? value.findings.length : Number(value) || 0,
  }]));
}
