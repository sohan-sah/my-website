// api/text-to-image.js — POST { prompt, negative_prompt?, width?, height? } JSON, returns a PNG.
// STATUS: real code, UNTESTED (see api/_hf.js header). Plain Vercel serverless
// function (not Next.js) so it matches this project's plain-HTML setup.
const { readRawBody } = require('./_hf');

const MODEL = 'black-forest-labs/FLUX.1-schnell'; // verify still served by an Inference Provider
const HF_ENDPOINT = `https://api-inference.huggingface.co/models/${MODEL}`;

function clampDim(v, fallback) {
  const n = Number(v) || fallback;
  return Math.min(1536, Math.max(256, Math.round(n / 64) * 64));
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Use POST with a JSON body.' });
    return;
  }
  const token = process.env.HF_TOKEN;
  if (!token) {
    res.status(500).json({ error: 'Server is not configured with HF_TOKEN.' });
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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  let hfRes;
  try {
    hfRes = await fetch(HF_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'image/png' },
      body: JSON.stringify({
        inputs: prompt,
        parameters: { negative_prompt: body.negative_prompt || undefined, width, height, seed: body.seed },
      }),
      signal: controller.signal,
    });
  } catch (networkErr) {
    clearTimeout(timeout);
    if (networkErr.name === 'AbortError') {
      res.status(504).json({ error: 'Request to provider timed out.' });
      return;
    }
    const cause = networkErr.cause;
    res.status(502).json({
      error: 'Could not reach Hugging Face: ' + (cause ? `${cause.code || cause.name || ''} ${cause.message || ''}`.trim() : networkErr.message),
      detail: { originalMessage: networkErr.message, cause: cause ? String(cause) : null },
    });
    return;
  }
  clearTimeout(timeout);

  try {
    if (hfRes.status === 503) {
      const info = await hfRes.json().catch(() => null);
      res.status(503).json({ error: 'Model is loading on the provider. Retry shortly.', estimated_time: info && info.estimated_time });
      return;
    }
    if (hfRes.status === 401 || hfRes.status === 403) {
      res.status(502).json({ error: 'Authentication with Hugging Face failed. Check HF_TOKEN.' });
      return;
    }
    if (hfRes.status === 429) {
      res.status(429).json({ error: 'Rate limited by the inference provider.' });
      return;
    }
    if (!hfRes.ok) {
      const text = await hfRes.text().catch(() => '');
      res.status(502).json({ error: `Provider returned an error (${hfRes.status}).`, detail: text.slice(0, 500) });
      return;
    }
    const ct = hfRes.headers.get('content-type') || '';
    const buf = Buffer.from(await hfRes.arrayBuffer());
    if (!ct.startsWith('image/') || buf.length === 0) {
      res.status(502).json({ error: 'Provider did not return an image.' });
      return;
    }
    res.setHeader('Content-Type', ct);
    res.status(200).send(buf);
  } catch (err) {
    res.status(500).json({ error: 'Unexpected server error.', detail: err.message });
  }
};
