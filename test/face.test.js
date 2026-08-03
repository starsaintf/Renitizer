import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { scanFaces } from '../src/scanners/face.js';
import { friendlyFinding } from '../src/core/friendly-findings.js';

test('creates an editable normalized finding for each detected face', async () => {
  let closed = false;
  class Detector {
    async detect() {
      return [{ boundingBox: { x: 120, y: 40, width: 160, height: 200 } }];
    }
  }

  const findings = await scanFaces({ type: 'image/jpeg' }, {
    FaceDetectorCtor: Detector,
    createBitmap: async () => ({ width: 800, height: 400, close() { closed = true; } }),
  });

  assert.equal(closed, true);
  assert.deepEqual(findings, [{
    id: 'face-1', category: 'face', title: 'Face detected',
    detail: 'A face is visible in this image.', severity: 'high', confidence: 0.9,
    boundingBox: { x: 0.15, y: 0.1, width: 0.2, height: 0.5 },
    recommendation: 'Blur or cover this face before sharing.', assessment: 'assessed', resolved: false,
  }]);
});

test('reports that face detection is unavailable instead of simulating a result', async () => {
  const findings = await scanFaces({ type: 'image/jpeg' }, { FaceDetectorCtor: undefined });

  assert.equal(findings[0].id, 'face-unavailable');
  assert.equal(findings[0].assessment, 'unavailable');
});

test('includes the face scanner in Renitizer’s standard image check', async () => {
  const app = await fs.readFile(new URL('../src/main.js', import.meta.url), 'utf8');

  assert.match(app, /import \{ scanFaces \} from '\.\/scanners\/face\.js';/);
  assert.match(app, /\[scanFileFacts, scanMetadata, scanBarcodes, scanFaces\]/);
  assert.match(app, /new Set\(isImage \? \['metadata', 'barcodes', 'faces'\] : \['metadata'\]\)/);
  assert.match(app, /faces: scanFaces/);
});

test('uses plain language for a detected face in the app', () => {
  assert.deepEqual(friendlyFinding({ id: 'face-1', category: 'face' }), {
    title: 'A face was found',
    detail: 'You can blur, cover, crop it out, or keep it before you share.',
  });
});
