import { reframeNormalizedBox, resolveCropBounds, scaleNormalizedBox } from './redaction.js';

export async function sanitizeRasterImage(file, redactionPlan = []) {
  if (!file?.type?.startsWith('image/')) throw new Error('Canvas re-encoding supports raster image files only.');
  const bitmap = await createImageBitmap(file);
  try {
    const cropBounds = resolveCropBounds(redactionPlan);
    if (!cropBounds) throw new Error('The selected crop would remove the whole picture. Choose blur or cover instead.');
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * cropBounds.width));
    canvas.height = Math.max(1, Math.round(bitmap.height * cropBounds.height));
    const context = canvas.getContext('2d', { alpha: file.type === 'image/png' });
    context.drawImage(
      bitmap,
      Math.round(bitmap.width * cropBounds.x),
      Math.round(bitmap.height * cropBounds.y),
      Math.round(bitmap.width * cropBounds.width),
      Math.round(bitmap.height * cropBounds.height),
      0,
      0,
      canvas.width,
      canvas.height,
    );
    for (const item of redactionPlan) {
      if (item.action === 'crop') continue;
      const reframed = reframeNormalizedBox(item.box, cropBounds);
      if (reframed) applyRedaction(context, scaleNormalizedBox(reframed, canvas.width, canvas.height), item.action);
    }
    const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    const blob = await new Promise((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('The browser could not encode a clean image.')), outputType, 0.92));
    const name = file.name.replace(/\.[^.]+$/, '') + '-renitized.' + (outputType === 'image/png' ? 'png' : 'jpg');
    return new File([blob], name, { type: outputType, lastModified: Date.now() });
  } finally {
    bitmap.close();
  }
}

function applyRedaction(context, box, action) {
  if (!box.width || !box.height) return;
  if (action === 'cover') {
    context.save();
    context.fillStyle = '#18231d';
    context.fillRect(box.x, box.y, box.width, box.height);
    context.restore();
    return;
  }
  const scale = Math.max(1, Math.min(16, Math.round(Math.min(box.width, box.height) / 8)));
  const tinyWidth = Math.max(1, Math.round(box.width / scale));
  const tinyHeight = Math.max(1, Math.round(box.height / scale));
  const scratch = document.createElement('canvas');
  scratch.width = tinyWidth; scratch.height = tinyHeight;
  const scratchContext = scratch.getContext('2d');
  scratchContext.drawImage(context.canvas, box.x, box.y, box.width, box.height, 0, 0, tinyWidth, tinyHeight);
  context.save();
  context.imageSmoothingEnabled = true;
  context.drawImage(scratch, 0, 0, tinyWidth, tinyHeight, box.x, box.y, box.width, box.height);
  context.restore();
}
