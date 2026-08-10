const DOCUMENT_TYPES = new Set(['pdf', 'office']);
const MODERN_OFFICE_EXTENSIONS = new Set(['docx', 'docm', 'dotx', 'dotm', 'xlsx', 'xlsm', 'xltx', 'xltm', 'pptx', 'pptm', 'potx', 'potm', 'ppsx', 'ppsm']);
const MODERN_OFFICE_CLEANUP_CATEGORIES = ['metadata', 'comment', 'revision', 'hidden-object', 'signature', 'thumbnail', 'font'];
const FIXED_CLEANUP_CATEGORIES = {
  pdf: ['metadata', 'comment', 'signature', 'thumbnail'],
  office: ['metadata', 'comment', 'revision', 'hidden-object', 'signature', 'thumbnail'],
};
const DOCUMENT_MIME_TYPES = new Map([
  ['pdf', 'application/pdf'],
  ['doc', 'application/msword'], ['dot', 'application/msword'],
  ['docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ['docm', 'application/vnd.ms-word.document.macroenabled.12'],
  ['dotx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.template'],
  ['dotm', 'application/vnd.ms-word.template.macroenabled.12'],
  ['xls', 'application/vnd.ms-excel'],
  ['xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  ['xlsm', 'application/vnd.ms-excel.sheet.macroenabled.12'],
  ['xlt', 'application/vnd.ms-excel'],
  ['xltx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.template'],
  ['xltm', 'application/vnd.ms-excel.template.macroenabled.12'],
  ['ppt', 'application/vnd.ms-powerpoint'],
  ['pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  ['pptm', 'application/vnd.ms-powerpoint.presentation.macroenabled.12'],
  ['pot', 'application/vnd.ms-powerpoint'],
  ['potx', 'application/vnd.openxmlformats-officedocument.presentationml.template'],
  ['potm', 'application/vnd.ms-powerpoint.template.macroenabled.12'],
  ['pps', 'application/vnd.ms-powerpoint'],
  ['ppsx', 'application/vnd.openxmlformats-officedocument.presentationml.slideshow'],
  ['ppsm', 'application/vnd.ms-powerpoint.slideshow.macroenabled.12'],
  ['odt', 'application/vnd.oasis.opendocument.text'],
  ['ods', 'application/vnd.oasis.opendocument.spreadsheet'],
  ['odp', 'application/vnd.oasis.opendocument.presentation'],
  ['rtf', 'application/rtf'],
]);
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

export function createDocumentSanitizationPlan(documentType, findings = [], context = {}) {
  assertDocumentType(documentType);
  const sourceExtension = normalizeSourceExtension(context?.sourceExtension);
  const selectable = documentType === 'office' && MODERN_OFFICE_EXTENSIONS.has(sourceExtension);
  const detectedActions = findings
    .filter((finding) => finding?.documentType === documentType && FINDING_COPY[finding.category])
    .map((finding) => {
      const unavailableReason = unavailableReasonFor(finding.category, selectable);
      return {
        findingId: finding.id,
        category: finding.category,
        action: finding.action === 'keep' ? 'keep' : 'remove',
        state: unavailableReason ? 'unavailable' : 'supported',
        ...(unavailableReason ? { reason: unavailableReason } : {}),
      };
    });
  const defaultCategories = selectable ? MODERN_OFFICE_CLEANUP_CATEGORIES : FIXED_CLEANUP_CATEGORIES[documentType];
  const actions = detectedActions.length
    ? detectedActions
    : defaultCategories.map((category) => ({
      findingId: `document-plan-${category}`,
      category,
      action: 'remove',
      state: selectable ? 'supported' : 'fixed',
    }));
  return {
    documentType,
    mode: selectable ? 'selectable' : 'fixed',
    sourceExtension: sourceExtension || null,
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
    mimeType: declaredDocumentMimeType(file),
    sizeBytes: Number.isSafeInteger(file?.size) && file.size >= 0 ? file.size : null,
    documentSelection: plan?.mode === 'selectable' ? 'explicit' : 'fixed',
    requestedActions: (plan?.actions || [])
      .filter((action) => action.state === 'supported' && action.action === 'remove')
      .map((action) => `remove-${action.category}`),
  };
}

export function setDocumentPlanAction(plan, category, action) {
  if (plan?.mode !== 'selectable') throw new Error('This document format uses one fixed privacy-cleaning step.');
  if (!['remove', 'keep'].includes(action)) throw new Error('Document choices must be remove or keep.');
  if (!plan.actions?.some((item) => item.category === category && item.state === 'supported')) throw new Error('That document choice is unavailable.');
  return {
    ...plan,
    actions: plan.actions.map((item) => item.category === category ? { ...item, action } : item),
  };
}

export function createDocumentCleaningReport({ plan, processor, output } = {}) {
  const configured = processor?.state === 'configured' && processor?.available === true;
  const complete = output?.state === 'complete';
  const knownCategories = new Set((plan?.actions || []).map((action) => action.category));
  const removedCategories = [...new Set((output?.removedCategories || []).filter((category) => knownCategories.has(category)))];
  return {
    documentType: plan?.documentType || null,
    state: complete ? 'complete' : configured ? 'awaiting-processor' : 'processor-unconfigured',
    cleanDocumentProduced: complete,
    message: complete
      ? 'A private clean document has been produced.'
      : configured
        ? 'A document-cleaning processor has not returned a clean document yet.'
        : 'A clean document has not been produced. Configure a document-cleaning processor to continue.',
    actions: (plan?.actions || []).map(({ category, action, state }) => ({ category, action, state })),
    ...(complete ? { removedCategories } : {}),
  };
}

export function documentTypeForFile(file) {
  const name = String(file?.name || '').toLowerCase();
  const type = String(file?.type || '').toLowerCase();
  if (type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (/(wordprocessingml|spreadsheetml|presentationml|msword|ms-excel|ms-powerpoint|opendocument|rtf)/.test(type)
    || /\.(?:docx?|docm|dotx?|dotm|xlsx?|xlsm|xltx?|xltm|pptx?|pptm|potx?|potm|ppsx?|ppsm|odt|ods|odp|rtf)$/i.test(name)) return 'office';
  return null;
}

function declaredDocumentMimeType(file) {
  const browserMime = String(file?.type || '').trim().toLowerCase();
  if (browserMime && browserMime !== 'application/octet-stream') return browserMime;
  const extension = /\.([a-z0-9]{1,12})$/i.exec(String(file?.name || ''))?.[1]?.toLowerCase();
  return DOCUMENT_MIME_TYPES.get(extension) || null;
}

function normalizeCategory(value) { return CATEGORY_ALIASES.get(String(value || '').trim().toLowerCase()) || null; }
function normalizeSourceExtension(value) { return String(value || '').trim().replace(/^\./, '').toLowerCase(); }
function unavailableReasonFor(category, selectable) { return category === 'font' && !selectable ? UNAVAILABLE_ACTIONS.get(category) : null; }
function assertDocumentType(documentType) { if (!DOCUMENT_TYPES.has(documentType)) throw new Error('documentType must be pdf or office.'); }
