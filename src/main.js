import { scanFileFacts } from './scanners/file-facts.js';
import { scanMetadata } from './scanners/metadata.js';
import { scanBarcodes } from './scanners/barcode.js';
import { scanOcr } from './scanners/ocr.js';
import { requestCloudAnalysis } from './scanners/cloud.js';
import { runScanners } from './scanners/orchestrator.js';
import { sanitizeRasterImage } from './sanitize/image.js';
import { resolveRedactionPlan, setFindingAction } from './sanitize/redaction.js';
import { getAudioProcessingState, inspectAudioFile, resolveAudioRedactionPlan, sanitizeAudioFile } from './sanitize/audio.js';
import { makeReport } from './core/report.js';
import { createReceipt } from './core/receipt.js';
import { createVerification } from './core/verification.js';
import { getViewFromHash } from './core/view-state.js';
import { decryptCleanCopy, encryptCleanCopy, importRecoveryKey } from './share/crypto.js';
import { createSafeShareReport, getShareState } from './share/policy.js';
import { createDocumentCleaningJobRequest, createDocumentCleaningReport, createDocumentSanitizationPlan, documentTypeForFile } from './documents/policy.js';
import { documentUiCopy } from './documents/presentation.js';
import { requestRenvoySession } from './remote/renvoy-bridge.js';
import { downloadRemoteJob, getRemoteJob, submitRemoteJob } from './remote/jobs.js';

const $ = (selector) => document.querySelector(selector);
const ui = Object.fromEntries(['home-view', 'app-view', 'decrypt-view', 'file-input', 'file-summary', 'scan-button', 'deep-scan-button', 'sanitize-button', 'download-button', 'report-button', 'cloud-button', 'cloud-endpoint', 'cloud-consent', 'cloud-status', 'findings', 'score-summary', 'clean-status', 'sanitize-note', 'save-copy', 'results-step', 'save-step', 'finding-template', 'redaction-editor', 'redaction-preview', 'add-redaction-button', 'apply-all-button', 'audio-advanced', 'audio-range-list', 'audio-range-start', 'audio-range-end', 'audio-range-action', 'add-audio-range-button', 'verification-details', 'verification-checks', 'share-section', 'share-expiry', 'share-detailed-findings', 'share-package-button', 'share-key-button', 'share-report-button', 'share-delivery', 'share-status', 'receipt-section', 'receipt-summary', 'receipt-lists', 'receipt-report-button', 'encrypted-package-input', 'recovery-key-input', 'decrypt-package-button', 'decrypt-status'].map((id) => [id, $(`#${id}`)]));
const state = { file: null, cleanFile: null, findings: [], report: null, receipt: null, receiptReady: false, previewUrl: null, verification: null, availableChecks: new Set(), share: null, documentPlan: null, documentRequest: null, documentReport: null, remoteDocument: null, audio: { duration: null, manualRanges: [], processing: null } };
const endpointFromQuery = new URLSearchParams(location.search).get('endpoint');
if (endpointFromQuery) ui['cloud-endpoint'].value = endpointFromQuery;

ui['file-input'].addEventListener('change', () => { void selectFile(ui['file-input'].files[0]); });
ui['scan-button'].addEventListener('click', localScan);
ui['deep-scan-button'].addEventListener('click', deepScan);
ui['sanitize-button'].addEventListener('click', cleanSelectedFile);
ui['download-button'].addEventListener('click', downloadCleanCopy);
ui['report-button'].addEventListener('click', downloadReport);
ui['cloud-button'].addEventListener('click', cloudScan);
ui['cloud-consent'].addEventListener('change', updateCloudButton);
ui['add-redaction-button'].addEventListener('click', addRedactionBox);
ui['apply-all-button'].addEventListener('click', () => { state.findings = state.findings.map((finding) => finding.boundingBox ? { ...finding, redactionAction: 'blur', resolved: true } : finding); invalidateCleanVerification(); updateReport(); });
ui['add-audio-range-button'].addEventListener('click', addManualAudioRange);
ui['share-expiry'].addEventListener('change', () => { state.share = null; renderShareSection(); });
ui['share-detailed-findings'].addEventListener('change', () => { state.share = null; renderShareSection(); });
ui['share-package-button'].addEventListener('click', createEncryptedPackage);
ui['share-key-button'].addEventListener('click', downloadRecoveryKey);
ui['share-report-button'].addEventListener('click', downloadShareReport);
ui['receipt-report-button'].addEventListener('click', downloadReceipt);
ui['decrypt-package-button'].addEventListener('click', decryptSharedPackage);
window.addEventListener('hashchange', renderView);

