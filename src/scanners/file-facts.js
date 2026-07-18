export async function scanFileFacts(file) {
  const facts = [{
    id: 'file-facts', category: 'file', title: 'File inspected',
    detail: `${file.type || 'Unknown type'} · ${formatBytes(file.size)}`,
    severity: 'low', confidence: 1, recommendation: 'Review the supported local checks below.',
    assessment: 'assessed', resolved: true,
  }];
  if (!file.type.startsWith('image/')) return facts;

  try {
    const dimensions = await imageDimensions(file);
    facts[0].detail += ` · ${dimensions.width} × ${dimensions.height}px`;
  } catch {
    facts.push(capabilityFinding('image-dimensions', 'Image dimensions unavailable', 'This image could not be decoded by the browser.'));
  }
  return facts;
}

export function capabilityFinding(id, title, detail) {
  return {
    id, category: 'capability', title, detail, severity: 'low', confidence: 1,
    recommendation: 'Continue with available local checks or use a compatible browser.',
    assessment: 'unavailable', resolved: false,
  };
}

async function imageDimensions(file) {
  const bitmap = await createImageBitmap(file);
  const dimensions = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return dimensions;
}

function formatBytes(bytes) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
