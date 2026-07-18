const severityWeights = { low: 6, medium: 14, high: 27, critical: 42 };

export function calculateRisk(findings = []) {
  const exposure = findings
    .filter((finding) => !finding.resolved)
    .reduce(
      (total, finding) => total + (severityWeights[finding.severity] ?? 0) * (finding.confidence ?? 0),
      0,
    );

  return { safetyScore: Math.max(0, Math.round(100 - exposure)) };
}
