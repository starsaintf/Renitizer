const recommendation = 'Trim, mute, or replace this spoken detail before sharing.';

export function transcriptFindings(text = '') {
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
    return [{ id: `audio-${id}`, category, title, detail: `${prefix}${value}`, severity, confidence, recommendation, assessment: 'assessed', resolved: false }];
  });
}
