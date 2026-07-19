import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildPdfSanitizeCommand, normalizeDocumentType } from './contract.mjs';

const defaultOfficeScript = fileURLToPath(new URL('./office.py', import.meta.url));

export async function runDocumentSanitizer({ documentType, inputPath, outputPath, execute = runCommand, officeScriptPath = defaultOfficeScript }) {
  if (normalizeDocumentType(documentType) === 'pdf') return execute('qpdf', buildPdfSanitizeCommand(inputPath, outputPath));
  return execute('python3', [officeScriptPath, inputPath, outputPath]);
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with code ${code}: ${stderr.slice(0, 500)}`)));
  });
}
