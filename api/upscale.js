// api/upscale.js — 4K / 8K Upscale (?tier=4k / ?tier=8k).
//
// MODEL AUDIT (this update): the previously-used
// caidas/swin2SR-classical-sr-x4-64 failed live on Vercel with "No
// Inference Provider available for model...". Checked Hugging Face's
// current official Inference Providers "image-to-image" task docs: its
// "Recommended models" are prompt-guided editing models
// (black-forest-labs/FLUX.1-Kontext-dev, Qwen/Qwen-Image-Edit) — not plain
// resolution upscalers — and no classic super-resolution model currently
// shows a documented Inference Provider mapping. Forcing a prompt-guided
// editing model into a "just make it bigger, no prompt" role would not be
// genuine AI upscaling and its output dimensions could not be trusted.
// Per this task's own explicit instruction, both tiers are honestly
// reported as unavailable rather than guessing another likely-broken model
// or faking a result with ordinary resizing.
//
// If you find a currently provider-mapped super-resolution model (check
// https://huggingface.co/docs/inference-providers/tasks/image-to-image
// and the model's own "Inference Providers" widget on huggingface.co),
// replace the 501 response below with a real client.imageToImage() call
// (see api/remove-background.js for the current SDK call pattern), and
// read the real output image's width/height before reporting a resolution.
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
    detail: `No currently provider-supported Hugging Face model for ${tier.toUpperCase()} upscaling was found during the latest model audit. This is not attempted with a fake or non-AI result.`,
  });
}
