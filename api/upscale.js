// api/upscale.js — 4K / 8K Upscale (?tier=4k / ?tier=8k).
//
// MODEL AUDIT HISTORY (2 real live failures so far — no more guessing):
// 1. caidas/swin2SR-classical-sr-x4-64 — failed live: "No Inference
//    Provider available for model...".
// 2. fal/AuraSR-v2 — also failed live, same error: "No Inference Provider
//    available for model fal/AuraSR-v2."
//
// Conclusion: no currently free/serverless-provider-backed plain
// super-resolution model has been found after two real attempts. Both
// tiers are honestly reported as unavailable rather than guessing a third
// model and risking another failed round-trip.
//
// Before trying again: check a candidate model's own
// "Inference Providers" widget on huggingface.co yourself first (Deploy ->
// Inference Providers on the model page) to confirm a provider is
// actually listed as live, THEN replace the response below with a real
// client.imageToImage() call (see api/remove-background.js for the
// current SDK call pattern), and read the real output image's
// width/height before reporting a resolution.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Use POST with multipart/form-data (field "image").' });
    return;
  }
  const url = new URL(req.url, 'http://internal');
  const tier = url.searchParams.get('tier') === '8k' ? '8k' : '4k';
  res.status(501).json({
    available: false,
    tier,
    error: 'AI Upscale temporarily unavailable',
    detail: `No currently provider-supported Hugging Face model for ${tier.toUpperCase()} upscaling was found after two real live attempts (swin2SR, AuraSR-v2). This is not attempted with a fake or non-AI result.`,
  });
}
