// api/remove-background.js — Remove Background (clean transparent subject
// cutout).
//
// MODEL AUDIT HISTORY (2 real live attempts — no more guessing):
// 1. briaai/RMBG-2.0, provider unset (auto) — failed live: "Task
//    'image-segmentation' not supported for provider 'fal-ai'." HF's
//    router had only fal-ai mapped for this specific model, so "auto" had
//    nothing else to select — that combination is abandoned.
// 2. mattmdjaga/segformer_b2_clothes via hf-inference (a documented,
//    different provider mapping) — this call itself may reach a real
//    provider, but the model does CLOTHING-ITEM segmentation (separate
//    masks per garment: hat, hair, upper-clothes, pants, dress, shoes,
//    bag, background, etc.), not a single "subject vs. background" mask.
//    Producing a clean transparent subject cutout from it would require
//    unioning every non-background class's mask together (real pixel
//    compositing across several base64 PNGs), which could not be written
//    and verified without network access here — so the result would be,
//    at best, one clothing class's mask, not what "Remove Background"
//    implies. That is misleading rather than merely incomplete, so it is
//    not shipped even as an "experimental" option.
//
// Conclusion: no model+provider combination found so far can honestly
// deliver what this feature promises. Reported unavailable, matching
// HD Enhance / 4K / 8K Upscale, rather than shipping a misleading partial
// result.
//
// Before trying again: confirm on the model's own huggingface.co page
// that "Inference Providers" shows a live provider for a task that
// actually returns a full subject cutout (e.g. a model whose pipeline_tag
// is background-removal or produces a single foreground alpha matte),
// then replace the response below with a real client.imageToImage() /
// client.imageSegmentation() call (see api/text-to-image.js for the
// current SDK call pattern).
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Use POST with multipart/form-data (field "image").' });
    return;
  }
  res.status(501).json({
    available: false,
    error: 'Remove Background temporarily unavailable',
    detail: 'No currently provider-supported Hugging Face model that produces a clean transparent subject cutout was found after two real live attempts (briaai/RMBG-2.0, mattmdjaga/segformer_b2_clothes). This is not attempted with a fake or non-AI result.',
  });
}
