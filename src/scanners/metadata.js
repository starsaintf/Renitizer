const markerRules = [
  ['exif', /\bexif\b/i],
  ['gps', /\bgps(?:latitude|longitude|altitude|info|position)?\b/i],
  ['xmp', /\bxmp(?::|\b)/i],
  ['iptc', /\biptc\b/i],
  ['device', /\b(?:cameramodel|cameramake|make|model|apple|android|iphone|pixel)\b/i],
];

const findingDetails = {
  exif: ['metadata-exif', 'metadata', 'EXIF metadata present', 'The file contains EXIF-style metadata markers.', 'medium'],
  gps: ['metadata-gps', 'gps', 'Location metadata present', 'The file contains GPS-style metadata markers.', 'high'],
  xmp: ['metadata-xmp', 'metadata', 'XMP metadata present', 'The file contains XMP-style metadata markers.', 'medium'],
  iptc: ['metadata-iptc', 'metadata', 'IPTC metadata present', 'The file contains IPTC-style metadata markers.', 'medium'],
  device: ['metadata-device', 'device', 'Device metadata present', 'The file contains camera or device metadata markers.', 'low'],
};

export function detectMetadataMarkers(buffer) {
  const text = new TextDecoder('latin1').decode(buffer);
  return markerRules.filter(([, pattern]) => pattern.test(text)).map(([marker]) => marker);
}

export function metadataFindings(markers = []) {
  return markers.flatMap((marker) => {
    const detail = findingDetails[marker];
    if (!detail) return [];
    const [id, category, title, description, severity] = detail;
    return [{
      id,
      category,
      title,
      detail: description,
      severity,
      confidence: marker === 'gps' ? 0.9 : 0.85,
      recommendation: 'Create a canvas-re-encoded copy before sharing.',
      assessment: 'assessed',
      resolved: false,
    }];
  });
}

export async function scanMetadata(file) {
  const markers = detectMetadataMarkers(await file.arrayBuffer());
  return metadataFindings(markers);
}
