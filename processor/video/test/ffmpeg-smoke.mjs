import assert from 'node:assert/strict';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { buildVideoFilterGraph } from '../filter.mjs';

const directory = await mkdtemp(join(tmpdir(), 'renitizer-video-smoke-'));
const input = join(directory, 'input.mp4');
const baseline = join(directory, 'baseline.mp4');
const redacted = join(directory, 'redacted.mp4');

try {
  await execute('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', 'testsrc2=size=320x240:rate=24', '-t', '4',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', input,
  ]);
  const unchanged = buildVideoFilterGraph([]);
  await render(input, baseline, unchanged);
  const graph = buildVideoFilterGraph([
    { id: 'private-area', action: 'blur', startTime: 1, endTime: 3, box: { x: 0.2, y: 0.2, width: 0.4, height: 0.4 } },
  ]);
  await render(input, redacted, graph);

  assert.ok((await stat(redacted)).size > 0, 'Expected an MP4 output from the blur graph.');
  const [baselineHashes, redactedHashes] = await Promise.all([
    frameHashes(baseline),
    frameHashes(redacted),
  ]);
  assert.notEqual(redactedHashes, baselineHashes, 'Expected a blur track to change the rendered video frames.');
} finally {
  await rm(directory, { recursive: true, force: true });
}

async function render(source, destination, graph) {
  await execute('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y', '-i', source,
    '-filter_complex', graph.filterComplex,
    '-map', graph.outputLabel,
    '-an', '-c:v', 'libx264', '-crf', '0', '-preset', 'ultrafast',
    destination,
  ]);
}

async function frameHashes(file) {
  return execute('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-i', file,
    '-map', '0:v:0', '-f', 'framemd5', '-',
  ]);
}

function execute(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (code) => code === 0 ? resolve(stdout) : reject(new Error(`${command} exited with code ${code}: ${stderr}`)));
  });
}
