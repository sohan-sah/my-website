// api/hd-enhance.js — POST raw image bytes, returns a 2x super-resolved PNG.
// STATUS: real code, UNTESTED (see api/_hf.js header).
const { readRawBody, callHfImageModel } = require('./_hf');

const MODEL = 'caidas/swin2SR-classical-sr-x2-64'; // verify still served by an Inference Provider

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Use POST with the image as the request body.' });
    return;
  }
  try {
    const input = await readRawBody(req);
    if (!input.length) {
      res.status(400).json({ error: 'No image data received.' });
      return;
    }
    if (input.length > 10 * 1024 * 1024) {
      res.status(400).json({ error: 'Image too large (max 10MB).' });
      return;
    }
    const contentType = req.headers['content-type'] || 'application/octet-stream';
    const { buffer, contentType: outType } = await callHfImageModel(MODEL, input, contentType);
    res.setHeader('Content-Type', outType);
    res.status(200).send(buffer);
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message, detail: err.detail });
  }
};
