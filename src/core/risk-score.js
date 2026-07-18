const severityWeights = { low: 6, medium: 14, high: 27, critical: 42 };

export function calculateRisk(findings = []) {
  const exposure = findings
    .filter((finding) => !finding.resolved)
    .reduce(
      (total, finding) => total + (severityWeights[finding.severity] ?? 0) * normalizeConfidence(finding.confidence),
      0,
    );

  return { safetyScore: Math.min(100, Math.max(0, Math.round(100 - exposure))) };
}

function normalizeConfidence(confidence) {
  const value = Number(confidence);
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