function renderView() {
  const view = getViewFromHash(location.hash);
  ui['home-view'].hidden = view !== 'home';
  ui['app-view'].hidden = view !== 'app';
  ui['decrypt-view'].hidden = view !== 'decrypt';
  document.title = view === 'app' ? 'Renitizer · clean your file' : view === 'decrypt' ? 'Renitizer · open a shared file' : 'Renitizer · clean before you share';
}

async function selectFile(file) {
  if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
  state.file = file || null;
  state.cleanFile = null;
  state.findings = [];
  state.report = null;
  state.receipt = null;
  state.receiptReady = false;
  state.verification = null;
  state.share = null;
  state.availableChecks = new Set();
  state.documentPlan = null;
  state.documentRequest = null;
  state.documentReport = null;
  state.remoteDocument = null;
  state.audio = { duration: null, manualRanges: [], processing: null };
  ui['file-summary'].textContent = file ? `${file.name} · ${formatBytes(file.size)}` : 'No file selected yet.';
  const isImage = Boolean(file?.type.startsWith('image/'));
  const isAudio = Boolean(file?.type.startsWith('audio/'));
  const documentType = documentTypeForFile(file);
  const isDocument = Boolean(documentType);
  if (isDocument) {
    state.documentPlan = createDocumentSanitizationPlan(documentType);
    state.documentRequest = createDocumentCleaningJobRequest(file, state.documentPlan);
    state.documentReport = createDocumentCleaningReport({ plan: state.documentPlan, processor: { state: 'unconfigured', available: false } });
  }
  ui['scan-button'].disabled = !file;
  ui['deep-scan-button'].disabled = !file;
  ui['sanitize-button'].disabled = !isImage && !isDocument && !isAudio;
  ui['sanitize-button'].textContent = isDocument ? documentUiCopy(documentType).actionLabel : isAudio ? 'Remove private audio' : 'Make a clean copy';
  ui['download-button'].disabled = true;
  ui['report-button'].disabled = true;
  updateCloudButton();
  ui['results-step'].hidden = true;
  ui['save-step'].hidden = true;
  ui['share-section'].hidden = true;
  ui['receipt-section'].hidden = true;
  ui['clean-status'].textContent = '';
  ui['sanitize-note'].textContent = '';
  ui['save-copy'].textContent = isDocument
    ? documentUiCopy(documentType).saveCopy
    : isAudio
    ? 'Choose the spoken parts to mute or bleep. We will only say a clean copy exists after its WAV file is created.'
    : isImage
    ? 'For supported images, make a metadata-free copy and choose which marked areas to blur or cover.'
    : 'This kind of file can be checked, but we cannot make a clean copy for it in this browser. You can still save a check summary in More checks.';
  render();
  if (isAudio) {
    const selectedFile = file;
    const processing = getAudioProcessingState(file);
    state.audio.processing = processing;
    ui['sanitize-button'].disabled = !processing.available;
    ui['sanitize-note'].textContent = processing.message;
    renderAudioAdvanced();
    if (processing.available) {
      try {
        const inspected = await inspectAudioFile(file);
        if (state.file !== selectedFile) return;
        state.audio = { ...state.audio, ...inspected };
        renderAudioAdvanced();
      } catch (error) {
        if (state.file !== selectedFile) return;
        state.audio.processing = { state: 'unavailable', available: false, message: 'This audio file could not be decoded in this browser. You can still save its check summary.' };
        ui['sanitize-button'].disabled = true;
        ui['sanitize-note'].textContent = state.audio.processing.message;
      }
    }
  }
}

