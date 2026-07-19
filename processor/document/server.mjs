import { createServer } from 'node:http';
import { mkdtemp, open, rm, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { runDocumentSanitizer } from './runner.mjs';
import { normalizeDocumentType } from './contract.mjs';

const port = Number(process.env.PORT ?? 8080);
const secret = process.env.PROCESSOR_AUTH_TOKEN ?? '';
const maxBytes = Number(process.env.MAX_DOCUMENT_BYTES ?? 100 * 1024 * 1024);

if (!secret) throw new Error('PROCESSOR_AUTH_TOKEN is required.');

createServer(async (request, response) => {
  if (request.method === 'GET' && request.url === '/health/live') return send(response, 200, 'ok');
  if (request.method !== 'POST' || request.url !== '/v1/clean/document') return send(response, 404, 'Not found');
  if (!authorized(request.headers.authorization)) return send(response, 401, 'Unauthorized');
  let documentType;
  try { documentType = normalizeDocumentType(request.headers['x-renitizer-document-type']); }
  catch { return send(response, 400, 'X-Renitizer-Document-Type must be pdf or office'); }
  if (!validContentType(documentType, request.headers['content-type'])) return send(response, 415, 'Unexpected document content type');
  const length = Number(request.headers['content-length'] ?? 0);
  if (!Number.isFinite(length) || length < 1 || length > maxBytes) return send(response, 413, 'Document is too large');
  const directory = await mkdtemp(join(tmpdir(), 'renitizer-document-'));
  const input = join(directory, documentType === 'pdf' ? 'input.pdf' : 'input.office');
  const output = join(directory, documentType === 'pdf' ? 'output.pdf' : 'output.office');
  try {
    await writeBounded(request, input, maxBytes);
    await runDocumentSanitizer({ documentType, inputPath: input, outputPath: output });
    if ((await stat(output)).size < 1) throw new Error('The document processor produced an empty output.');
    response.writeHead(200, {
      'Content-Type': documentType === 'pdf' ? 'application/pdf' : 'application/octet-stream',
      'X-Renitizer-Document-Type': documentType,
      'Cache-Control': 'no-store',
    });
    await pipeline(createReadStream(output), response);
  } catch (error) {
    if (!response.headersSent) send(response, 422, 'Document could not be sanitized');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}).listen(port);

function authorized(header) {
  const expected = `Bearer ${secret}`;
  return typeof header === 'string' && header.length === expected.length && timingSafeEqual(header, expected);
}

function timingSafeEqual(left, right) {
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

function validContentType(documentType, value = '') {
  const contentType = value.split(';', 1)[0].toLowerCase();
  return documentType === 'pdf' ? contentType === 'application/pdf' : /application\/(?:vnd\.(?:openxmlformats-officedocument|ms-excel|ms-powerpoint)|msword)/.test(contentType);
}

async function writeBounded(source, destination, limit) {
  let received = 0;
  const file = await open(destination, 'w');
  try {
    for await (const chunk of source) {
      received += chunk.length;
      if (received > limit) throw new Error('Document is too large');
      await file.write(chunk);
    }
    if (received < 1) throw new Error('Document is empty');
  } finally {
    await file.close();
  }
}

function send(response, status, text) {
  response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(text);
}
