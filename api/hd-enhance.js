// api/hd-enhance.js — HD Enhance via Replicate's nightmareai/real-esrgan
// (2x upscale + face enhancement), a well-established PAID model — not a
// Hugging Face free-tier guess. Requires REPLICATE_API_TOKEN with billing
// configured on the Replicate account.
// STATUS: real code, UNTESTED (see api/_replicate.js header).
import { readRawBody, parseMultipartFile } from './_hf.js';
import { getReplicateClient, runRealEsrgan, toReplicateApiError } from './_replicate.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Use POST with multipart/form-data (field "image").' });
    return;
  }
  try {
    const contentType = req.headers['content-type'] || '';
    if (!contentType.startsWith('multipart/form-data')) {
      res.status(400).json({ error: 'Expected multipart/form-data with an "image" field.' });
      return;
    }
    const raw = await readRawBody(req);
    const file = parseMultipartFile(raw, contentType);
    if (!file.buffer.length) { res.status(400).json({ error: 'Uploaded file is empty.' }); return; }
    if (file.buffer.length > 10 * 1024 * 1024) { res.status(400).json({ error: 'Image too large (max 10MB).' }); return; }

    const client = getReplicateClient();
    const outBuf = await runRealEsrgan(client, {
      imageBuffer: file.buffer, mimeType: file.mimeType, scale: 2, faceEnhance: true,
    });
    if (!outBuf.length) { res.status(502).json({ error: 'Provider returned an empty result.' }); return; }
    res.setHeader('Content-Type', 'image/png');
    res.status(200).send(outBuf);
  } catch (err) {
    const e = toReplicateApiError(err);
    res.status(e.statusCode).json({ error: e.error, detail: e.detail });
  }
}
