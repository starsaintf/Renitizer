import test from 'node:test';
import assert from 'node:assert/strict';
import { piiFindings } from '../src/scanners/ocr.js';

test('maps a recognized email token to an editable normalized redaction box', () => {
  const findings = piiFindings('Contact alex@example.com to arrange collection.', {
    width: 1000,
    height: 500,
    words: [{ text: 'alex@example.com', bbox: { x0: 120, y0: 80, x1: 420, y1: 130 } }],
  });

  assert.deepEqual(findings.find((finding) => finding.id === 'ocr-email')?.boundingBox, {
    x: 0.12,
    y: 0.16,
    width: 0.3,
    height: 0.1,
  });
});

test('maps an address cue to the complete recognized address line', () => {
  const findings = piiFindings('Meet at 41 Market Street, Lagos.', {
    width: 1000,
    height: 500,
    lines: [{ text: 'Meet at 41 Market Street, Lagos.', bbox: { x0: 50, y0: 300, x1: 650, y1: 350 } }],
  });

  assert.deepEqual(findings.find((finding) => finding.id === 'ocr-visual-address')?.boundingBox, {
    x: 0.05,
    y: 0.6,
    width: 0.6,
    height: 0.1,
  });
});

test('joins adjacent OCR tokens when locating a phone number', () => {
  const findings = piiFindings('Call +1 555 010 0200 for delivery.', {
    width: 1000,
    height: 500,
    words: [
      { text: '+1', bbox: { x0: 100, y0: 200, x1: 150, y1: 240 } },
      { text: '555', bbox: { x0: 160, y0: 200, x1: 250, y1: 240 } },
      { text: '010', bbox: { x0: 260, y0: 200, x1: 350, y1: 240 } },
      { text: '0200', bbox: { x0: 360, y0: 200, x1: 480, y1: 240 } },
    ],
  });

  assert.deepEqual(findings.find((finding) => finding.id === 'ocr-phone')?.boundingBox, {
    x: 0.1,
    y: 0.4,
    width: 0.38,
    height: 0.08,
  });
});
