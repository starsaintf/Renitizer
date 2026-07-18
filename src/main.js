import { scanFileFacts } from './scanners/file-facts.js';
import { scanMetadata } from './scanners/metadata.js';
import { scanBarcodes } from './scanners/barcode.js';
import { scanOcr } from './scanners/ocr.js';
import { requestCloudAnalysis } from './scanners/cloud.js';
import { runScanners } from './scanners/orchestrator.js';
import { sanitizeRasterImage } from './sanitize/image.js';
import { makeReport } from './core/report.js';

const $ = (selector) => document.querySelector(selector);
const ui = Object.fromEntries(['file-input', 'file-summary', 'scan-button', 'deep-scan-button', 'sanitize-button', 'download-button', 'report-button', 'cloud-button', 'cloud-endpoint', 'cloud-consent', 'cloud-status', 'findings', 'score-value', 'score-summary', 'score-rail', 'signals', 'clean-status', 'sanitize-note', 'finding-template'].map((id) => [id, $(`#${id}`)]));
const state = { file: null, cleanFile: null, findings: [], report: null };
const endpointFromQuery = new URLSearchParams(location.search).get('endpoint');
if (endpointFromQuery) ui['cloud-endpoint'].value = endpointFromQuery;

ui['file-input'].addEventListener('change', () => selectFile(ui['file-input'].files[0]));
ui['scan-button'].addEventListener('click', () => localScan());
ui['deep-scan-button'].addEventListener('click', () => deepScan());
ui['sanitize-button'].addEventListener('click', () => cleanImage());
ui['download-button'].addEventListener('click', downloadCleanCopy);
ui['report-button'].addEventListener('click', downloadReport);
ui['cloud-button'].addEventListener('click', cloudScan);
ui['cloud-consent'].addEventListener('change', () => ui['cloud-button'].disabled = !state.file || !ui['cloud-consent'].checked);

function selectFile(file) {
  state.file = file || null;
  state.cleanFile = null;
  state.findings = [];
  state.report = null;
  ui['file-summary'].textContent = file ? `${file.name} · ${file.type || 'unknown type'} · ${formatBytes(file.size)}` : 'No file selected.';
  const isImage = Boolean(file?.type.startsWith('image/'));
  for (const id of ['scan-button', 'deep-scan-button']) ui[id].disabled = !file;
  ui['sanitize-button'].disabled = !isImage;
  ui['download-button'].disabled = true;
  ui['report-button'].disabled = true;
  ui['cloud-button'].disabled = !file || !ui['cloud-consent'].checked;
  ui['clean-status'].textContent = isImage ? 'ready to clean' : 'report-only';
  ui['sanitize-note'].textContent = isImage ? 'Canvas re-encoding removes embedded metadata. It does not erase visible text, faces, or codes.' : 'This media type is report-only locally. Audio and video can be sent only through an explicit cloud request.';
  render();
}

async function localScan() {
  if (!state.file) return;
  busy(ui['scan-button'], 'Scanning…');
  try {
    state.findings = await runScanners(state.file, [scanFileFacts, scanMetadata, scanBarcodes]);
    updateReport();
  } finally { idle(ui['scan-button'], 'Run local scan'); }
}

async function deepScan() {
  if (!state.file) return;
  busy(ui['deep-scan-button'], 'Loading OCR…');
  try {
    state.findings = [...state.findings, ...(await runScanners(state.file, [scanOcr]))];
    updateReport();
  } finally { idle(ui['deep-scan-button'], 'Deep OCR scan'); }
}

async function cleanImage() {
  if (!state.file) return;
  busy(ui['sanitize-button'], 'Re-encoding…');
  try {
    state.cleanFile = await sanitizeRasterImage(state.file);
    state.findings = state.findings.map((finding) => finding.id.startsWith('metadata-') ? { ...finding, resolved: true } : finding);
    ui['clean-status'].textContent = 'clean copy ready';
    ui['sanitize-note'].textContent = 'Canvas clean copy created. Verification re-scans metadata markers in the new file.';
    ui['download-button'].disabled = false;
    const verification = await runScanners(state.cleanFile, [scanMetadata]);
    state.findings = [...state.findings, ...verification.map((finding) => ({ ...finding, id: `verify-${finding.id}`, detail: `After re-encode: ${finding.detail}` }))];
    updateReport();
  } catch (error) { ui['sanitize-note'].textContent = error.message; }
  finally { idle(ui['sanitize-button'], 'Create clean copy'); }
}

