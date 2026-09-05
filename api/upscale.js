// api/upscale.js — accepts multipart/form-data (field "image") with
// ?tier=4k or ?tier=8k. 4k = one x4 super-resolution pass. 8k = two
// chained x4 passes (a real multi-stage workflow, not a renamed file —
// actual output dimensions are whatever the model produces; the client
// reads and displays them, no resolution claim is hardcoded here).
// Uses the current @huggingface/inference SDK (not the decommissioned
// api-inference.huggingface.co endpoint).
// STATUS: real code, UNTESTED (see api/_hf.js header).
// UNVERIFIED MODEL/PROVIDER: could not check live whether
// caidas/swin2SR-classical-sr-x4-64 is currently served by an Inference
// Provider from this sandbox. Before deploying, check its "Inference
// Providers" widget on huggingface.co and swap MODEL_X4 below if needed.
import { readRawBody, parseMultipartFile, getClient, toApiError } from './_hf.js';

const MODEL_X4 = 'caidas/swin2SR-classical-sr-x4-64';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Use POST with multipart/form-data (field "image").' });
    return;
  }
  const url = new URL(req.url, 'http://internal');
  const tier = url.searchParams.get('tier') === '8k' ? '8k' : '4k';

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

    const client = getClient();
    const pass1 = await client.imageToImage({
      model: MODEL_X4,
      inputs: new Blob([file.buffer], { type: file.mimeType }),
    });
    let final = pass1;

    if (tier === '8k') {
      // Pass 2: feed pass 1's output back through the same model for a
      // second x4 stage. Surfaced as a real error if the provider rejects
      // the re-submitted (now larger) image, never hidden.
      const pass1Buf = Buffer.from(await pass1.arrayBuffer());
      final = await client.imageToImage({
        model: MODEL_X4,
        inputs: new Blob([pass1Buf], { type: pass1.type || 'image/png' }),
      });
    }

    const finalBuf = Buffer.from(await final.arrayBuffer());
    if (!finalBuf.length) { res.status(502).json({ error: 'Provider returned an empty result.', tier }); return; }
    res.setHeader('Content-Type', final.type || 'image/png');
    res.setHeader('X-Upscale-Tier', tier);
    res.setHeader('X-Upscale-Passes', tier === '8k' ? '2' : '1');
    res.status(200).send(finalBuf);
  } catch (err) {
    const e = toApiError(err);
    res.status(e.statusCode).json({ error: e.error, detail: e.detail, tier });
  }
}
