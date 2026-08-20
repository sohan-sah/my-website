// server/hf.js
// Thin wrapper around the Hugging Face Inference API.
// Handles the two response shapes you get back:
//   1) a binary image (image/png, image/jpeg …)         -> most models
//   2) a JSON error, e.g. { error: "...", estimated_time: 20 }
//      which happens while a model is "cold" and loading on HF's side.
// On a "loading" response we wait and retry automatically so the
// frontend doesn't have to deal with it.

const HF_BASE = "https://api-inference.huggingface.co/models";

/**
 * Calls a Hugging Face model.
 * @param {string} model - e.g. "stabilityai/stable-diffusion-xl-base-1.0"
 * @param {Buffer|object} body - Buffer for image input, plain object for JSON input (text-to-image)
 * @param {object} opts
 * @param {string} opts.contentType - Content-Type header to send (e.g. "application/json" or "image/png")
 * @param {number} opts.maxRetries - how many times to retry while the model is loading
 * @returns {Promise<{buffer: Buffer, contentType: string}>}
 */
async function callHFModel(model, body, opts = {}) {
  const token = process.env.HF_TOKEN;
  if (!token || token.startsWith("hf_xxxx")) {
    const err = new Error(
      "HF_TOKEN is not configured. Paste your Hugging Face token into the .env file (see .env.example)."
    );
    err.code = "NO_TOKEN";
    throw err;
  }

  const { contentType = "application/json", maxRetries = 4 } = opts;
  const url = `${HF_BASE}/${model}`;

  const isJson = contentType === "application/json";
  const payload = isJson ? JSON.stringify(body) : body;

  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": contentType,
      },
      body: payload,
    });

    const respContentType = response.headers.get("content-type") || "";

    // Success: model returned an image directly.
    if (response.ok && respContentType.startsWith("image/")) {
      const arrayBuffer = await response.arrayBuffer();
      return { buffer: Buffer.from(arrayBuffer), contentType: respContentType };
    }

    // Otherwise it's JSON — either a real error, or "model is loading".
    let json;
    try {
      json = await response.json();
    } catch {
      const text = await response.text().catch(() => "");
      throw new Error(`Hugging Face returned an unreadable response (status ${response.status}): ${text.slice(0, 300)}`);
    }

    const isLoading =
      response.status === 503 ||
      (typeof json.error === "string" && json.error.toLowerCase().includes("loading"));

    if (isLoading && attempt < maxRetries) {
      const waitSeconds = Math.min(json.estimated_time || 5, 20);
      lastError = new Error(json.error || "Model is loading");
      await new Promise((r) => setTimeout(r, waitSeconds * 1000));
      continue;
    }

    // Some "image" tasks (e.g. background removal / segmentation models)
    // return JSON containing a base64 image instead of a raw blob.
    if (response.ok && json && typeof json === "object") {
      const base64Candidate =
        json.image || json.generated_image || (Array.isArray(json) && json[0] && json[0].mask);
      if (base64Candidate) {
        const cleaned = base64Candidate.replace(/^data:image\/\w+;base64,/, "");
        return { buffer: Buffer.from(cleaned, "base64"), contentType: "image/png" };
      }
    }

    const message =
      (json && (json.error || JSON.stringify(json))) ||
      `Hugging Face request failed with status ${response.status}`;
    const err = new Error(message);
    err.status = response.status;
    err.hfBody = json;
    throw err;
  }

  throw lastError || new Error("Model did not become ready in time. Please try again.");
}

module.exports = { callHFModel };
