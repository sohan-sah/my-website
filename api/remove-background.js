// api/remove-background.js — accepts multipart/form-data (field "image"),
// returns a foreground segmentation mask from the current Hugging Face
// Inference Providers routing (not the decommissioned
// api-inference.huggingface.co endpoint).
// STATUS: real code, UNTESTED (see api/_hf.js header).
//
// MODEL AUDIT (this update): switched from briaai/RMBG-1.4 (provider
// support unverified) to briaai/RMBG-2.0, which HF's own current official
// "image-segmentation" Inference Providers task docs page explicitly maps
// to the fal-ai provider (providersMapping: {"fal-ai":{"modelId":
// "briaai/RMBG-2.0","providerModelId":"fal-ai/bria/background/remove"}}).
// This is the most directly-sourced confirmation available for any of the
// 4 image tools.
//
// KNOWN LIMITATION: the image-segmentation task's response schema is a
// list of {mask, label, score} elements (a base64 PNG mask per class), not
// a pre-composited transparent cutout. This endpoint returns that mask
// image directly — it is real model output, not faked — but it is a
// foreground/background mask (white = subject), not yet a finished
// transparent-background PNG. Compositing that mask against the original
// pixels as an alpha channel would need a from-scratch image decoder for
// arbitrary upload formats (JPEG in particular), which could not be
// written and verified without network access in this environment, so it
// is intentionally not attempted rather than risk a silently-wrong result.
import { readRawBody, parseMultipartFile, getClient, toApiError } from './_hf.js';

const MODEL = 'briaai/RMBG-2.0';
const PROVIDER = 'fal-ai'; // per HF's documented providersMapping for this exact model+task

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
    const segments = await client.imageSegmentation({
      model: MODEL,
      provider: PROVIDER,
      data: new Blob([file.buffer], { type: file.mimeType }),
    });

    if (!Array.isArray(segments) || !segments.length || !segments[0].mask) {
      res.status(502).json({ error: 'Provider returned no segmentation mask.' });
      return;
    }
    // mask is a base64-encoded PNG string per the task's response schema.
    const maskBuf = Buffer.from(segments[0].mask, 'base64');
    if (!maskBuf.length) { res.status(502).json({ error: 'Provider returned an empty mask.' }); return; }
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('X-Result-Kind', 'segmentation-mask'); // not yet a composited cutout — see file header
    res.status(200).send(maskBuf);
  } catch (err) {
    const e = toApiError(err);
    res.status(e.statusCode).json({ error: e.error, detail: e.detail });
  }
}
