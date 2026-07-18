import { capabilityFinding } from './file-facts.js';

export async function scanBarcodes(file) {
  if (!globalThis.BarcodeDetector) {
    return [capabilityFinding('barcode-unavailable', 'QR and barcode scan unavailable', 'BarcodeDetector is not supported by this browser. No code scan was simulated.')];
  }
  if (!file.type.startsWith('image/')) return [];
  const detector = new BarcodeDetector({ formats: ['aztec', 'code_128', 'data_matrix', 'ean_13', 'ean_8', 'itf', 'pdf417', 'qr_code', 'upc_a', 'upc_e'] });
  const bitmap = await createImageBitmap(file);
  try {
    const codes = await detector.detect(bitmap);
    return codes.map((code, index) => ({
      id: `barcode-${index + 1}`, category: code.format === 'qr_code' ? 'qr' : 'barcode',
      title: code.format === 'qr_code' ? 'QR code detected' : 'Barcode detected',
      detail: code.rawValue ? `Encoded value: ${code.rawValue.slice(0, 120)}` : 'A machine-readable code is visible.',
      severity: 'medium', confidence: 0.95, boundingBox: code.boundingBox,
      recommendation: 'Crop or redact the code before sharing.', assessment: 'assessed', resolved: false,
    }));
  } finally {
    bitmap.close();
  }
}
