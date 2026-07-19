const ACTIONS = new Set(['cover']);

export function normalizeRendererTracks(tracks) {
  if (!Array.isArray(tracks)) return [];
  return tracks.flatMap((track) => {
    if (!track || !ACTIONS.has(track.action)) return [];
    const startTime = number(track.startTime);
    const endTime = number(track.endTime);
    const box = normalizeBox(track.box);
    if (startTime === null || endTime === null || endTime <= startTime || !box) return [];
    return [{ id: String(track.id ?? ''), action: 'cover', startTime, endTime, box }];
  });
}

export function buildCoverFilter(tracks) {
  return normalizeRendererTracks(tracks).map((track) => {
    const { x, y, width, height } = track.box;
    return `drawbox=x=iw*${fixed(x)}:y=ih*${fixed(y)}:w=iw*${fixed(width)}:h=ih*${fixed(height)}:color=black@1:t=fill:enable='between(t\\,${fixed(track.startTime)}\\,${fixed(track.endTime)})'`;
  }).join(',');
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

function fixed(value) {
  return Number(value.toFixed(6)).toString();
}
