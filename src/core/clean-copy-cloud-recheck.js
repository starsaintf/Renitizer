/**
 * Reuses a user's explicit extra-check consent for one narrow purpose: check
 * the newly-created image copy. It never sends the source image from here.
 */
export async function recheckCleanImage({ file, endpoint, consent, requestCloudAnalysis } = {}) {
  if (!consent || !String(endpoint || '').trim() || !file?.type?.startsWith('image/')) {
    return emptyResult(false);
  }

  try {
    const findings = await requestCloudAnalysis({
      endpoint: String(endpoint).trim(),
      file,
      analyses: ['visual-pii', 'clean-copy-verification'],
      consent: true,
    });
    const usable = findings.every((finding) => finding?.assessment !== 'unavailable');
    return {
      attempted: true,
      failed: false,
      findings: findings.map((finding, index) => ({
        ...finding,
        id: `verify-cloud-${String(finding?.id || index + 1)}`,
        verificationCheck: 'cloud',
        detail: `In the clean copy: ${String(finding?.detail || 'A possible privacy detail was found.')}`,
      })),
      providerResults: usable ? { cloud: true } : {},
      requiredProviderChecks: ['cloud'],
    };
  } catch {
    return { ...emptyResult(true), failed: true };
  }
}

function emptyResult(attempted) {
  return {
    attempted,
    failed: false,
    findings: [],
    providerResults: {},
    requiredProviderChecks: attempted ? ['cloud'] : [],
  };
}
