const signalCategories = {
  location: new Set(['address', 'gps', 'location', 'landmark', 'location-clue', 'street-sign', 'road-name', 'map', 'route-display', 'dashboard-gps', 'place-name', 'business-name']),
  identity: new Set(['barcode', 'email', 'face', 'identity', 'name', 'phone', 'qr', 'vehicle-plate', 'license-plate', 'id-card', 'passport', 'bank-card', 'screen', 'document', 'mail', 'shipping-label']),
  device: new Set(['device', 'device-fingerprint', 'metadata']),
  visualAddress: new Set(['visual-address']),
  reverseImage: new Set(['reverse-image']),
};

export function groupSignals(findings = []) {
  return Object.fromEntries(
    Object.entries(signalCategories).map(([signal, categories]) => [
      signal,
      findings.filter((finding) => categories.has(finding.category)),
    ]),
  );
}

export function assessSignals(findings = []) {
  return Object.fromEntries(
    Object.entries(groupSignals(findings)).map(([signal, signalFindings]) => [
      signal,
      {
        assessment: assessmentFor(signalFindings),
        findings: signalFindings,
      },
    ]),
  );
}

function assessmentFor(findings) {
  if (findings.length === 0) return 'non-assessed';

  const assessments = new Set(findings.map((finding) => finding.assessment));
  if (assessments.has('unavailable')) return 'unavailable';
  if (assessments.has('unknown')) return 'unknown';
  if (assessments.has('non-assessed')) return 'non-assessed';
  return 'assessed';
}
