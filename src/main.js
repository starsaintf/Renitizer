import { scanFileFacts } from './scanners/file-facts.js';
import { scanMetadata } from './scanners/metadata.js';
import { scanBarcodes } from './scanners/barcode.js';
import { scanOcr } from './scanners/ocr.js';
import { requestCloudAnalysis } from './scanners/cloud.js';
import { runScanners } from './scanners/orchestrator.js';
import { sanitizeRasterImage } from './sanitize/image.js';
import { makeReport } from './core/report.js';
import { getViewFromHash } from './core/view-state.js';

const $ = (selector) => document.querySelector(selector);
const ui = Object.fromEntries(['home-view', 'app-view', 'file-input', 'file-summary', 'scan-button', 'deep-scan-button', 'sanitize-button', 'download-button', 'report-button', 'cloud-button', 'cloud-endpoint', 'cloud-consent', 'cloud-status', 'findings', 'score-summary', 'clean-status', 'sanitize-note', 'save-copy', 'results-step', 'save-step', 'finding-template'].map((id) => [id, $(`#${id}`)]));
const state = { file: null, cleanFile: null, findings: [], report: null };
const endpointFromQuery = new URLSearchParams(location.search).get('endpoint');
if (endpointFromQuery) ui['cloud-endpoint'].value = endpointFromQuery;

ui['file-input'].addEventListener('change', () => selectFile(ui['file-input'].files[0]));
ui['scan-button'].addEventListener('click', localScan);
ui['deep-scan-button'].addEventListener('click', deepScan);
ui['sanitize-button'].addEventListener('click', cleanImage);
ui['download-button'].addEventListener('click', downloadCleanCopy);
ui['report-button'].addEventListener('click', downloadReport);
ui['cloud-button'].addEventListener('click', cloudScan);
ui['cloud-consent'].addEventListener('change', updateCloudButton);
window.addEventListener('hashchange', renderView);

function renderView() {
  const showingApp = getViewFromHash(location.hash) === 'app';
  ui['home-view'].hidden = showingApp;
  ui['app-view'].hidden = !showingApp;
  if (showingApp) document.title = 'Renitizer · clean your file';
  else document.title = 'Renitizer · clean before you share';
}

function selectFile(file) {
  state.file = file || null;
  state.cleanFile = null;
  state.findings = [];
  state.report = null;
  ui['file-summary'].textContent = file ? `${file.name} · ${formatBytes(file.size)}` : 'No file selected yet.';
  const isImage = Boolean(file?.type.startsWith('image/'));
  ui['scan-button'].disabled = !file;
  ui['deep-scan-button'].disabled = !file;
  ui['sanitize-button'].disabled = !isImage;
  ui['download-button'].disabled = true;
  ui['report-button'].disabled = true;
  updateCloudButton();
  ui['results-step'].hidden = true;
  ui['save-step'].hidden = true;
  ui['clean-status'].textContent = '';
  ui['sanitize-note'].textContent = '';
  ui['save-copy'].textContent = isImage
    ? 'For supported images, we can make a fresh copy without embedded file details. It cannot remove visible text, faces, or codes.'
    : 'This kind of file can be checked, but we cannot make a clean copy for it in this browser. You can still save a check summary in More checks.';
  render();
}

async function localScan() {
  if (!state.file) return;
  busy(ui['scan-button'], 'Checking…');
  try {
    state.findings = await runScanners(state.file, [scanFileFacts, scanMetadata, scanBarcodes]);
    updateReport();
  } finally { idle(ui['scan-button'], 'Check this file'); }
}

async function deepScan() {
  if (!state.file) return;
  busy(ui['deep-scan-button'], 'Checking…');
  try {
    state.findings = [...state.findings, ...(await runScanners(state.file, [scanOcr]))];
    updateReport();
  } finally { idle(ui['deep-scan-button'], 'Look for writing'); }
}

