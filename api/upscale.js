// api/upscale.js — 4K / 8K Upscale (?tier=4k / ?tier=8k).
//
// MODEL AUDIT HISTORY:
// 1. caidas/swin2SR-classical-sr-x4-64 failed live: "No Inference Provider
//    available for model...".
// 2. HF's current "image-to-image" task docs only recommend prompt-guided
//    editing models (FLUX.1-Kontext-dev, Qwen-Image-Edit) — not plain
//    upscalers — so both tiers were marked honestly unavailable rather
//    than force-fitting a mismatched model.
//
// THIS UPDATE (still UNVERIFIED — read before trusting):
// Found fal/AuraSR-v2 — a GAN-based 4x super-resolution model published
// under the fal provider's OWN Hugging Face org (not a third-party mirror;
// a separate mirror of the older AuraSR v1 explicitly shows "not deployed
// by any Inference Provider", which is why that one was avoided), tagged
// super-resolution + Image-to-Image, with real community usage (200+
// likes). This is a reasonable candidate, NOT a confirmed one — could not
// verify live whether it is currently wired into serverless Inference
// Providers routing (vs. only HF's separate paid Inference Endpoints
// product) from this sandbox. No provider is hardcoded — provider="auto"
// per this task's own "prefer auto unless documented otherwise" rule,
// since there's no confirmed documented mapping this time either.
//
// If this also comes back with a real "no provider available" style
// error, that is honest, useful information — treat it the same as the
// previous swin2SR failure and consider reverting to the unavailable
// response (kept further down in comments for that purpose).
import { readRawBody, parseMultipartFile, getClient, toApiError } from './_hf.js';

const MODEL = 'fal/AuraSR-v2';

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
      model: MODEL,
      inputs: new Blob([file.buffer], { type: file.mimeType }),
    });
    let final = pass1;

    if (tier === '8k') {
      // Pass 2: feed pass 1's 4x output back through the same model for a
      // second 4x stage (~16x total). Surfaced as a real error if the
      // provider rejects the re-submitted (now much larger) image.
      const pass1Buf = Buffer.from(await pass1.arrayBuffer());
      final = await client.imageToImage({
        model: MODEL,
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
    res.status(e.statusCode).json({ error: e.error, detail: e.detail, tier, model: MODEL });
  }
}
