import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { buildCoverFilter, normalizeRendererTracks } from './filter.mjs';

const port = Number(process.env.PORT ?? 8080);
const secret = process.env.PROCESSOR_AUTH_TOKEN ?? '';
const maximumBytes = Number(process.env.MAX_VIDEO_BYTES ?? 2 * 1024 * 1024 * 1024);

if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error('PORT is invalid.');
if (!secret) throw new Error('PROCESSOR_AUTH_TOKEN is required.');
if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1) throw new Error('MAX_VIDEO_BYTES is invalid.');

http.createServer((request, response) => handle(request, response).catch((error) => {
  if (!response.headersSent) sendJson(response, 500, { error: 'Video rendering failed.' });
  else response.destroy(error);
})).listen(port, '0.0.0.0');

async function handle(request, response) {
  const url = new URL(request.url ?? '/', 'http://renderer.invalid');
  if (request.method === 'GET' && url.pathname === '/health/live') return sendJson(response, 200, { status: 'live' });
  if (request.method !== 'POST' || url.pathname !== '/v1/render/video') return sendJson(response, 404, { error: 'Not found.' });
  if (!authorized(request.headers.authorization)) return sendJson(response, 401, { error: 'Unauthorized.' });
  if (!String(request.headers['content-type'] ?? '').toLowerCase().startsWith('video/')) return sendJson(response, 415, { error: 'A video body is required.' });
  if (Number(request.headers['content-length'] ?? 0) > maximumBytes) return sendJson(response, 413, { error: 'Video exceeds the configured limit.' });

  const tracks = parseTracks(request.headers['x-renitizer-video-tracks']);
  if (!tracks.length) return sendJson(response, 400, { error: 'At least one valid cover redaction is required.' });
  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'renitizer-video-'));
  const input = path.join(tempDir, 'input');
  const output = path.join(tempDir, 'output.mp4');
  try {
    await pipeline(request, maximumSize(maximumBytes), fs.createWriteStream(input, { flags: 'wx' }));
    await render(input, output, buildCoverFilter(tracks));
    const size = (await fsp.stat(output)).size;
    response.writeHead(200, {
      'content-type': 'video/mp4',
      'content-length': size,
      'cache-control': 'no-store',
      'x-renitizer-renderer': 'ffmpeg-cover-v1',
    });
    await pipeline(fs.createReadStream(output), response);
  } catch (error) {
    if (!response.headersSent) {
      const status = error?.code === 'MAX_VIDEO_BYTES' ? 413 : error?.code === 'FFMPEG_FAILED' ? 422 : 500;
      sendJson(response, status, { error: status === 422 ? 'Video could not be rendered.' : 'Video rendering failed.' });
    }
  } finally {
    await fsp.rm(tempDir, { recursive: true, force: true });
  }
}

function authorized(value) {
  const expected = `Bearer ${secret}`;
  const actual = String(value ?? '');
  const a = Buffer.from(actual); const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function parseTracks(value) {
  try {
    const encoded = String(value ?? '');
    if (!encoded || encoded.length > 16 * 1024) return [];
    return normalizeRendererTracks(JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')));
  } catch { return []; }
}

function maximumSize(limit) {
  let total = 0;
  return new Transform({
    transform(chunk, _encoding, callback) {
      total += chunk.length;
      if (total > limit) {
        const error = new Error('Video exceeds the configured limit.');
        error.code = 'MAX_VIDEO_BYTES';
        callback(error);
        return;
      }
      callback(null, chunk);
    },
  });
}

function render(input, output, filter) {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y', '-i', input,
      '-vf', filter,
      '-map', '0:v:0', '-map', '0:a?',
      '-map_metadata', '-1',
      '-c:v', 'libx264', '-crf', '20', '-preset', 'medium',
      '-c:a', 'aac', '-movflags', '+faststart', output,
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    let failed = false;
    child.once('error', reject);
    child.stderr.on('data', () => { failed = true; });
    child.once('close', (code) => {
      if (code === 0 && !failed) resolve();
      else {
        const error = new Error('FFmpeg could not render the video.');
        error.code = 'FFMPEG_FAILED';
        reject(error);
      }
    });
  });
}

function sendJson(response, status, value) {
  const body = Buffer.from(`${JSON.stringify(value)}\n`);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': body.length,
    'cache-control': 'no-store',
  });
  response.end(body);
}