async function cleanImage() {
  if (!state.file) return;
  busy(ui['sanitize-button'], 'Making your copy…');
  try {
    state.cleanFile = await sanitizeRasterImage(state.file);
    state.findings = state.findings.map((finding) => finding.id.startsWith('metadata-') ? { ...finding, resolved: true } : finding);
    ui['clean-status'].textContent = 'Your clean copy is ready.';
    ui['sanitize-note'].textContent = 'Your clean copy is ready. We checked it again for embedded file details.';
    ui['download-button'].disabled = false;
    const verification = await runScanners(state.cleanFile, [scanMetadata]);
    state.findings = [...state.findings, ...verification.map((finding) => ({ ...finding, id: `verify-${finding.id}`, detail: `In the clean copy: ${finding.detail}` }))];
    updateReport();
  } catch (error) {
    ui['sanitize-note'].textContent = 'We could not make a clean copy of this file in this browser. You can still save your check summary.';
  } finally { idle(ui['sanitize-button'], 'Make a clean copy'); }
}

async function cloudScan() {
  if (!state.file || !ui['cloud-consent'].checked) return;
  busy(ui['cloud-button'], 'Sending…');
  ui['cloud-status'].textContent = 'Sending your selected file to the service you chose…';
  try {
    const cloudFiles = state.file.type.startsWith('video/') ? await extractVideoFrames(state.file) : [state.file];
    const cloudFindings = await requestCloudAnalysis({ endpoint: ui['cloud-endpoint'].value.trim(), files: cloudFiles, analyses: ['visual-pii', 'audio-pii', 'video-frame-context'], consent: ui['cloud-consent'].checked });
    state.findings = [...state.findings, ...cloudFindings];
    ui['cloud-status'].textContent = `Your extra check returned ${cloudFindings.length} item${cloudFindings.length === 1 ? '' : 's'}.`;
    updateReport();
  } catch (error) { ui['cloud-status'].textContent = 'That extra check could not finish. Check the service address and try again.'; }
  finally { idle(ui['cloud-button'], 'Send for an extra check'); }
}

function updateCloudButton() { ui['cloud-button'].disabled = !state.file || !ui['cloud-consent'].checked; }
function updateReport() { state.report = makeReport(state.findings); ui['report-button'].disabled = false; ui['results-step'].hidden = false; ui['save-step'].hidden = false; render(); }

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
    ui.findings.append(element);
  }
  const counts = state.report?.counts;
  ui['score-summary'].textContent = counts ? `${counts.unresolved} item${counts.unresolved === 1 ? '' : 's'} may need your attention.` : '';
}

function friendlyFinding(finding) {
  if (finding.id.includes('gps')) return { title: 'Location details found', detail: 'This file may include where it was made.' };
  if (finding.id.includes('metadata') || finding.id.includes('verify-')) return { title: 'File details found', detail: finding.resolved ? 'These details were removed from your clean copy.' : 'This file may include details added by a device or app.' };
  if (finding.id.includes('barcode')) return { title: 'A scannable code was found', detail: 'A code in the image may share information when scanned.' };
  if (finding.id.includes('ocr-email')) return { title: 'An email address was found', detail: 'Writing in this image may include an email address.' };
  if (finding.id.includes('ocr-phone')) return { title: 'A phone number was found', detail: 'Writing in this image may include a phone number.' };
  if (finding.id.includes('ocr-visual-address')) return { title: 'An address may be visible', detail: 'Writing in this image may include part of an address.' };
  if (finding.id.includes('unavailable')) return { title: 'One extra check was not available', detail: 'Your browser could not run every optional check.' };
  if (finding.id === 'file-facts') return { title: 'Your file was checked', detail: 'We looked at the file and the details that can travel with it.' };
  return { title: 'A private detail may need your attention', detail: 'This extra check found something worth reviewing before you share.' };
}

function downloadCleanCopy() { download(state.cleanFile, state.cleanFile.name, state.cleanFile.type); }
function downloadReport() { download(new Blob([JSON.stringify({ generatedAt: new Date().toISOString(), file: state.file?.name, ...state.report, findings: state.findings }, null, 2)], { type: 'application/json' }), `${state.file?.name || 'renitizer'}-privacy-report.json`, 'application/json'); }
function download(blob, name) { const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 0); }
function busy(button, label) { button.disabled = true; button.textContent = label; }
function idle(button, label) { button.disabled = false; button.textContent = label; }
function formatBytes(bytes) { return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`; }

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
