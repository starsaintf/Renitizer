/**
 * Reuses a user's explicit extra-check consent for one narrow purpose: check
 * the newly-created image copy. It never sends the source image from here.
 */
export async function recheckCleanImage({ file, endpoint, consent, session, includeOsint = false, requestCloudAnalysis } = {}) {
  return recheckCleanFrames({
    requestFiles: { file },
    endpoint,
    consent,
    session,
    includeOsint,
    requestCloudAnalysis,
  });
}

/**
 * Rechecks sampled frames from a finished video. Only the processor's output
 * frames are sent, never the source video.
 */
export async function recheckCleanVideoFrames({ frames = [], endpoint, consent, session, includeOsint = false, requestCloudAnalysis } = {}) {
  const usableFrames = frames.filter((frame) => frame?.file?.type?.startsWith('image/'));
  return recheckCleanFrames({
    requestFiles: {
      files: usableFrames.map(({ file }) => file),
      frameContext: usableFrames.map(({ time, duration }) => ({ time, duration })),
    },
    endpoint,
    consent,
    session,
    includeOsint,
    requestCloudAnalysis,
  });
}

async function recheckCleanFrames({ requestFiles, endpoint, consent, session, includeOsint = false, requestCloudAnalysis } = {}) {
  const hasNamedService = Boolean(String(endpoint || '').trim()) || Boolean(session?.available && session?.endpoint && session?.capability);
  const files = requestFiles?.files || (requestFiles?.file ? [requestFiles.file] : []);
  if (!consent || !hasNamedService || !files.length || files.some((file) => !file?.type?.startsWith('image/'))) return emptyResult(false);
  try {
    const response = await requestCloudAnalysis({
      ...(String(endpoint || '').trim() ? { endpoint: String(endpoint).trim() } : {}),
      ...(session?.available ? { session } : {}),
      ...requestFiles,
      analyses: ['visual-pii', 'clean-copy-verification', ...(includeOsint ? ['clean-copy-osint'] : [])],
      consent: true,
      ...(includeOsint ? { returnDetails: true } : {}),
    });
    const { findings, providerChecks } = Array.isArray(response)
      ? { findings: response, providerChecks: {} }
      : { findings: Array.isArray(response?.findings) ? response.findings : [], providerChecks: response?.providerChecks || {} };
    const usable = findings.every((finding) => finding?.assessment !== 'unavailable');
    const requiredProviderChecks = ['cloud', ...(includeOsint ? ['faceLandmarks', 'reverseImage'] : [])];
    return {
      attempted: true,
      failed: false,
      findings: findings.map((finding, index) => ({
        ...finding,
        id: `verify-cloud-${String(finding?.id || index + 1)}`,
        verificationCheck: verificationCheckFor(finding),
        detail: `In the clean copy: ${String(finding?.detail || 'A possible privacy detail was found.')}`,
      })),
      providerResults: usable ? {
        cloud: true,
        ...(includeOsint && providerChecks.faceLandmarks === true ? { faceLandmarks: true } : {}),
        ...(includeOsint && providerChecks.reverseImage === true ? { reverseImage: true } : {}),
      } : {},
      requiredProviderChecks,
    };
  } catch {
    return { ...emptyResult(true), failed: true };
  }
}

function verificationCheckFor(finding) {
  if (['face', 'landmark'].includes(finding?.category)) return 'faceLandmarks';
  if (['reverse-image', 'osint'].includes(finding?.category)) return 'reverseImage';
  return 'cloud';
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