async function localScan() {
  if (!state.file) return;
  busy(ui['scan-button'], 'Checking…');
  try {
    if (documentTypeForFile(state.file)) {
      state.findings = [{ id: 'document-processor-unavailable', category: 'capability', title: 'Document check needs a processor', detail: 'This browser cannot inspect or clean the inside of this document without a configured document-cleaning processor.', severity: 'low', confidence: 1, assessment: 'unavailable', resolved: false }];
      state.availableChecks = new Set();
    } else {
      state.findings = await runScanners(state.file, [scanFileFacts, scanMetadata, scanBarcodes]);
      state.availableChecks = new Set(['metadata', 'barcodes']);
    }
    invalidateCleanVerification();
    state.receiptReady = Boolean(state.file?.type.startsWith('video/'));
    updateReport();
  } finally { idle(ui['scan-button'], 'Check this file'); }
}

async function deepScan() {
  if (!state.file) return;
  busy(ui['deep-scan-button'], 'Checking…');
  try {
    state.findings = [...state.findings, ...(await runScanners(state.file, [scanOcr]))];
    state.availableChecks.add('visibleText');
    invalidateCleanVerification();
    updateReport();
  } finally { idle(ui['deep-scan-button'], 'Look for writing'); }
}

async function cleanSelectedFile() {
  if (documentTypeForFile(state.file)) return prepareDocumentCleaningRequest();
  if (state.file?.type.startsWith('audio/')) return cleanAudio();
  return cleanImage();
}

async function cleanAudio() {
  if (!state.file || !state.audio.processing?.available || !state.audio.duration) return;
  const plan = resolveAudioRedactionPlan({ findings: state.findings, manualRanges: state.audio.manualRanges, duration: state.audio.duration });
  if (!plan.length) { ui['sanitize-note'].textContent = 'Choose at least one time range to mute or bleep before making a clean copy.'; return; }
  busy(ui['sanitize-button'], 'Removing private audio…');
  try {
    const cleanBlob = await sanitizeAudioFile(state.file, plan);
    if (!(cleanBlob instanceof Blob) || !cleanBlob.size) throw new Error('No clean audio file was produced.');
    state.cleanFile = new File([cleanBlob], `${state.file.name.replace(/\.[^.]+$/, '')}-clean.wav`, { type: 'audio/wav' });
    const selected = new Set(plan.map((item) => item.id));
    const manualFindings = state.audio.manualRanges.map((range) => ({ id: range.id, category: 'audio-redaction', title: 'Manual audio redaction', detail: 'A manually selected audio range.', severity: 'medium', confidence: 1, assessment: 'assessed', timeRange: { start: range.start, end: range.end }, redactionAction: range.action, resolved: selected.has(range.id) }));
    state.findings = [...state.findings.map((finding) => selected.has(finding.id) ? { ...finding, resolved: true } : finding), ...manualFindings];
    state.share = null;
    state.verification = null;
    ui['clean-status'].textContent = `Clean WAV copy created with ${plan.length} selected range${plan.length === 1 ? '' : 's'}.`;
    ui['sanitize-note'].textContent = 'Your WAV clean copy is ready to save. Review it before sharing.';
    ui['download-button'].disabled = false;
    state.receiptReady = true;
    updateReport();
  } catch (error) {
    state.cleanFile = null;
    ui['download-button'].disabled = true;
    ui['sanitize-note'].textContent = 'We could not create a clean WAV copy in this browser. Your original audio was not changed.';
  } finally { idle(ui['sanitize-button'], 'Remove private audio'); }
}

async function cleanImage() {
  if (!state.file) return;
  busy(ui['sanitize-button'], 'Making your copy…');
  try {
    const beforeFindings = state.findings;
    const redactionPlan = resolveRedactionPlan(beforeFindings);
    state.cleanFile = await sanitizeRasterImage(state.file, redactionPlan);
    state.share = null;
    state.findings = state.findings.map((finding) => finding.id.startsWith('metadata-') ? { ...finding, resolved: true } : finding);
    const postClean = await rerunCleanScanners(state.cleanFile, state.availableChecks);
    state.verification = createVerification({ beforeFindings, afterFindings: postClean.findings, assessedChecks: postClean.assessedChecks, redactionPlan });
    ui['clean-status'].textContent = state.verification.readiness.label;
    ui['sanitize-note'].textContent = state.verification.readiness.label;
    ui['download-button'].disabled = false;
    state.receiptReady = true;
    updateReport();
  } catch (error) {
    ui['sanitize-note'].textContent = 'We could not make a clean copy of this file in this browser. You can still save your check summary.';
  } finally { idle(ui['sanitize-button'], 'Make a clean copy'); }
}

