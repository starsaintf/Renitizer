const signalCategories = {
  location: new Set(['address', 'gps', 'location', 'visual-address']),
  identity: new Set(['barcode', 'email', 'face', 'identity', 'name', 'phone', 'qr']),
  device: new Set(['device', 'device-fingerprint', 'metadata']),
};

export function groupSignals(findings = []) {
  return Object.fromEntries(
    Object.entries(signalCategories).map(([signal, categories]) => [
      signal,
      findings.filter((finding) => categories.has(finding.category)),
    ]),
  );
}
