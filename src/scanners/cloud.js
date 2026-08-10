import { withTranscriptTimeRange } from '../sanitize/audio.js';
import { clampNormalizedBox } from '../sanitize/redaction.js';

const requiredFields = ['id', 'category', 'title', 'detail', 'severity', 'confidence'];

export async function requestCloudAnalysis({ endpoint, file, files, analyses, frameContext, consent, session, returnDetails = false, fetcher = fetch }) {
  if (!consent) throw new Error('Cloud analysis requires explicit consent.');
  const selectedFiles = files || (file ? [file] : []);
  if (!selectedFiles.length) throw new Error('Choose a file before requesting cloud analysis.');
  const service = resolveCloudService({ endpoint, session });

  const form = buildCloudAnalysisForm({ files: selectedFiles, analyses, frameContext });
  const response = await fetcher(service.endpoint, { method: 'POST', body: form, headers: service.headers });
  if (!response.ok) throw new Error(`Cloud analysis failed (${response.status}).`);
  const payload = await response.json();
  const findings = normalizeCloudFindings(payload.findings);
  return returnDetails ? { findings, providerChecks: normalizeProviderChecks(payload.providerChecks) } : findings;
}

export function resolveCloudService({ endpoint, session } = {}) {
  const explicitEndpoint = String(endpoint ?? '').trim();
  const trustedSession = validSession(session);
  const target = explicitEndpoint || (trustedSession ? `${trustedSession.endpoint}/api/analyze` : '');
  if (!target) throw new Error('Open Renitizer from Renvoy or enter the address of a service you trust.');

  let parsed;
  try { parsed = new URL(target); }
  catch { throw new Error('Enter a valid secure service address.'); }
  if (parsed.protocol !== 'https:' && !isLoopback(parsed)) throw new Error('Enter a valid secure service address.');

  const authorization = trustedSession && parsed.origin === trustedSession.endpoint
    ? { Authorization: `Renvoy ${trustedSession.capability}` }
    : {};
  return { endpoint: parsed.href, headers: { Accept: 'application/json', ...authorization } };
}

function validSession(session) {
  if (typeof session?.capability !== 'string' || !/^[A-Za-z0-9._-]{16,8192}$/.test(session.capability)) return null;
  try {
    const endpoint = new URL(session.endpoint);
    if (endpoint.protocol !== 'https:') return null;
    return { endpoint: endpoint.origin, capability: session.capability };
  } catch { return null; }
}

function isLoopback(url) {
  return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
}

export function buildCloudAnalysisForm({ files = [], analyses = [], frameContext } = {}) {
  const form = new FormData();
  for (const file of files) form.append('file', file, file.name);
  form.append('analyses', JSON.stringify(analyses));
  if (Array.isArray(frameContext) && frameContext.length === files.length) form.append('frameContext', JSON.stringify(frameContext));
  return form;
}

export function normalizeCloudFindings(findings) {
  if (!Array.isArray(findings)) throw new Error('Cloud response did not contain a findings array.');
  return findings.filter((finding) => requiredFields.every((field) => field in finding)).map((finding, index) => {
    const boundingBox = normalizeCloudBox(finding.boundingBox);
    return withTranscriptTimeRange({
      id: String(finding.id || `cloud-${index + 1}`), category: String(finding.category), title: String(finding.title),
      detail: String(finding.detail), severity: ['low', 'medium', 'high', 'critical'].includes(finding.severity) ? finding.severity : 'medium',
      confidence: Math.max(0, Math.min(1, Number(finding.confidence) || 0)), recommendation: String(finding.recommendation || 'Review before sharing.'),
      assessment: finding.assessment || 'assessed', resolved: Boolean(finding.resolved), source: 'cloud', ...(boundingBox ? { boundingBox } : {}),
    });
  });
}

function normalizeCloudBox(value) {
  const x = Number(value?.x);
  const y = Number(value?.y);
  const width = Number(value?.width);
  const height = Number(value?.height);
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
  const box = clampNormalizedBox({ x, y, width, height });
  return box.width > 0 && box.height > 0 ? box : null;
}

function normalizeProviderChecks(value) {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(['faceLandmarks', 'reverseImage'].flatMap((key) => typeof value[key] === 'boolean' ? [[key, value[key]]] : []));
}
