// api/hd-enhance.js — HD Enhance (super-resolution / quality enhancement).
//
// MODEL AUDIT HISTORY: caidas/swin2SR-classical-sr-x2-64 had no confirmed
// current Inference Provider mapping, and HF's "image-to-image" task docs
// only recommend prompt-guided editing models, not plain enhancers — so
// this was marked honestly unavailable.
//
// THIS UPDATE (still UNVERIFIED — read before trusting):
// Using the same candidate as api/upscale.js: fal/AuraSR-v2, a 4x
// super-resolution model published under fal's own HF org (real signal:
// not a third-party mirror; tagged super-resolution; 200+ likes) —
// but its live availability via serverless Inference Providers (as
// opposed to HF's separate paid Inference Endpoints product) could not be
// confirmed from this sandbox. It only exposes a single upscale factor
// (4x per its own documented usage), so "HD Enhance" here is the same
// underlying operation as one pass of "4K Upscale" — there is no separate
// lighter-touch model currently known to be available. If this turns out
// not to be live, expect the same kind of real "no provider available"
// error as the previous swin2SR attempt — that would be honest
// information, not a bug in this code.
import { readRawBody, parseMultipartFile, getClient, toApiError } from './_hf.js';

const MODEL = 'fal/AuraSR-v2';

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
    res.status(e.statusCode).json({ error: e.error, detail: e.detail, model: MODEL });
  }
}