async function cloudScan() {
  if (!state.file || !ui['cloud-consent'].checked) return;
  busy(ui['cloud-button'], 'Sending…');
  ui['cloud-status'].textContent = 'Sending selected file to your configured endpoint…';
  try {
    const cloudFiles = state.file.type.startsWith('video/') ? await extractVideoFrames(state.file) : [state.file];
    const cloudFindings = await requestCloudAnalysis({ endpoint: ui['cloud-endpoint'].value.trim(), files: cloudFiles, analyses: ['visual-pii', 'audio-pii', 'video-frame-context'], consent: ui['cloud-consent'].checked });
    state.findings = [...state.findings, ...cloudFindings];
    ui['cloud-status'].textContent = `Cloud analysis returned ${cloudFindings.length} normalized finding(s).`;
    updateReport();
  } catch (error) { ui['cloud-status'].textContent = error.message; }
  finally { idle(ui['cloud-button'], 'Send with consent'); }
}

function updateReport() { state.report = makeReport(state.findings); ui['report-button'].disabled = false; render(); }

function render() {
  ui.findings.replaceChildren();
  if (!state.findings.length) ui.findings.innerHTML = '<p class="empty">Your evidence ledger will appear here after a scan.</p>';
  for (const finding of state.findings) {
    const element = ui['finding-template'].content.firstElementChild.cloneNode(true);
    element.classList.add(finding.severity);
    element.querySelector('strong').textContent = finding.title;
    element.querySelector('p').textContent = finding.detail;
    element.querySelector('small').textContent = `${finding.severity} · ${finding.assessment}${finding.resolved ? ' · resolved in clean copy' : ''}`;
    ui.findings.append(element);
  }
  const report = state.report;
  ui['score-value'].textContent = report ? report.safetyScore : '—';
  ui['score-rail'].style.width = report ? `${report.safetyScore}%` : '0%';
  ui['score-summary'].textContent = report ? `${report.counts.unresolved} unresolved of ${report.counts.total} recorded findings.` : 'Select a file to establish a local baseline.';
  ui.signals.replaceChildren();
  for (const [name, signal] of Object.entries(report?.signals || {})) {
    const cell = document.createElement('div'); cell.className = 'signal'; cell.innerHTML = `${name.replace(/[A-Z]/g, (letter) => ` ${letter}`)}<b>${signal.assessment}</b>`; ui.signals.append(cell);
  }
}

function downloadCleanCopy() { download(state.cleanFile, state.cleanFile.name, state.cleanFile.type); }
function downloadReport() { download(new Blob([JSON.stringify({ generatedAt: new Date().toISOString(), file: state.file?.name, ...state.report, findings: state.findings }, null, 2)], { type: 'application/json' }), `${state.file?.name || 'renitizer'}-privacy-report.json`, 'application/json'); }
function download(blob, name) { const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 0); }
function busy(button, label) { button.disabled = true; button.dataset.label = button.textContent; button.textContent = label; }
function idle(button, label) { button.disabled = false; button.textContent = label; }
function formatBytes(bytes) { return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`; }

async function extractVideoFrames(file) {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.src = url; video.muted = true; video.playsInline = true;
  try {
    await waitFor(video, 'loadeddata');
    if (!video.videoWidth || !video.videoHeight) throw new Error('This browser could not decode video frames. Configure a dedicated cloud video endpoint instead.');
    if (!Number.isFinite(video.duration) || video.duration <= 0) throw new Error('This video has no seekable duration. Configure a dedicated cloud video endpoint instead.');
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    const times = [...new Set([0, video.duration * 0.5, Math.max(0, video.duration - 0.1)].map((time) => Math.min(Math.max(time, 0), Math.max(video.duration - 0.01, 0))))];
    const frames = [];
    for (const [index, time] of times.entries()) {
      if (index > 0) {
        video.currentTime = time;
        await waitFor(video, 'seeked');
      }
      canvas.getContext('2d').drawImage(video, 0, 0);
      const blob = await new Promise((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('This browser could not encode sampled video frames. Configure a dedicated cloud video endpoint instead.')), 'image/jpeg', 0.85));
      frames.push(new File([blob], `${file.name.replace(/\.[^.]+$/, '')}-frame-${frames.length + 1}.jpg`, { type: 'image/jpeg' }));
    }
    return frames;
  } finally { URL.revokeObjectURL(url); }
}

function waitFor(target, event) { return new Promise((resolve, reject) => { target.addEventListener(event, resolve, { once: true }); target.addEventListener('error', () => reject(new Error('Video frame sampling is not supported for this file. Configure a dedicated cloud video endpoint instead.')), { once: true }); }); }

if ('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js').catch(() => {});
render();
