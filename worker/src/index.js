const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const findingSchema = {
  type: 'object', additionalProperties: false, required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['id', 'category', 'title', 'detail', 'severity', 'confidence', 'recommendation'],
        properties: {
          id: { type: 'string' }, category: { type: 'string' }, title: { type: 'string' }, detail: { type: 'string' },
          severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] }, confidence: { type: 'number' }, recommendation: { type: 'string' },
        },
      },
    },
  },
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/api/analyze') return json({ error: 'POST /api/analyze only' }, 404);
    if (!env.OPENAI_API_KEY) return json({ error: 'OPENAI_API_KEY server secret is not configured.' }, 500);
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return json({ error: 'A media file is required.' }, 400);
    if (!file.type.startsWith('image/')) return json({ findings: [unavailable('cloud-media-boundary', 'This sample Worker sends image files to vision analysis. Audio/video transcription needs a dedicated provider path.')] });

    const base64 = bytesToBase64(new Uint8Array(await file.arrayBuffer()));
    const upstream = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST', headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        input: [{ role: 'user', content: [{ type: 'input_text', text: 'Analyze this user-provided image only for shareable privacy risks: visible addresses, email addresses, phone numbers, QR/barcodes, identity documents, and sensitive personal data. Do not identify people or infer location.' }, { type: 'input_image', image_url: `data:${file.type};base64,${base64}` }] }],
        text: { format: { type: 'json_schema', name: 'privacy_findings', strict: true, schema: findingSchema } },
      }),
    });
    if (!upstream.ok) return json({ error: 'Vision provider request failed.' }, upstream.status);
    const response = await upstream.json();
    try { return json(JSON.parse(response.output_text)); }
    catch { return json({ error: 'Vision provider returned an unreadable structured response.' }, 502); }
  },
};

function unavailable(id, detail) { return { id, category: 'capability', title: 'Cloud media boundary', detail, severity: 'low', confidence: 1, recommendation: 'Use a provider path configured for this media type.', assessment: 'unavailable', resolved: false }; }
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { ...cors, 'Content-Type': 'application/json' } }); }
function bytesToBase64(bytes) { let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary); }
