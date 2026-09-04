// api/remove-background.js — accepts multipart/form-data (field "image"),
// returns PNG with background removed.
// STATUS: real code, UNTESTED (see api/_hf.js header — HF is unreachable from this sandbox).
const { readRawBody, parseMultipartFile, callHfImageModel } = require('./_hf');

const MODEL = 'briaai/RMBG-1.4'; // verify still served by an Inference Provider before relying on this

module.exports = async (req, res) => {
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
    if (!file.buffer.length) {
      res.status(400).json({ error: 'Uploaded file is empty.' });
      return;
    }
    if (file.buffer.length > 15 * 1024 * 1024) {
      res.status(400).json({ error: 'Image too large (max 15MB).' });
      return;
    }
    const { buffer, contentType: outType } = await callHfImageModel(MODEL, file.buffer, file.mimeType);
    res.setHeader('Content-Type', outType);
    res.status(200).send(buffer);
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message, detail: err.detail });
  }
};
