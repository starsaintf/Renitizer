import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
// This runner executes inside the Linux document container, even when its
// contract tests run from a Windows checkout.
import { basename, dirname, extname, join } from 'node:path/posix';
import { buildPdfSanitizeCommand, normalizeDocumentType } from './contract.mjs';

const defaultOfficeScript = fileURLToPath(new URL('./office.py', import.meta.url));
const OOXML_EXTENSIONS = new Set(['docx', 'docm', 'dotx', 'dotm', 'xlsx', 'xlsm', 'xltx', 'xltm', 'pptx', 'pptm', 'potx', 'potm', 'ppsx', 'ppsm']);
const LIBREOFFICE_PDF_EXTENSIONS = new Set(['doc', 'xls', 'ppt', 'odt', 'ods', 'odp', 'rtf']);
const REQUESTED_CATEGORY_MAP = new Map([
  ['author', 'metadata'], ['device-identifier', 'metadata'], ['metadata', 'metadata'],
  ['comment', 'comment'], ['revision', 'revision'], ['hidden-object', 'hidden-object'],
  ['signature', 'signature'], ['thumbnail', 'thumbnail'], ['font', 'font'],
]);
const REMOVED_CATEGORY_MAP = new Map([
  ['document-properties', 'metadata'], ['comments', 'comment'], ['revisions', 'revision'],
  ['embedded-objects', 'hidden-object'], ['signatures', 'signature'], ['thumbnails', 'thumbnail'], ['embedded-fonts', 'font'],
]);

export function documentSanitizationPlan({ documentType, sourceExtension } = {}) {
  const normalizedType = normalizeDocumentType(documentType);
  if (normalizedType === 'pdf') return { strategy: 'qpdf', outputDocumentType: 'pdf', outputExtension: 'pdf' };
  const extension = normalizeSourceExtension(sourceExtension);
  if (!extension || OOXML_EXTENSIONS.has(extension)) {
    return { strategy: 'office-package', outputDocumentType: 'office', outputExtension: extension || 'office' };
  }
  if (LIBREOFFICE_PDF_EXTENSIONS.has(extension)) {
    return { strategy: 'libreoffice-pdf', outputDocumentType: 'pdf', outputExtension: 'pdf' };
  }
  throw new Error('Unsupported Office document extension.');
}

export async function runDocumentSanitizer({ documentType, sourceExtension, inputPath, outputPath, requestedActions, execute = runCommand, officeScriptPath = defaultOfficeScript }) {
  const plan = documentSanitizationPlan({ documentType, sourceExtension });
  if (plan.strategy === 'qpdf') {
    await execute('qpdf', buildPdfSanitizeCommand(inputPath, outputPath));
    return plan;
  }
  if (plan.strategy === 'office-package') {
    const selectedCategories = selectedOfficeCategories(requestedActions);
    const selectionArguments = requestedActions === undefined ? [] : ['--remove', ...selectedCategories];
    const result = await execute('python3', [officeScriptPath, inputPath, outputPath, ...selectionArguments]);
    return { ...plan, removedCategories: removedOfficeCategories(result) };
  }
  const outputDirectory = dirname(outputPath);
  const convertedPdf = join(outputDirectory, `${basename(inputPath, extname(inputPath))}.pdf`);
  await execute('libreoffice', [
    '--headless', '--nologo', '--nodefault', '--nolockcheck', '--norestore',
    '--convert-to', 'pdf', '--outdir', outputDirectory, inputPath,
  ]);
  await execute('qpdf', buildPdfSanitizeCommand(convertedPdf, outputPath));
  return plan;
}

function selectedOfficeCategories(actions) {
  const selected = [];
  for (const action of Array.isArray(actions) ? actions : []) {
    const category = REQUESTED_CATEGORY_MAP.get(String(action).replace(/^remove-/, ''));
    if (category && !selected.includes(category)) selected.push(category);
  }
  return selected;
}

function removedOfficeCategories(result) {
  try {
    const removed = JSON.parse(String(result || '{}'))?.removed;
    if (!Array.isArray(removed)) return [];
    return removed.map((reason) => REMOVED_CATEGORY_MAP.get(String(reason))).filter(Boolean);
  } catch { return []; }
}

function normalizeSourceExtension(value) {
  const extension = String(value || '').replace(/^\./, '').toLowerCase();
  if (!extension) return '';
  if (!/^[a-z0-9]{1,12}$/.test(extension)) throw new Error('Document extension is invalid.');
  return extension;
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    let stdout = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (code) => code === 0 ? resolve(stdout) : reject(new Error(`${command} exited with code ${code}: ${stderr.slice(0, 500)}`)));
  });
}
