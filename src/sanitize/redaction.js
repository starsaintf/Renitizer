const ACTIONS = new Set(['blur', 'cover', 'crop']);

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

function intersects(first, second) {
  return first.x < second.x + second.width
    && first.x + first.width > second.x
    && first.y < second.y + second.height
    && first.y + first.height > second.y;
}

/**
 * Finds the largest rectangular part of the photo that excludes each crop
 * finding. A null result means there is no photo left to retain.
 */
export function resolveCropBounds(plan = []) {
  const crops = plan.filter((item) => item?.action === 'crop' && item?.box);
  if (!crops.length) return { x: 0, y: 0, width: 1, height: 1 };

  const xs = [...new Set([0, 1, ...crops.flatMap(({ box }) => [box.x, box.x + box.width])])]
    .filter((value) => value >= 0 && value <= 1)
    .sort((a, b) => a - b);
  const ys = [...new Set([0, 1, ...crops.flatMap(({ box }) => [box.y, box.y + box.height])])]
    .filter((value) => value >= 0 && value <= 1)
    .sort((a, b) => a - b);

  let best = null;
  for (let left = 0; left < xs.length - 1; left += 1) {
    for (let right = left + 1; right < xs.length; right += 1) {
      for (let top = 0; top < ys.length - 1; top += 1) {
        for (let bottom = top + 1; bottom < ys.length; bottom += 1) {
          const candidate = { x: xs[left], y: ys[top], width: xs[right] - xs[left], height: ys[bottom] - ys[top] };
          if (candidate.width <= 0 || candidate.height <= 0 || crops.some(({ box }) => intersects(candidate, box))) continue;
          if (!best || candidate.width * candidate.height > best.width * best.height) best = candidate;
        }
      }
    }
  }
  return best;
}

/** Converts a source-image box to a retained crop's coordinate space. */
export function reframeNormalizedBox(box, cropBounds) {
  if (!box || !cropBounds || !intersects(box, cropBounds)) return null;
  const left = Math.max(box.x, cropBounds.x);
  const top = Math.max(box.y, cropBounds.y);
  const right = Math.min(box.x + box.width, cropBounds.x + cropBounds.width);
  const bottom = Math.min(box.y + box.height, cropBounds.y + cropBounds.height);
  if (right <= left || bottom <= top) return null;
  return {
    x: precise((left - cropBounds.x) / cropBounds.width),
    y: precise((top - cropBounds.y) / cropBounds.height),
    width: precise((right - left) / cropBounds.width),
    height: precise((bottom - top) / cropBounds.height),
  };
}

export function setFindingAction(findings, id, action) {
  return findings.map((finding) => finding.id === id
    ? { ...finding, redactionAction: action, resolved: false }
    : finding);
}

export function markRedactionsResolved(findings = [], plan = []) {
  const applied = new Set(plan.filter((item) => ACTIONS.has(item.action)).map((item) => item.id));
  return findings.map((finding) => applied.has(finding.id) ? { ...finding, resolved: true } : finding);
}

export function normalizePixelBox(box, width, height) {
  if (!box || !width || !height) return null;
  return clampNormalizedBox({ x: box.x / width, y: box.y / height, width: box.width / width, height: box.height / height });
}

function precise(value) { return Number(value.toFixed(12)); }
