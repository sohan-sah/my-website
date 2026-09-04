// api/upscale.js — POST raw image bytes with ?tier=4k or ?tier=8k.
// 4k = one x4 super-resolution pass. 8k = two chained x4 passes (a real
// multi-stage workflow, not a renamed file — actual output dimensions are
// whatever the model produces; the client reads and displays them, no
// resolution claim is hardcoded here).
// STATUS: real code, UNTESTED (see api/_hf.js header).
const { readRawBody, callHfImageModel } = require('./_hf');

const MODEL_X4 = 'caidas/swin2SR-classical-sr-x4-64'; // verify still served by an Inference Provider

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Use POST with the image as the request body.' });
    return;
  }
  const url = new URL(req.url, 'http://internal');
  const tier = url.searchParams.get('tier') === '8k' ? '8k' : '4k';

  try {
    const input = await readRawBody(req);
    if (!input.length) {
      res.status(400).json({ error: 'No image data received.' });
      return;
    }
    if (input.length > 8 * 1024 * 1024) {
      res.status(400).json({ error: 'Image too large for upscaling (max 8MB source).' });
      return;
    }
    const contentType = req.headers['content-type'] || 'application/octet-stream';

    // Pass 1 (both tiers)
    const pass1 = await callHfImageModel(MODEL_X4, input, contentType);
    let final = pass1;

    if (tier === '8k') {
      // Pass 2: feed pass 1's output back through the same model for a
      // second x4 stage. This can be slow and may exceed provider limits —
      // that possibility is surfaced as a real error, not hidden.
      final = await callHfImageModel(MODEL_X4, pass1.buffer, pass1.contentType);
    }

    res.setHeader('Content-Type', final.contentType);
    res.setHeader('X-Upscale-Tier', tier);
    res.setHeader('X-Upscale-Passes', tier === '8k' ? '2' : '1');
    res.status(200).send(final.buffer);
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message, detail: err.detail, tier });
  }
};
