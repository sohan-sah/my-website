// api/remove-background.js — accepts multipart/form-data (field "image"),
// returns an image with the background removed.
// Uses the current @huggingface/inference SDK (not the decommissioned
// api-inference.huggingface.co endpoint).
// STATUS: real code, UNTESTED (see api/_hf.js header).
// UNVERIFIED MODEL/PROVIDER: could not check live whether briaai/RMBG-1.4 is
// currently served by an Inference Provider for this task from this sandbox.
// Before deploying, open https://huggingface.co/briaai/RMBG-1.4 and check its
// "Inference Providers" widget; swap MODEL below if it shows no provider.
import { readRawBody, parseMultipartFile, getClient, toApiError } from './_hf.js';

const MODEL = 'briaai/RMBG-1.4';

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
    if (file.buffer.length > 15 * 1024 * 1024) { res.status(400).json({ error: 'Image too large (max 15MB).' }); return; }

    const client = getClient();
    const result = await client.imageToImage({
      model: MODEL,
      inputs: new Blob([file.buffer], { type: file.mimeType }),
    });
    const buf = Buffer.from(await result.arrayBuffer());
    if (!buf.length) { res.status(502).json({ error: 'Provider returned an empty result.' }); return; }
    res.setHeader('Content-Type', result.type || 'image/png');
    res.status(200).send(buf);
  } catch (err) {
    const e = toApiError(err);
    res.status(e.statusCode).json({ error: e.error, detail: e.detail });
  }
}
