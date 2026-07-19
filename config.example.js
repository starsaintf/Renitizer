// Copy to config.js only if you want a default browser cloud-analysis endpoint.
// This file must never contain provider keys or the Renvoy verification URL.
// Worker secrets belong only in the Cloudflare Worker secret store.
export const RENITIZER_CONFIG = { cloudEndpoint: 'https://your-worker.example/api/analyze' };
