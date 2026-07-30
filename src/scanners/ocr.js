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
    const dimensions = await imageDimensions(file);
    return piiFindings(data.text || '', { ...dimensions, words: data.words, lines: data.lines });
  } finally {
    await worker.terminate();
  }
}

export function piiFindings(text, { words = [], lines = [], width = 0, height = 0 } = {}) {
  const rules = [
    ['email', /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, 'Email address detected', 'identity', 'medium'],
    ['phone', /(?:\+?\d[\d ()-]{7,}\d)/g, 'Phone number detected', 'identity', 'medium'],
    ['visual-address', /\b(?:street|st\.?|avenue|ave\.?|road|rd\.?|boulevard|blvd\.?|lane|ln\.?|drive|dr\.?)\b/i, 'Possible street address detected', 'visual-address', 'high'],
  ];
  return rules.flatMap(([id, expression, title, category, severity]) => {
    const match = text.match(expression);
    const boundingBox = match ? boxForMatch(match[0], words, lines, width, height, category) : null;
    return match ? [{
      id: `ocr-${id}`, category, title, detail: `Recognized text: ${match[0].slice(0, 120)}`,
      severity, confidence: 0.75, recommendation: 'Redact the text region before sharing.',
      assessment: 'assessed', resolved: false, ...(boundingBox ? { boundingBox } : {}),
    }] : [];
  });
}

async function imageDimensions(file) {
  const bitmap = await createImageBitmap(file);
  try { return { width: bitmap.width, height: bitmap.height }; }
  finally { bitmap.close(); }
}

function boxForMatch(match, words, lines, width, height, category) {
  if (!width || !height) return null;
  const needle = compact(match);
  const source = category === 'visual-address' && Array.isArray(lines) ? lines : words;
  if (!Array.isArray(source)) return null;
  const item = source.find((candidate) => compact(candidate?.text).includes(needle));
  const bbox = item?.bbox || wordSequenceBox(source, needle);
  if (!validBbox(bbox)) return null;
  return normalizeBox({ x: bbox.x0, y: bbox.y0, width: bbox.x1 - bbox.x0, height: bbox.y1 - bbox.y0 }, width, height);
}

function wordSequenceBox(words, needle) {
  for (let start = 0; start < words.length; start += 1) {
    let candidate = '';
    const boxes = [];
    for (let end = start; end < Math.min(words.length, start + 8); end += 1) {
      candidate += compact(words[end]?.text);
      if (validBbox(words[end]?.bbox)) boxes.push(words[end].bbox);
      if (candidate === needle || candidate.includes(needle)) return mergeBoxes(boxes);
      if (candidate.length > needle.length + 16) break;
    }
  }
  return null;
}

function mergeBoxes(boxes) {
  if (!boxes.length) return null;
  return {
    x0: Math.min(...boxes.map((box) => box.x0)),
    y0: Math.min(...boxes.map((box) => box.y0)),
    x1: Math.max(...boxes.map((box) => box.x1)),
    y1: Math.max(...boxes.map((box) => box.y1)),
  };
}

function validBbox(bbox) {
  return Boolean(bbox) && Number.isFinite(bbox.x0) && Number.isFinite(bbox.y0)
    && Number.isFinite(bbox.x1) && Number.isFinite(bbox.y1) && bbox.x1 > bbox.x0 && bbox.y1 > bbox.y0;
}

function compact(value) { return String(value || '').replace(/\s+/g, '').toLowerCase(); }

function normalizeBox(box, width, height) {
  const x = Math.max(0, Math.min(1, box.x / width));
  const y = Math.max(0, Math.min(1, box.y / height));
  const right = Math.max(x, Math.min(1, (box.x + Math.max(0, box.width)) / width));
  const bottom = Math.max(y, Math.min(1, (box.y + Math.max(0, box.height)) / height));
  return { x: precise(x), y: precise(y), width: precise(right - x), height: precise(bottom - y) };
}

function precise(value) { return Number(value.toFixed(12)); }