async function prepareDocumentCleaningRequest() {
  if (!state.file || !state.documentPlan) return;
  const copy = documentUiCopy(state.documentPlan.documentType);
  busy(ui['sanitize-button'], 'Starting private clean…');
  try {
    state.documentRequest = createDocumentCleaningJobRequest(state.file, state.documentPlan);
    const session = await requestRenvoySession();
    if (!session.available) {
      state.documentReport = createDocumentCleaningReport({ plan: state.documentPlan, processor: { state: 'unconfigured', available: false } });
      ui['clean-status'].textContent = 'Open Renitizer from Renvoy to make a private document clean copy.';
      ui['sanitize-note'].textContent = 'This browser can prepare the check. Renvoy safely connects it to your private cleaner.';
      state.receiptReady = true;
      updateReport();
      return;
    }
    const queued = await submitRemoteJob({ session, file: state.file, metadata: state.documentRequest });
    state.documentReport = createDocumentCleaningReport({ plan: state.documentPlan, processor: { state: 'configured', available: true } });
    state.cleanFile = null;
    state.verification = null;
    ui['download-button'].disabled = true;
    ui['clean-status'].textContent = 'Your private clean copy is being prepared.';
    ui['sanitize-note'].textContent = `Renvoy has started cleaning this ${copy.fileLabel.toLowerCase()}. You can come back to save it when it is ready.`;
    state.documentRequest = { ...state.documentRequest, remoteJobId: queued.job?.id ?? null };
    state.remoteDocument = { session, jobId: queued.job?.id ?? null };
    if (state.remoteDocument.jobId) setTimeout(() => { void refreshRemoteDocument(); }, 1500);
    state.receiptReady = true;
    updateReport();
  } catch {
    ui['clean-status'].textContent = 'We could not start the private document clean. Your original was not changed.';
    ui['sanitize-note'].textContent = 'Try again from Renvoy when your private connection is available.';
  } finally { idle(ui['sanitize-button'], copy.actionLabel); }
}

async function refreshRemoteDocument() {
  if (!state.remoteDocument?.jobId) return;
  try {
    const status = await getRemoteJob(state.remoteDocument);
    if (status.job?.state === 'complete') {
      ui['clean-status'].textContent = 'Your private clean copy is ready to save.';
      ui['sanitize-note'].textContent = 'Your clean document is ready in Renvoy.';
      state.remoteDocument = { ...state.remoteDocument, ready: true, documentType: state.documentPlan?.documentType };
      ui['download-button'].disabled = false;
    } else if (status.job?.state === 'failed') {
      ui['clean-status'].textContent = 'The private document clean could not finish. Your original was not changed.';
    } else setTimeout(() => { void refreshRemoteDocument(); }, 2500);
  } catch { ui['clean-status'].textContent = 'We could not check the private clean yet. It may still be working.'; }
}

async function cloudScan() {
  if (!state.file || !ui['cloud-consent'].checked) return;
  busy(ui['cloud-button'], 'Sending…');
  ui['cloud-status'].textContent = 'Sending your selected file to the service you chose…';
  try {
    const cloudFiles = state.file.type.startsWith('video/') ? await extractVideoFrames(state.file) : [state.file];
    const cloudFindings = await requestCloudAnalysis({ endpoint: ui['cloud-endpoint'].value.trim(), files: cloudFiles, analyses: ['visual-pii', 'audio-pii', 'video-frame-context'], consent: ui['cloud-consent'].checked });
    state.findings = [...state.findings, ...cloudFindings];
    invalidateCleanVerification();
    state.receiptReady = Boolean(state.file?.type.startsWith('video/'));
    ui['cloud-status'].textContent = `Your extra check returned ${cloudFindings.length} item${cloudFindings.length === 1 ? '' : 's'}.`;
    updateReport();
  } catch (error) { ui['cloud-status'].textContent = 'That extra check could not finish. Check the service address and try again.'; }
  finally { idle(ui['cloud-button'], 'Send for an extra check'); }
}

