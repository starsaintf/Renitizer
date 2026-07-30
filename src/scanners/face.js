import { capabilityFinding } from './file-facts.js';
import { normalizePixelBox } from '../sanitize/redaction.js';

export async function scanFaces(file, options = {}) {
  const FaceDetectorCtor = Object.hasOwn(options, 'FaceDetectorCtor') ? options.FaceDetectorCtor : globalThis.FaceDetector;
  if (!FaceDetectorCtor) {
    return [capabilityFinding('face-unavailable', 'Face check unavailable', 'This browser does not provide local face detection. No face check was simulated.')];
  }
  if (!file?.type?.startsWith('image/')) return [];
  const createBitmap = options.createBitmap || globalThis.createImageBitmap;
  if (typeof createBitmap !== 'function') {
    return [capabilityFinding('face-unavailable', 'Face check unavailable', 'This browser cannot decode this image for a local face check. No face check was simulated.')];
  }

  const detector = new FaceDetectorCtor();
  const bitmap = await createBitmap(file);
  try {
    const faces = await detector.detect(bitmap);
    return faces.flatMap((face, index) => {
      const boundingBox = normalizePixelBox(face?.boundingBox, bitmap.width, bitmap.height);
      return boundingBox ? [{
        id: `face-${index + 1}`, category: 'face', title: 'Face detected',
        detail: 'A face is visible in this image.', severity: 'high', confidence: 0.9,
        boundingBox, recommendation: 'Blur or cover this face before sharing.', assessment: 'assessed', resolved: false,
      }] : [];
    });
  } finally {
    bitmap.close();
  }
}
