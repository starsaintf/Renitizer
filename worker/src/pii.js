const recommendation = 'Trim, mute, or replace this spoken detail before sharing.';

export function transcriptFindings(text = '', words = []) {
  const rules = [
    ['email', /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/i, 'email', 'Email address in audio', 'Transcription contains: ', 'medium', 0.92],
    ['phone', /\+?\d[\d ()-]{7,}\d/, 'phone', 'Phone number in audio', 'Transcription contains: ', 'medium', 0.88],
    ['address', /\b(?:street|st\.?|avenue|ave\.?|road|rd\.?|boulevard|blvd\.?|lane|ln\.?|drive|dr\.?)\b/i, 'address', 'Possible address in audio', 'Transcription contains a street-address cue: ', 'high', 0.7],
    ['name', /\b(?:my name is|this is|i am)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i, 'name', 'Name cue in audio', 'Transcription introduces a name: ', 'low', 0.6],
  ];
  return rules.flatMap(([id, pattern, category, title, prefix, severity, confidence]) => {
    const match = text.match(pattern);
    if (!match) return [];
    const value = id === 'name' ? match[1] : match[0];
    const timeRange = timeRangeForMatch(text, match, value, words);
    return [{
      id: `audio-${id}`, category, title, detail: `${prefix}${value}`, severity, confidence, recommendation, assessment: 'assessed', resolved: false,
      ...(timeRange ? { timeRange, redactionAction: 'keep' } : {}),
    }];
  });
}

function timeRangeForMatch(text, match, value, words) {
  const wordSpans = timestampedWords(text, words);
  if (!wordSpans.length) return null;
  const matchStart = Math.max(0, (Number(match.index) || 0) + String(match[0] || '').indexOf(value));
  const matchEnd = matchStart + String(value).length;
  const overlapping = wordSpans.filter((word) => word.textEnd > matchStart && word.textStart < matchEnd);
  if (!overlapping.length) return null;
  return { start: overlapping[0].start, end: overlapping.at(-1).end };
}

function timestampedWords(text, words) {
  if (!Array.isArray(words)) return [];
  const source = String(text || '');
  const sourceLower = source.toLocaleLowerCase();
  let cursor = 0;
  return words.flatMap((word) => {
    const token = String(word?.word ?? word?.text ?? '').trim();
    const start = Number(word?.start);
    const end = Number(word?.end);
    if (!token || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
    const index = sourceLower.indexOf(token.toLocaleLowerCase(), cursor);
    if (index < 0) return [];
    cursor = index + token.length;
    return [{ textStart: index, textEnd: cursor, start, end }];
  });
}