function updateCloudButton() { ui['cloud-button'].disabled = !state.file || !ui['cloud-consent'].checked; }
function updateReport() { state.report = { ...makeReport(state.findings), verification: state.verification, ...(state.documentReport ? { documentCleaning: state.documentReport } : {}) }; state.receipt = state.receiptReady ? createReceipt({ findings: state.findings, report: state.report, verification: state.verification, documentCleaning: state.documentReport }) : null; ui['report-button'].disabled = false; ui['results-step'].hidden = false; ui['save-step'].hidden = false; render(); renderReceipt(); renderRedactionPreview(); renderShareSection(); }

function render() {
  ui.findings.replaceChildren();
  if (!state.findings.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'Nothing needs your attention from this check.';
    ui.findings.append(empty);
  }
  for (const finding of state.findings) {
    const element = ui['finding-template'].content.firstElementChild.cloneNode(true);
    const friendly = friendlyFinding(finding);
    element.classList.add(finding.severity);
    element.querySelector('strong').textContent = friendly.title;
    element.querySelector('p').textContent = friendly.detail;
    element.querySelector('small').textContent = `${finding.resolved ? 'addressed in clean copy' : 'may need your attention'}`;
    if (finding.boundingBox) {
      const controls = document.createElement('div');
      controls.className = 'finding-actions';
      for (const action of ['blur', 'cover', 'keep']) {
        const button = document.createElement('button');
        button.className = 'text-button'; button.type = 'button'; button.textContent = action;
        button.addEventListener('click', () => { state.findings = setFindingAction(state.findings, finding.id, action); invalidateCleanVerification(); updateReport(); });
        controls.append(button);
      }
      element.querySelector('div').append(controls);
    }
    ui.findings.append(element);
  }
  const counts = state.report?.counts;
  ui['score-summary'].textContent = state.verification
    ? `${state.verification.readiness.label} · Safety score ${state.verification.safetyScore}/100.`
    : counts ? `${counts.unresolved} item${counts.unresolved === 1 ? '' : 's'} may need your attention.` : '';
  renderVerification();
}

function renderVerification() {
  ui['verification-details'].hidden = !state.verification;
  ui['verification-checks'].replaceChildren();
  if (!state.verification) return;
  for (const [check, result] of Object.entries(state.verification.checks)) {
    const item = document.createElement('p');
    item.textContent = `${friendlyCheckName(check)}: ${result.status.replace('-', ' ')} — ${result.reason}`;
    ui['verification-checks'].append(item);
  }
}

function renderReceipt() {
  ui['receipt-section'].hidden = !state.receipt;
  if (!state.receipt) return;
  ui['receipt-summary'].textContent = state.receipt.summary;
  ui['receipt-lists'].replaceChildren();
  for (const [title, items] of [['Found', state.receipt.found], ['Changed', state.receipt.changed], ['Kept', state.receipt.kept], ['Not checked', state.receipt.notChecked]]) {
    const section = document.createElement('section');
    const heading = document.createElement('h4');
    heading.textContent = title;
    const list = document.createElement('ul');
    if (items.length) for (const item of items) { const entry = document.createElement('li'); entry.textContent = item; list.append(entry); }
    else { const entry = document.createElement('li'); entry.textContent = 'None'; list.append(entry); }
    section.append(heading, list);
    ui['receipt-lists'].append(section);
  }
}

function friendlyCheckName(check) {
  return ({ metadata: 'Metadata', visibleText: 'Visible text', barcodes: 'Barcodes', visualRedactions: 'Visual redactions', cloud: 'Cloud assessment', faceLandmarks: 'Face and landmarks', reverseImage: 'Reverse-image / OSINT' })[check] || check;
}

