// api/text-to-image.js — POST { prompt, negative_prompt?, width?, height? }
// JSON, returns a generated image.
// Uses the current @huggingface/inference SDK (router.huggingface.co),
// NOT the decommissioned api-inference.huggingface.co endpoint.
// STATUS: real code, UNTESTED (see api/_hf.js header).
//
// MODEL AUDIT (this update): black-forest-labs/FLUX.1-schnell produced a
// live error — "no inference provider information" — so it is NOT
// currently served. Replaced with black-forest-labs/FLUX.1-dev, which is
// HF's own current flagship example for this exact SDK call on the main
// Inference Providers docs page (huggingface.co/docs/inference-providers),
// and is independently confirmed by Black Forest Labs' own model page as
// live on multiple current partner providers (fal.ai, Replicate, DeepInfra,
// TogetherAI, and others). Provider is left unset (provider="auto"
// behavior) per that same canonical example — no documented reason found
// to hardcode one provider over another for this model.
import { readRawBody, getClient, toApiError } from './_hf.js';

const MODEL = 'black-forest-labs/FLUX.1-dev';

function clampDim(v, fallback) {
  const n = Number(v) || fallback;
  return Math.min(1536, Math.max(256, Math.round(n / 64) * 64));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Use POST with a JSON body.' });
    return;
  }

  let body;
  try {
    const raw = await readRawBody(req);
    body = JSON.parse(raw.toString('utf8') || '{}');
  } catch {
    res.status(400).json({ error: 'Invalid JSON body.' });
    return;
  }

  const prompt = (body.prompt || '').trim();
  if (!prompt) { res.status(400).json({ error: 'A prompt is required.' }); return; }
  if (prompt.length > 2000) { res.status(400).json({ error: 'Prompt too long (max 2000 chars).' }); return; }

  const width = clampDim(body.width, 1024);
  const height = clampDim(body.height, 1024);

  try {
    const client = getClient();
    const result = await client.textToImage({
      model: MODEL,
      inputs: prompt,
      parameters: {
        negative_prompt: body.negative_prompt || undefined,
        width,
        height,
        seed: body.seed,
      },
    });
    const buf = Buffer.from(await result.arrayBuffer());
    if (!buf.length) { res.status(502).json({ error: 'Provider returned an empty image.' }); return; }
    res.setHeader('Content-Type', result.type || 'image/png');
    res.status(200).send(buf);
  } catch (err) {
    const e = toApiError(err);
    // FLUX.1-dev is gated behind accepting the model's license on
    // huggingface.co — surface that specific, actionable cause rather than
    // a generic provider error if the SDK reports it.
    if (/gated|access|license|permission/i.test(e.error || '')) {
      res.status(403).json({
        error: 'This model requires accepting its license on huggingface.co with the account tied to HF_TOKEN before it can be used, or your token lacks Inference Providers access.',
        detail: e.error,
      });
      return;
    }
    res.status(e.statusCode).json({ error: e.error, detail: e.detail });
  }
}
