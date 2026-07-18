import { calculateRisk } from './risk-score.js';

const localChecks = {
  metadata: {
    label: 'Metadata',
    matches: (finding) => /^(metadata-|verify-metadata)/.test(finding.id || '') || ['metadata', 'gps', 'device'].includes(finding.category),
  },
  visibleText: {
    label: 'Visible text',
    matches: (finding) => /^(ocr-|verify-ocr-)/.test(finding.id || '') || ['email', 'phone', 'name', 'address', 'visual-address'].includes(finding.category),
  },
  barcodes: {
    label: 'Barcodes',
    matches: (finding) => /^(barcode-|verify-barcode)/.test(finding.id || '') || ['barcode', 'qr'].includes(finding.category),
  },
};

export function boundedSafetyScore(residualRisks = []) {
  const { safetyScore } = calculateRisk(residualRisks);
  return Math.min(100, Math.max(0, Number.isFinite(safetyScore) ? safetyScore : 0));
}

export function deriveResidualRisks({ beforeFindings = [], afterFindings = [], assessedChecks = [], redactionPlan = [] } = {}) {
  const assessed = new Set(assessedChecks);
  const addressedBoxes = new Set(redactionPlan.filter((item) => ['blur', 'cover'].includes(item.action)).map((item) => item.id));
  const residual = afterFindings.filter((finding) => !finding.resolved);

  for (const finding of beforeFindings.filter((item) => !item.resolved)) {
    const localCheck = localCheckFor(finding);
    const needsVisualRedaction = Boolean(finding.boundingBox) && !addressedBoxes.has(finding.id);
    if (needsVisualRedaction || !localCheck || !assessed.has(localCheck)) residual.push(finding);
  }

  return uniqueByIdentity(residual);
}

export function createVerification({
  beforeFindings = [],
  afterFindings = [],
  assessedChecks = [],
  redactionPlan = [],
  providerResults = {},
} = {}) {
  const residualRisks = deriveResidualRisks({ beforeFindings, afterFindings, assessedChecks, redactionPlan });
  const checks = {
    metadata: localCheckResult('metadata', afterFindings, assessedChecks),
    visibleText: localCheckResult('visibleText', afterFindings, assessedChecks),
    barcodes: localCheckResult('barcodes', afterFindings, assessedChecks),
    visualRedactions: visualRedactionResult(beforeFindings, redactionPlan),
    cloud: providerCheckResult('cloud', providerResults.cloud, afterFindings),
    faceLandmarks: providerCheckResult('faceLandmarks', providerResults.faceLandmarks, afterFindings),
    reverseImage: providerCheckResult('reverseImage', providerResults.reverseImage, afterFindings),
  };
  const needsReview = residualRisks.length > 0 || Object.values(checks).some((check) => check.status === 'review-needed');

  return {
    residualRisks,
    safetyScore: boundedSafetyScore(residualRisks),
    readiness: needsReview
      ? { state: 'review-needed', label: 'Review these items' }
      : { state: 'ready', label: 'Ready to save' },
    checks,
  };
}

function localCheckResult(key, afterFindings, assessedChecks) {
  const { label, matches } = localChecks[key];
  if (!assessedChecks.includes(key)) return { status: 'not-assessed', reason: `${label} was not checked again on the clean copy.` };
  if (afterFindings.some((finding) => finding.verificationCheck === key && finding.assessment === 'unavailable')) {
    return { status: 'not-assessed', reason: `${label} could not be checked again on the clean copy.` };
  }
  const risks = afterFindings.filter((finding) => !finding.resolved && matches(finding));
  return risks.length
    ? { status: 'review-needed', reason: `${label} check found ${risks.length} item${risks.length === 1 ? '' : 's'} in the clean copy.` }
    : { status: 'passed', reason: `${label} check found no remaining items in the clean copy.` };
}

function visualRedactionResult(beforeFindings, redactionPlan) {
  const selected = new Set(redactionPlan.filter((item) => ['blur', 'cover'].includes(item.action)).map((item) => item.id));
  const skipped = beforeFindings.filter((finding) => !finding.resolved && finding.boundingBox && !selected.has(finding.id));
  if (skipped.length) return { status: 'review-needed', reason: `${skipped.length} marked visible item${skipped.length === 1 ? '' : 's'} was not selected for blur or cover.` };
  return { status: 'passed', reason: 'All marked visible items were selected for blur or cover.' };
}

function providerCheckResult(key, provided, afterFindings) {
  const descriptors = {
    cloud: ['cloud assessment', 'No cloud assessment result was supplied for the clean copy.', (finding) => finding.source === 'cloud'],
    faceLandmarks: ['face or landmark', 'No face or landmark provider result was supplied for the clean copy.', (finding) => ['face', 'landmark'].includes(finding.category)],
    reverseImage: ['reverse-image or OSINT', 'No reverse-image or OSINT provider result was supplied for the clean copy.', (finding) => ['reverse-image', 'osint'].includes(finding.category)],
  };
  const [label, missingReason, matches] = descriptors[key];
  if (!provided) return { status: 'not-assessed', reason: missingReason };
  const risks = afterFindings.filter((finding) => !finding.resolved && matches(finding));
  return risks.length
    ? { status: 'review-needed', reason: `${label[0].toUpperCase()}${label.slice(1)} assessment found ${risks.length} item${risks.length === 1 ? '' : 's'}.` }
    : { status: 'passed', reason: `${label[0].toUpperCase()}${label.slice(1)} assessment returned no remaining items.` };
}

function localCheckFor(finding) {
  return Object.entries(localChecks).find(([, check]) => check.matches(finding))?.[0];
}

function uniqueByIdentity(findings) {
  const seen = new Set();
  return findings.filter((finding) => {
    const identity = finding.id || `${finding.category}:${finding.title}:${finding.detail}`;
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}
