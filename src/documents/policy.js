const DOCUMENT_TYPES = new Set(['pdf', 'office']);
const CATEGORY_ALIASES = new Map([
  ['author', 'author'], ['authors', 'author'], ['creator', 'author'],
  ['comment', 'comment'], ['comments', 'comment'], ['note', 'comment'], ['notes', 'comment'],
  ['revision', 'revision'], ['revisions', 'revision'], ['tracked change', 'revision'], ['tracked changes', 'revision'], ['track changes', 'revision'],
  ['hidden object', 'hidden-object'], ['hidden objects', 'hidden-object'], ['hidden content', 'hidden-object'],
  ['signature', 'signature'], ['digital signature', 'signature'], ['signed', 'signature'],
  ['printer', 'device-identifier'], ['printer identifier', 'device-identifier'], ['scanner', 'device-identifier'], ['scanner name', 'device-identifier'], ['device identifier', 'device-identifier'],
  ['metadata', 'metadata'], ['document metadata', 'metadata'], ['embedded metadata', 'metadata'],
  ['thumbnail', 'thumbnail'], ['embedded thumbnail', 'thumbnail'], ['embedded thumbnails', 'thumbnail'],
  ['font', 'font'], ['fonts', 'font'], ['embedded font', 'font'], ['embedded fonts', 'font'],
]);

const FINDING_COPY = {
  author: ['Author details', 'This document may include author or creator information.', 'medium'],
  comment: ['Comments or notes', 'This document may include comments or notes that are not visible in the main content.', 'medium'],
  revision: ['Tracked changes', 'This document may include revision history or tracked changes.', 'high'],
  'hidden-object': ['Hidden content', 'This document may include hidden objects or content.', 'high'],
  signature: ['Digital signature', 'This document may include a digital signature.', 'medium'],
  'device-identifier': ['Printer or scanner details', 'This document may identify a printer, scanner, or other device.', 'low'],
  metadata: ['Document metadata', 'This document may include embedded document metadata.', 'medium'],
  thumbnail: ['Embedded thumbnail', 'This document may include a preview thumbnail.', 'low'],
  font: ['Embedded fonts', 'This document may include embedded fonts.', 'low'],
};

const UNAVAILABLE_ACTIONS = new Map([
  ['signature', 'Removing a signature can invalidate the document and needs a dedicated processor.'],
  ['font', 'Removing embedded fonts can change how the document looks and needs a dedicated processor.'],
]);

export function normalizeDocumentFindings(documentType, findings = []) {
  assertDocumentType(documentType);
  const counts = new Map();
  return findings.flatMap((finding) => {
    const category = normalizeCategory(finding?.category ?? finding);
    if (!category) return [];
    const occurrence = (counts.get(category) || 0) + 1;
    counts.set(category, occurrence);
    const [title, detail, severity] = FINDING_COPY[category];
    return [{
      id: `document-${category}-${occurrence}`,
      category,
      action: 'remove',
      documentType,
      title,
      detail,
      severity,
      confidence: 1,
      assessment: 'assessed',
      resolved: false,
    }];
  });
}

export function createDocumentSanitizationPlan(documentType, findings = []) {
  assertDocumentType(documentType);
  const actions = findings
    .filter((finding) => finding?.documentType === documentType && FINDING_COPY[finding.category])
    .map((finding) => {
      const unavailableReason = UNAVAILABLE_ACTIONS.get(finding.category);
      return {
        findingId: finding.id,
        category: finding.category,
        action: finding.action === 'keep' ? 'keep' : 'remove',
        state: unavailableReason ? 'unavailable' : 'supported',
        ...(unavailableReason ? { reason: unavailableReason } : {}),
      };
    });
  return {
    documentType,
    state: 'requires-processor',
    actions,
    output: {
      state: 'unavailable',
      reason: 'A configured document-cleaning processor is required before a clean copy can be produced.',
    },
  };
}

export function createDocumentCleaningJobRequest(file, plan) {
  const documentType = plan?.documentType || documentTypeForFile(file);
  assertDocumentType(documentType);
  return {
    kind: 'document-cleaning',
    mediaKind: 'document',
    documentType,
    fileName: String(file?.name || '').trim() || null,
    mimeType: String(file?.type || '').trim() || null,
    sizeBytes: Number.isSafeInteger(file?.size) && file.size >= 0 ? file.size : null,
    requestedActions: (plan?.actions || [])
      .filter((action) => action.state === 'supported' && action.action === 'remove')
      .map((action) => `remove-${action.category}`),
  };
}

export function createDocumentCleaningReport({ plan, processor } = {}) {
  const configured = processor?.state === 'configured' && processor?.available === true;
  return {
    documentType: plan?.documentType || null,
    state: configured ? 'awaiting-processor' : 'processor-unconfigured',
    cleanDocumentProduced: false,
    message: configured
      ? 'A document-cleaning processor has not returned a clean document yet.'
      : 'A clean document has not been produced. Configure a document-cleaning processor to continue.',
    actions: (plan?.actions || []).map(({ category, action, state }) => ({ category, action, state })),
  };
}

export function documentTypeForFile(file) {
  const name = String(file?.name || '').toLowerCase();
  const type = String(file?.type || '').toLowerCase();
  if (type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (/(wordprocessingml|spreadsheetml|presentationml|msword|ms-excel|ms-powerpoint|opendocument)/.test(type)
    || /\.(docx?|xlsx?|pptx?|odt|ods|odp)$/i.test(name)) return 'office';
  return null;
}

function normalizeCategory(value) { return CATEGORY_ALIASES.get(String(value || '').trim().toLowerCase()) || null; }
function assertDocumentType(documentType) { if (!DOCUMENT_TYPES.has(documentType)) throw new Error('documentType must be pdf or office.'); }
