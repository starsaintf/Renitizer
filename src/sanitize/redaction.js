const ACTIONS = new Set(['blur', 'cover']);

export function clampNormalizedBox(box = {}) {
  const x = Math.min(1, Math.max(0, Number(box.x) || 0));
  const y = Math.min(1, Math.max(0, Number(box.y) || 0));
  const right = Math.min(1, Math.max(x, (Number(box.x) || 0) + Math.max(0, Number(box.width) || 0)));
  const bottom = Math.min(1, Math.max(y, (Number(box.y) || 0) + Math.max(0, Number(box.height) || 0)));
  return { x: precise(x), y: precise(y), width: precise(right - x), height: precise(bottom - y) };
}

export function scaleNormalizedBox(box, width, height) {
  const normalized = clampNormalizedBox(box);
  return { x: normalized.x * width, y: normalized.y * height, width: normalized.width * width, height: normalized.height * height };
}

export function resolveRedactionPlan(findings = []) {
  return findings.flatMap((finding) => ACTIONS.has(finding.redactionAction) && finding.boundingBox
    ? [{ id: finding.id, action: finding.redactionAction, box: clampNormalizedBox(finding.boundingBox) }]
    : []);
}

export function setFindingAction(findings, id, action) {
  return findings.map((finding) => finding.id === id
    ? { ...finding, redactionAction: action, resolved: action !== 'keep' }
    : finding);
}

export function normalizePixelBox(box, width, height) {
  if (!box || !width || !height) return null;
  return clampNormalizedBox({ x: box.x / width, y: box.y / height, width: box.width / width, height: box.height / height });
}

function precise(value) { return Number(value.toFixed(12)); }
