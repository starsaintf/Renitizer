import test from 'node:test';
import assert from 'node:assert/strict';
import { detectMetadataMarkers, metadataFindings } from '../src/scanners/metadata.js';

test('detectMetadataMarkers recognizes common EXIF, GPS, XMP, IPTC, and device markers', () => {
  const bytes = new TextEncoder().encode(
    'Exif GPSLatitude GPSLongitude xmp:CreatorTool IPTC CameraModel Apple iPhone',
  ).buffer;

  assert.deepEqual(detectMetadataMarkers(bytes), ['exif', 'gps', 'xmp', 'iptc', 'device']);
});

test('detectMetadataMarkers avoids duplicate marker classes', () => {
  const bytes = new TextEncoder().encode('Exif Exif GPSInfo GPSInfo').buffer;

  assert.deepEqual(detectMetadataMarkers(bytes), ['exif', 'gps']);
});

test('metadataFindings normalizes a GPS marker into a removable privacy finding', () => {
  assert.deepEqual(metadataFindings(['gps']), [{
    id: 'metadata-gps',
    category: 'gps',
    title: 'Location metadata present',
    detail: 'The file contains GPS-style metadata markers.',
    severity: 'high',
    confidence: 0.9,
    recommendation: 'Create a canvas-re-encoded copy before sharing.',
    assessment: 'assessed',
    resolved: false,
  }]);
});
