import { withTranscriptTimeRange } from '../sanitize/audio.js';

const requiredFields = ['id', 'category', 'title', 'detail', 'severity', 'confidence'];

export async function requestCloudAnalysis({ endpoint, file, files, analyses, consent }) {
  if (!consent) throw new Error('Cloud analysis requires explicit consent.');
  if (!endpoint) throw new Error('Enter a cloud analysis endpoint before sending a file.');
  const selectedFiles = files || (file ? [file] : []);
  if (!selectedFiles.length) throw new Error('Choose a file before requesting cloud analysis.');

  const form = new FormData();
  for (const selectedFile of selectedFiles) form.append('file', selectedFile, selectedFile.name);
  form.append('analyses', JSON.stringify(analyses));
  const response = await fetch(endpoint, { method: 'POST', body: form, headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Cloud analysis failed (${response.status}).`);
  const payload = await response.json();
  return normalizeCloudFindings(payload.findings);
}

export function normalizeCloudFindings(findings) {
  if (!Array.isArray(findings)) throw new Error('Cloud response did not contain a findings array.');
  return findings.filter((finding) => requiredFields.every((field) => field in finding)).map((finding, index) => withTranscriptTimeRange({
    id: String(finding.id || `cloud-${index + 1}`), category: String(finding.category), title: String(finding.title),
    detail: String(finding.detail), severity: ['low', 'medium', 'high', 'critical'].includes(finding.severity) ? finding.severity : 'medium',
    confidence: Math.max(0, Math.min(1, Number(finding.confidence) || 0)), recommendation: String(finding.recommendation || 'Review before sharing.'),
    assessment: finding.assessment || 'assessed', resolved: Boolean(finding.resolved), source: 'cloud', boundingBox: finding.boundingBox,
  }));
}
