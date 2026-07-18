export async function sanitizeRasterImage(file) {
  if (!file?.type?.startsWith('image/')) throw new Error('Canvas re-encoding supports raster image files only.');
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d', { alpha: file.type === 'image/png' }).drawImage(bitmap, 0, 0);
    const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    const blob = await new Promise((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('The browser could not encode a clean image.')), outputType, 0.92));
    const name = file.name.replace(/\.[^.]+$/, '') + '-renitized.' + (outputType === 'image/png' ? 'png' : 'jpg');
    return new File([blob], name, { type: outputType, lastModified: Date.now() });
  } finally {
    bitmap.close();
  }
}
