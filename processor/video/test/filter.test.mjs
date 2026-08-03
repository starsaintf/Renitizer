import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCoverFilter, buildVideoFilterGraph, normalizeRendererTracks } from '../filter.mjs';

test('normalizes only bounded cover tracks with a real time span', () => {
  assert.deepEqual(normalizeRendererTracks([
    { id: 'plate', action: 'cover', startTime: 1, endTime: 3, box: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 } },
    { id: 'bad', action: 'cover', startTime: 2, endTime: 2, box: { x: 0, y: 0, width: 1, height: 1 } },
  ]), [{
    id: 'plate', action: 'cover', startTime: 1, endTime: 3, box: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
  }]);
});

test('keeps a bounded blur track and creates a private blur overlay graph', () => {
  const tracks = normalizeRendererTracks([
    { id: 'plate', action: 'blur', startTime: 1, endTime: 3, box: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 } },
  ]);

  assert.equal(tracks[0]?.action, 'blur');
  const graph = buildVideoFilterGraph(tracks);
  assert.match(graph.filterComplex, /boxblur/);
  assert.match(graph.filterComplex, /overlay=/);
  assert.match(graph.filterComplex, /between\(t\\,1\\,3\)/);
  assert.equal(graph.outputLabel, '[renitized]');
  assert.equal(graph.filterComplex.includes('plate'), false);
});

test('builds a fixed time-bounded FFmpeg cover filter without source labels or filenames', () => {
  const filter = buildCoverFilter([
    { id: 'plate', action: 'cover', startTime: 1, endTime: 3, box: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 } },
  ]);

  assert.equal(filter, "drawbox=x=iw*0.1:y=ih*0.2:w=iw*0.3:h=ih*0.4:color=black@1:t=fill:enable='between(t\\,1\\,3)'");
  assert.equal(filter.includes('plate'), false);
});
