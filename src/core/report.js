import { assessSignals } from './findings.js';
import { calculateRisk } from './risk-score.js';
import { resolvedAudioRanges } from '../sanitize/audio.js';

export function makeReport(findings = []) {
  const residualRisks = findings.filter((finding) => !finding.resolved);

  return {
    ...calculateRisk(findings),
    residualRisks,
    counts: {
      total: findings.length,
      unresolved: residualRisks.length,
      resolved: findings.length - residualRisks.length,
    },
    signals: assessSignals(findings),
    audioRedactions: resolvedAudioRanges(findings),
  };
}
