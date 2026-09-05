// api/text-to-image.js — POST { prompt, negative_prompt?, width?, height? }
// JSON, returns a generated image.
// Uses the current @huggingface/inference SDK (not the decommissioned
// api-inference.huggingface.co endpoint).
// STATUS: real code, UNTESTED (see api/_hf.js header).
// MODEL/PROVIDER: black-forest-labs/FLUX.1-schnell via the "hf-inference"
// provider is a combination documented as working with this exact SDK call
// (huggingface.co current docs/examples) — the most-verified choice among
// the 5 tools, though still not tested live from this sandbox.
import { readRawBody, getClient, toApiError } from './_hf.js';

const MODEL = 'black-forest-labs/FLUX.1-schnell';

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
      provider: 'hf-inference',
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
    res.status(e.statusCode).json({ error: e.error, detail: e.detail });
  }
}
