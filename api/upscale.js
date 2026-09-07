// api/upscale.js — 4K / 8K Upscale via Replicate's nightmareai/real-esrgan
// (?tier=4k -> scale 4, ?tier=8k -> scale 8), a well-established PAID
// model — not a Hugging Face free-tier guess. Requires
// REPLICATE_API_TOKEN with billing configured on the Replicate account.
// A single call is used per tier (the model supports up to 10x directly)
// rather than chaining two calls, to avoid doubling the real cost.
// Actual output dimensions are whatever the model produces — the client
// reads and displays them from the real returned image, no resolution
// claim is hardcoded here.
// STATUS: real code, UNTESTED (see api/_replicate.js header).
import { readRawBody, parseMultipartFile } from './_hf.js';
import { getReplicateClient, runRealEsrgan, toReplicateApiError } from './_replicate.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Use POST with multipart/form-data (field "image").' });
    return;
  }
  const url = new URL(req.url, 'http://internal');
  const tier = url.searchParams.get('tier') === '8k' ? '8k' : '4k';
  const scale = tier === '8k' ? 8 : 4;

  try {
    const contentType = req.headers['content-type'] || '';
    if (!contentType.startsWith('multipart/form-data')) {
      res.status(400).json({ error: 'Expected multipart/form-data with an "image" field.', tier });
      return;
    }
    const raw = await readRawBody(req);
    const file = parseMultipartFile(raw, contentType);
    if (!file.buffer.length) { res.status(400).json({ error: 'Uploaded file is empty.', tier }); return; }
    if (file.buffer.length > 8 * 1024 * 1024) { res.status(400).json({ error: 'Image too large for upscaling (max 8MB source).', tier }); return; }

    const client = getReplicateClient();
    const outBuf = await runRealEsrgan(client, {
      imageBuffer: file.buffer, mimeType: file.mimeType, scale, faceEnhance: true,
    });
    if (!outBuf.length) { res.status(502).json({ error: 'Provider returned an empty result.', tier }); return; }
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('X-Upscale-Tier', tier);
    res.setHeader('X-Upscale-Passes', '1');
    res.status(200).send(outBuf);
  } catch (err) {
    const e = toReplicateApiError(err);
    res.status(e.statusCode).json({ error: e.error, detail: e.detail, tier });
  }
}