function invalidateCleanVerification() {
  state.cleanFile = null;
  state.verification = null;
  state.share = null;
  state.receipt = null;
  state.receiptReady = false;
  ui['download-button'].disabled = true;
  ui['clean-status'].textContent = '';
  ui['sanitize-note'].textContent = '';
  renderShareSection();
}

function renderRedactionPreview() {
  const isImage = state.file?.type.startsWith('image/');
  ui['redaction-editor'].hidden = !isImage;
  if (!isImage) return;
  if (!state.previewUrl) state.previewUrl = URL.createObjectURL(state.file);
  ui['redaction-preview'].replaceChildren();
  const image = document.createElement('img');
  image.src = state.previewUrl; image.alt = 'Selected image with editable redaction boxes';
  ui['redaction-preview'].append(image);
  for (const finding of state.findings.filter((item) => item.boundingBox)) renderRedactionBox(finding);
}

function addRedactionBox() {
  const id = `manual-redaction-${Date.now()}`;
  state.findings = [...state.findings, { id, category: 'identity', title: 'Manual redaction area', detail: 'An area you marked for review.', severity: 'medium', confidence: 1, assessment: 'assessed', resolved: true, redactionAction: 'blur', boundingBox: { x: 0.35, y: 0.35, width: 0.3, height: 0.18 } }];
  invalidateCleanVerification();
  updateReport();
}

function renderRedactionBox(finding) {
  const box = document.createElement('div');
  box.className = 'redaction-box'; box.dataset.id = finding.id; box.dataset.action = finding.redactionAction || 'keep';
  positionBox(box, finding.boundingBox);
  const label = document.createElement('label');
  const select = document.createElement('select');
  for (const action of ['blur', 'cover', 'keep']) { const option = new Option(action, action, false, finding.redactionAction === action); select.add(option); }
  select.addEventListener('change', () => { state.findings = setFindingAction(state.findings, finding.id, select.value); invalidateCleanVerification(); updateReport(); });
  label.append(select); box.append(label);
  const handle = document.createElement('span'); handle.className = 'redaction-handle'; box.append(handle);
  box.addEventListener('pointerdown', (event) => editRedactionBox(event, finding.id, handle.contains(event.target)));
  ui['redaction-preview'].append(box);
}

