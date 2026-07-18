const TESSERACT_MODULE = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.esm.min.js';
let tesseractLoader;

export function loadTesseract() {
  tesseractLoader ??= import(TESSERACT_MODULE);
  return tesseractLoader;
}

export async function scanOcr(file) {
  if (!file.type.startsWith('image/')) return [];
  const { createWorker } = await loadTesseract();
  const worker = await createWorker('eng');
  try {
    const { data } = await worker.recognize(file);
    return piiFindings(data.text || '');
  } finally {
    await worker.terminate();
  }
}

export function piiFindings(text) {
  const rules = [
    ['email', /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, 'Email address detected', 'identity', 'medium'],
    ['phone', /(?:\+?\d[\d ()-]{7,}\d)/g, 'Phone number detected', 'identity', 'medium'],
    ['visual-address', /\b(?:street|st\.?|avenue|ave\.?|road|rd\.?|boulevard|blvd\.?|lane|ln\.?|drive|dr\.?)\b/i, 'Possible street address detected', 'visual-address', 'high'],
  ];
  return rules.flatMap(([id, expression, title, category, severity]) => {
    const match = text.match(expression);
    return match ? [{
      id: `ocr-${id}`, category, title, detail: `Recognized text: ${match[0].slice(0, 120)}`,
      severity, confidence: 0.75, recommendation: 'Redact the text region before sharing.',
      assessment: 'assessed', resolved: false,
    }] : [];
  });
}
