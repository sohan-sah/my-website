// api/hd-enhance.js — HD Enhance (super-resolution / quality enhancement).
//
// MODEL AUDIT (this update): searched Hugging Face's current official
// Inference Providers "image-to-image" task docs. Its "Recommended models"
// are prompt-guided editing models (black-forest-labs/FLUX.1-Kontext-dev,
// kontext-community/relighting-kontext-dev-lora-v3) — not plain
// resolution/quality enhancers. No classic super-resolution or generic
// image-enhancement model currently shows a documented Inference Provider
// mapping. The previously-used caidas/swin2SR-classical-sr-x2-64 belongs
// to the same now-unsupported family that already failed live for the 4K
// tier ("No Inference Provider available"). Rather than guess another
// model that may fail the same way, this is honestly reported as
// unavailable per the fallback this task explicitly calls for.
//
// If you find a currently provider-mapped enhancement model (check
// https://huggingface.co/docs/inference-providers/tasks/image-to-image
// and the model's own "Inference Providers" widget), replace the 501
// response below with a real client.imageToImage() call following the
// same pattern as api/remove-background.js.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Use POST with multipart/form-data (field "image").' });
    return;
  }
  res.status(501).json({
    available: false,
    error: 'AI Upscale temporarily unavailable',
    detail: 'No currently provider-supported Hugging Face model for HD enhancement was found during the latest model audit. This is not attempted with a fake or non-AI result.',
  });
}