function positionBox(element, box) { Object.assign(element.style, { left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.width * 100}%`, height: `${box.height * 100}%` }); }

function editRedactionBox(event, id, resizing) {
  if (event.target.closest('select')) return;
  const target = event.currentTarget; const start = { x: event.clientX, y: event.clientY, box: state.findings.find((finding) => finding.id === id).boundingBox };
  target.setPointerCapture(event.pointerId);
  const move = (moveEvent) => {
    const rect = ui['redaction-preview'].getBoundingClientRect(); const dx = (moveEvent.clientX - start.x) / rect.width; const dy = (moveEvent.clientY - start.y) / rect.height;
    const box = resizing ? { ...start.box, width: Math.max(.03, start.box.width + dx), height: Math.max(.03, start.box.height + dy) } : { ...start.box, x: Math.max(0, Math.min(1 - start.box.width, start.box.x + dx)), y: Math.max(0, Math.min(1 - start.box.height, start.box.y + dy)) };
    state.findings = state.findings.map((finding) => finding.id === id ? { ...finding, boundingBox: box } : finding); positionBox(target, box);
  };
  target.addEventListener('pointermove', move);
  target.addEventListener('pointerup', () => { target.removeEventListener('pointermove', move); invalidateCleanVerification(); updateReport(); }, { once: true });
}

function friendlyFinding(finding) {
  if (finding.id.includes('gps')) return { title: 'Location details found', detail: 'This file may include where it was made.' };
  if (finding.id.includes('metadata') || finding.id.includes('verify-')) return { title: 'File details found', detail: finding.resolved ? 'These details were removed from your clean copy.' : 'This file may include details added by a device or app.' };
  if (finding.id.includes('barcode')) return { title: 'A scannable code was found', detail: 'A code in the image may share information when scanned.' };
  if (finding.id.includes('ocr-email')) return { title: 'An email address was found', detail: 'Writing in this image may include an email address.' };
  if (finding.id.includes('ocr-phone')) return { title: 'A phone number was found', detail: 'Writing in this image may include a phone number.' };
  if (finding.id.includes('ocr-visual-address')) return { title: 'An address may be visible', detail: 'Writing in this image may include part of an address.' };
  if (finding.id === 'document-processor-unavailable') return { title: 'Document check needs a processor', detail: 'This browser cannot inspect or clean the inside of this document without a configured processor.' };
  if (finding.id.includes('unavailable')) return { title: 'One extra check was not available', detail: 'Your browser could not run every optional check.' };
  if (finding.id === 'file-facts') return { title: 'Your file was checked', detail: 'We looked at the file and the details that can travel with it.' };
  return { title: 'A private detail may need your attention', detail: 'This extra check found something worth reviewing before you share.' };
}

async function downloadCleanCopy() {
  if (state.remoteDocument?.ready) {
    try {
      const blob = await downloadRemoteJob(state.remoteDocument);
      download(blob, state.remoteDocument.documentType === 'pdf' ? 'renitized-document.pdf' : 'renitized-document.office', blob.type);
    } catch { ui['sanitize-note'].textContent = 'We could not save the private clean copy. Please try again.'; }
    return;
  }
  if (state.cleanFile) download(state.cleanFile, state.cleanFile.name, state.cleanFile.type);
}
function downloadReport() { downloadPrivacyReport({ includeDetailedFindings: false }); }
function downloadReceipt() { if (state.receipt) download(new Blob([JSON.stringify(state.receipt, null, 2)], { type: 'application/json' }), 'renitizer-cleaning-receipt.json', 'application/json'); }
function renderShareSection() {
  const shareState = getShareState({ hasCleanCopy: Boolean(state.cleanFile), expiry: ui['share-expiry'].value });
  ui['share-section'].hidden = !state.cleanFile;
  ui['share-package-button'].disabled = !shareState.available;
  ui['share-key-button'].disabled = !state.share;
  ui['share-report-button'].disabled = !shareState.available;
  ui['share-delivery'].textContent = shareState.message;
  if (!state.share) ui['share-status'].textContent = '';
}
function makeShareReport(shareState) {
  return createSafeShareReport({
    report: state.report,
    verification: state.verification,
    findings: state.findings,
    expiresAt: shareState?.expiresAt || null,
    includeDetailedFindings: ui['share-detailed-findings'].checked,
  });
}
async function createEncryptedPackage() {
  const shareState = getShareState({ hasCleanCopy: Boolean(state.cleanFile), expiry: ui['share-expiry'].value });
  if (!shareState.available) { ui['share-status'].textContent = shareState.message; return; }
  busy(ui['share-package-button'], 'Encrypting…');
  try {
    state.share = await encryptCleanCopy(state.cleanFile, { expiresAt: shareState.expiresAt, report: makeShareReport(shareState) });
    download(new Blob([JSON.stringify(state.share.envelope, null, 2)], { type: 'application/json' }), 'renitizer-encrypted-package.json', 'application/json');
    ui['share-status'].textContent = 'Encrypted package downloaded. Save the recovery key separately; it is not inside the package.';
  } catch (error) {
    ui['share-status'].textContent = 'This browser could not create an encrypted package.';
  } finally {
    idle(ui['share-package-button'], 'Create & download encrypted package');
    renderShareSection();
  }
}
function downloadRecoveryKey() {
  if (!state.share) return;
  download(new Blob([JSON.stringify({ format: 'renitizer-recovery-key-v1', algorithm: 'AES-256-GCM', expiresAt: state.share.envelope.expiresAt, recoveryKey: state.share.recoveryKey }, null, 2)], { type: 'application/json' }), 'renitizer-recovery-key.json', 'application/json');
  ui['share-status'].textContent = 'Recovery key downloaded. Keep it separate from the encrypted package.';
}
function downloadShareReport() {
  const shareState = getShareState({ hasCleanCopy: Boolean(state.cleanFile), expiry: ui['share-expiry'].value });
  if (!shareState.available) return;
  downloadPrivacyReport({ expiresAt: shareState.expiresAt, includeDetailedFindings: ui['share-detailed-findings'].checked });
}
function downloadPrivacyReport({ expiresAt = null, includeDetailedFindings = false } = {}) {
  const report = createSafeShareReport({ report: state.report, verification: state.verification, findings: state.findings, expiresAt, includeDetailedFindings });
  download(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }), 'renitizer-privacy-report.json', 'application/json');
}
function download(blob, name) { const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 0); }
async function decryptSharedPackage() {
  const packageFile = ui['encrypted-package-input'].files[0];
  const keyFile = ui['recovery-key-input'].files[0];
  if (!packageFile || !keyFile) { ui['decrypt-status'].textContent = 'Choose both the encrypted package and its recovery key.'; return; }
  busy(ui['decrypt-package-button'], 'Opening…');
  try {
    const [envelope, recoveryFile] = await Promise.all([readJsonFile(packageFile), readJsonFile(keyFile)]);
    const key = await importRecoveryKey(recoveryFile);
    const clearBytes = await decryptCleanCopy(envelope, key);
    const name = safeDownloadName(envelope.fileName);
    download(new Blob([clearBytes], { type: envelope.mimeType || 'application/octet-stream' }), name, envelope.mimeType || 'application/octet-stream');
    ui['decrypt-status'].textContent = 'Your clean file is ready to save. Neither file was sent anywhere.';
  } catch (error) {
    ui['decrypt-status'].textContent = 'We could not open this package. Check that the package and recovery key belong together, then try again.';
  } finally { idle(ui['decrypt-package-button'], 'Open & save clean file'); }
}
async function readJsonFile(file) { return JSON.parse(await file.text()); }
function safeDownloadName(value) { const name = String(value || 'renitizer-clean-copy').replace(/[\\/:*?"<>|]/g, '-').trim(); return name || 'renitizer-clean-copy'; }
function busy(button, label) { button.disabled = true; button.textContent = label; }
function idle(button, label) { button.disabled = false; button.textContent = label; }
function formatBytes(bytes) { return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`; }

async function rerunCleanScanners(file, availableChecks) {
  const scanners = { metadata: scanMetadata, barcodes: scanBarcodes, visibleText: scanOcr };
  const assessedChecks = [...availableChecks].filter((check) => check in scanners);
  const findings = (await Promise.all(assessedChecks.map(async (check) => {
    const results = await runScanners(file, [scanners[check]]);
    return results.map((finding) => ({
      ...finding,
      id: `verify-${check}-${finding.id}`,
      verificationCheck: check,
      detail: `In the clean copy: ${finding.detail}`,
    }));
  }))).flat();
  return { findings, assessedChecks };
}

async function extractVideoFrames(file) {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.src = url; video.muted = true; video.playsInline = true;
  try {
    await waitFor(video, 'loadeddata');
    if (!video.videoWidth || !video.videoHeight) throw new Error('Video unavailable');
    if (!Number.isFinite(video.duration) || video.duration <= 0) throw new Error('Video unavailable');
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    const times = [...new Set([0, video.duration * 0.5, Math.max(0, video.duration - 0.1)].map((time) => Math.min(Math.max(time, 0), Math.max(video.duration - 0.01, 0))))];
    const frames = [];
    for (const [index, time] of times.entries()) {
      if (index > 0) { video.currentTime = time; await waitFor(video, 'seeked'); }
      canvas.getContext('2d').drawImage(video, 0, 0);
      const blob = await new Promise((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Video unavailable')), 'image/jpeg', 0.85));
      frames.push(new File([blob], `${file.name.replace(/\.[^.]+$/, '')}-frame-${frames.length + 1}.jpg`, { type: 'image/jpeg' }));
    }
    return frames;
  } finally { URL.revokeObjectURL(url); }
}

function waitFor(target, event) { return new Promise((resolve, reject) => { target.addEventListener(event, resolve, { once: true }); target.addEventListener('error', () => reject(new Error('Video unavailable')), { once: true }); }); }

if ('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js').catch(() => {});
renderView();
render();
