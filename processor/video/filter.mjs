const ACTIONS = new Set(['blur', 'cover']);

export function normalizeRendererTracks(tracks) {
  if (!Array.isArray(tracks)) return [];
  return tracks.flatMap((track) => {
    if (!track || !ACTIONS.has(track.action)) return [];
    const startTime = number(track.startTime);
    const endTime = number(track.endTime);
    const box = normalizeBox(track.box);
    if (startTime === null || endTime === null || endTime <= startTime || !box) return [];
    return [{ id: String(track.id ?? ''), action: track.action, startTime, endTime, box }];
  });
}

export function buildCoverFilter(tracks) {
  return normalizeRendererTracks(tracks).filter((track) => track.action === 'cover').map(buildCoverTrack).join(',');
}

export function buildVideoFilterGraph(tracks) {
  const normalized = normalizeRendererTracks(tracks);
  if (!normalized.length) return { filterComplex: '[0:v]null[renitized]', outputLabel: '[renitized]' };
  const filters = [];
  let source = '0:v';
  for (const [index, track] of normalized.entries()) {
    const output = index === normalized.length - 1 ? 'renitized' : `renitized${index + 1}`;
    if (track.action === 'cover') {
      filters.push(`[${source}]${buildCoverTrack(track)}[${output}]`);
      source = output;
      continue;
    }
    const base = `redaction${index + 1}base`;
    const crop = `redaction${index + 1}crop`;
    const blurred = `redaction${index + 1}blurred`;
    filters.push(`[${source}]split=2[${base}][${crop}]`);
    filters.push(`[${crop}]${buildBlurTrack(track)}[${blurred}]`);
    filters.push(`[${base}][${blurred}]${buildBlurOverlay(track)}[${output}]`);
    source = output;
  }
  return { filterComplex: filters.join(';'), outputLabel: `[${source}]` };
}

function normalizeBox(box) {
  const x = number(box?.x);
  const y = number(box?.y);
  const width = number(box?.width);
  const height = number(box?.height);
  if ([x, y, width, height].some((value) => value === null)) return null;
  if (x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > 1 || y + height > 1) return null;
  return { x, y, width, height };
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildCoverTrack(track) {
  const { x, y, width, height } = track.box;
  return `drawbox=x=iw*${fixed(x)}:y=ih*${fixed(y)}:w=iw*${fixed(width)}:h=ih*${fixed(height)}:color=black@1:t=fill:enable='between(t\\,${fixed(track.startTime)}\\,${fixed(track.endTime)})'`;
}

function buildBlurTrack(track) {
  const { x, y, width, height } = track.box;
  return `crop=w='trunc(iw*${fixed(width)}/2)*2':h='trunc(ih*${fixed(height)}/2)*2':x='trunc(iw*${fixed(x)}/2)*2':y='trunc(ih*${fixed(y)}/2)*2',boxblur=luma_radius=min(h\\,w)/10:luma_power=2:chroma_radius=min(ch\\,cw)/10:chroma_power=2`;
}

function buildBlurOverlay(track) {
  const { x, y } = track.box;
  return `overlay=x=main_w*${fixed(x)}:y=main_h*${fixed(y)}:enable='between(t\\,${fixed(track.startTime)}\\,${fixed(track.endTime)})'`;
}

function fixed(value) {
  return Number(value.toFixed(6)).toString();
}
