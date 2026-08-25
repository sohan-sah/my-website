// server/hf.js
// Thin wrapper around Hugging Face's Inference Providers router.
// NOTE: the old "api-inference.huggingface.co" domain has been fully
// decommissioned by Hugging Face — it now returns HTTP 410 (and on some
// networks fails the connection outright, surfacing as a generic "fetch
// failed" error). All calls now go through the current router endpoint,
// which serves the free "hf-inference" provider at the same URL shape.
// Handles the two response shapes you get back:
//   1) a binary image (image/png, image/jpeg …)         -> most models
//   2) a JSON error, e.g. { error: "...", estimated_time: 20 }
//      which happens while a model is "cold" and loading on HF's side.
// On a "loading" response we wait and retry automatically so the
// frontend doesn't have to deal with it.

const HF_BASE = "https://router.huggingface.co/hf-inference/models";

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
    let response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": contentType,
        },
        body: payload,
      });
    } catch (networkErr) {
      // A raw network/DNS/TLS failure (e.g. "fetch failed") — most commonly
      // caused by a stale endpoint or a transient outage, not a code bug.
      throw new Error(
        `Could not reach Hugging Face (${networkErr.message}). Check that ${url} is reachable and that HF_TOKEN is set correctly.`
      );
    }

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

module.exports = { callHFModel, callHFModelChain };

/**
 * Tries a list of candidate model IDs in order and returns the first one
 * that actually works. Hugging Face's free "hf-inference" provider adds
 * and removes model coverage over time — a model id that worked last
 * month can start returning "Model not supported by provider hf-inference"
 * with no warning. Rather than hard-failing on the first (possibly now
 * unsupported) model, this walks the fallback list automatically.
 *
 * A genuine error (bad token, malformed request, real server error) is
 * NOT retried against the next model — only "this model isn't available
 * here" style failures are, so a real bug still surfaces immediately
 * instead of being masked by silently trying five more models.
 *
 * @param {string|string[]} models - one model id or an ordered list of candidates
 */
async function callHFModelChain(models, body, opts = {}) {
  const candidates = (Array.isArray(models) ? models : [models]).filter(Boolean);
  if (!candidates.length) {
    throw new Error(
      "No Hugging Face model is configured for this feature. Set the matching HF_MODEL_* environment variable (see .env.example)."
    );
  }

  let lastError;
  for (const model of candidates) {
    try {
      return await callHFModel(model, body, opts);
    } catch (err) {
      lastError = err;
      const msg = (err.message || "").toLowerCase();
      const isAvailabilityIssue =
        err.status === 404 ||
        msg.includes("not supported by provider") ||
        msg.includes("does not exist") ||
        msg.includes("not found");
      if (!isAvailabilityIssue) throw err; // a real error — don't mask it, fail loudly
      // otherwise: this candidate isn't currently served — try the next one
    }
  }
  // Every candidate was unavailable — surface a message that tells the
  // person what to actually do about it, not just the last raw error.
  const tried = candidates.join(", ");
  const err = new Error(
    `None of the configured models are currently available on Hugging Face's hf-inference provider (tried: ${tried}). ` +
      `Open one of these models on huggingface.co and check its "Inference Providers" panel for a currently-live alternative, then update the matching HF_MODEL_* variable.`
  );
  err.status = lastError?.status;
  throw err;
}
