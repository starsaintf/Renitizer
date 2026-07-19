const ACTION_VERBS = {
  remove: 'Removed',
  blur: 'Blurred',
  cover: 'Covered',
  mute: 'Muted',
  bleep: 'Bleeped',
};

export function createReceipt({ findings = [], report = {}, verification = null, documentCleaning = null } = {}) {
  const found = [];
  const changed = [];
  const kept = [];
  const notChecked = [];

  for (const finding of findings) {
    const label = findingLabel(finding);
    if (finding.assessment === 'unavailable') {
      notChecked.push(label);
      continue;
    }
    found.push(label);
    const action = finding.redactionAction || finding.action;
    if (finding.resolved && action && action !== 'keep') changed.push(`${ACTION_VERBS[action] || 'Changed'}: ${label}`);
    else if (!finding.resolved || action === 'keep') kept.push(`Kept: ${label}`);
  }

  for (const [check, result] of Object.entries(verification?.checks || {})) {
    if (result?.status === 'unavailable' || result?.status === 'not-assessed') {
      notChecked.push(`${friendlyCheckName(check)}: ${result.reason || 'This check was not available.'}`);
    }
  }
  if (documentCleaning?.state === 'processor-unconfigured' && documentCleaning.message) notChecked.push(documentCleaning.message);

  return {
    format: 'renitizer-cleaning-receipt-v1',
    createdAt: new Date().toISOString(),
    counts: report?.counts || { total: findings.length, resolved: changed.length, unresolved: kept.length },
    found,
    changed,
    kept,
    notChecked,
    summary: makeSummary(changed.length, kept.length, notChecked.length),
  };
}

function findingLabel(finding) { return String(finding?.title || finding?.detail || 'A private detail').trim(); }
function friendlyCheckName(check) { return ({ metadata: 'Metadata', visibleText: 'Visible text', barcodes: 'Barcodes', visualRedactions: 'Visual redactions', cloud: 'Cloud assessment' })[check] || check; }
function makeSummary(changed, kept, notChecked) {
  const parts = [
    changed ? `${changed} change${changed === 1 ? '' : 's'} made` : 'No changes made',
    kept ? `${kept} item${kept === 1 ? '' : 's'} kept` : null,
    notChecked ? `${notChecked} check${notChecked === 1 ? '' : 's'} not available` : null,
  ].filter(Boolean);
  return parts.join(' · ');
}
