// server/app.js
// The actual Express application: CORS, JSON parsing, and the 3 API routes.
// Deliberately contains NO app.listen() and NO static-file serving — both
// local dev (server/index.js) and Vercel (api/index.js) import this file
// and wire it up differently for their environment.
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const { callHFModelChain } = require("./hf");
const sharp = require("sharp");

const app = express();

app.use(cors());
app.use(express.json({ limit: "2mb" }));

// In-memory file uploads. NOTE: Vercel serverless functions on the Hobby
// plan cap request bodies at 4.5MB regardless of this setting, so the
// limit below is chosen to fail fast client-side rather than let Vercel's
// platform limit return an opaque 413. Raise it only if you're deploying
// somewhere without that ceiling (Render, a VM, etc.).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 }, // 4MB
});

// ---- helper: map the UI's "AI model" chips to an ordered list of HF model
// candidates. Your HF_MODEL_* env var (if set) is tried first; the rest are
// widely-mirrored checkpoints kept as a safety net, since Hugging Face's
// free "hf-inference" provider changes which models it serves over time —
// see the "Swapping models" section of README.md for how to update these. ----
const T2I_MODEL_MAP = {
  "Nova Vision v3": [
    process.env.HF_MODEL_T2I_NOVA,
    "black-forest-labs/FLUX.1-schnell",
    "stabilityai/stable-diffusion-xl-base-1.0",
  ],
  "Aperture XL": [
    process.env.HF_MODEL_T2I_APERTURE,
    "stabilityai/stable-diffusion-xl-base-1.0",
    "black-forest-labs/FLUX.1-schnell",
  ],
  Sketchline: [
    process.env.HF_MODEL_T2I_SKETCHLINE,
    "runwayml/stable-diffusion-v1-5",
    "stabilityai/stable-diffusion-2-1",
  ],
  "Real-8K": [
    process.env.HF_MODEL_T2I_REAL8K,
    "black-forest-labs/FLUX.1-schnell",
    "stabilityai/stable-diffusion-xl-base-1.0",
  ],
};
const T2I_FALLBACK = [
  process.env.HF_MODEL_T2I_NOVA,
  "black-forest-labs/FLUX.1-schnell",
  "stabilityai/stable-diffusion-xl-base-1.0",
  "runwayml/stable-diffusion-v1-5",
];
const BG_REMOVAL_CHAIN = [
  process.env.HF_MODEL_BG_REMOVAL,
  "briaai/RMBG-1.4",
  "briaai/RMBG-2.0",
];

// ---- helper: map the UI's resolution dropdown label to pixel size ----
const RESOLUTION_MAP = {
  "1024 · Standard": 1024,
  "2048 · 2K": 1536, // most free SD checkpoints degrade badly above ~1536px
  "3840 · 4K": 1536, // native gen is capped; true 4K happens via the enhancer pass
  "7680 · 8K": 1536,
};

// ---- helper: enhancer's target-resolution chips -> long-edge pixel cap ----
// (kept modest even for "8K" — genuinely upscaling a phone photo to true
// 7680px adds no real detail and produces a huge, slow file; this caps the
// long edge at a size that still looks sharp after the resize+sharpen pass)
const ENHANCE_RESOLUTION_MAP = { HD: 1280, "2K": 2048, "4K": 3200, "8K": 4200 };

function clamp(n, min, max) {
  n = Number(n);
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function sendError(res, err) {
  console.error(err);
  const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
  res.status(status).json({ error: err.message || "Something went wrong" });
}

function dimensionsFromAspect(aspectRatio, base) {
  const ratios = {
    "1:1 Square": [1, 1],
    "16:9 Widescreen": [16, 9],
    "9:16 Portrait": [9, 16],
    "4:5 Social": [4, 5],
    "3:2 Classic": [3, 2],
  };
  const [w, h] = ratios[aspectRatio] || [1, 1];
  const long = base;
  const short = Math.round((base * Math.min(w, h)) / Math.max(w, h) / 8) * 8;
  return w >= h ? { width: long, height: short } : { width: short, height: long };
}

/* =========================================================
   1) TEXT-TO-IMAGE   POST /api/generate-image
   body: { prompt, negativePrompt, model, resolution, aspectRatio }
   ========================================================= */
app.post("/api/generate-image", async (req, res) => {
  try {
    const { prompt, negativePrompt, model, resolution, aspectRatio } = req.body || {};

    if (!prompt || !prompt.trim()) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    const hfModels = T2I_MODEL_MAP[model] || T2I_FALLBACK;
    const base = RESOLUTION_MAP[resolution] || 1024;
    const { width, height } = dimensionsFromAspect(aspectRatio, base);

    const { buffer, contentType } = await callHFModelChain(
      hfModels,
      {
        inputs: prompt,
        parameters: {
          negative_prompt: negativePrompt || undefined,
          width,
          height,
        },
      },
      { contentType: "application/json" }
    );

    res.set("Content-Type", contentType);
    res.send(buffer);
  } catch (err) {
    sendError(res, err);
  }
});

/* =========================================================
   2) BACKGROUND REMOVAL   POST /api/remove-background
   multipart/form-data field: "image"
   ========================================================= */
app.post("/api/remove-background", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No image uploaded" });

    const { buffer, contentType } = await callHFModelChain(BG_REMOVAL_CHAIN, req.file.buffer, {
      contentType: req.file.mimetype || "image/png",
    });

    res.set("Content-Type", contentType);
    res.send(buffer);
  } catch (err) {
    sendError(res, err);
  }
});

/* =========================================================
   3) IMAGE ENHANCEMENT / UPSCALE   POST /api/enhance-image
   multipart/form-data field: "image", plus body fields:
     targetResolution ("HD"|"2K"|"4K"|"8K"), sharpening (0-100),
     noiseRemoval (0-100), lowLightBoost (0-100), faceRecovery ("on"|"off")

   NOTE: this does NOT call an AI model. Hugging Face's free hf-inference
   provider doesn't reliably serve dedicated super-resolution models (see
   README "Swapping models" for the history here) — every candidate we
   tried came back "not supported by provider". Rather than keep the
   Enhance button randomly broken depending on HF's catalog that day,
   this does real, deterministic image processing with `sharp`:
   a high-quality Lanczos3 upscale, an unsharp-mask sharpen, a median
   filter for noise, and a brightness/gamma lift — every request
   succeeds, every time, with no external dependency.
   ========================================================= */
app.post("/api/enhance-image", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No image uploaded" });

    const targetResolution = req.body?.targetResolution || "4K";
    const longEdge = ENHANCE_RESOLUTION_MAP[targetResolution] || ENHANCE_RESOLUTION_MAP["4K"];

    const sharpening = clamp(req.body?.sharpening, 0, 100);
    const noiseRemoval = clamp(req.body?.noiseRemoval, 0, 100);
    const lowLightBoost = clamp(req.body?.lowLightBoost, 0, 100);
    const faceRecoveryOn = req.body?.faceRecovery === "on";

    let pipeline = sharp(req.file.buffer, { failOn: "none" }).rotate(); // .rotate() auto-applies EXIF orientation
    const meta = await pipeline.metadata();
    const currentLongEdge = Math.max(meta.width || 0, meta.height || 0);

    // Only upscale if the target is actually bigger than the source —
    // shrinking a big photo just because "HD" was picked would be a
    // regression, not an enhancement.
    if (currentLongEdge && longEdge > currentLongEdge) {
      const isLandscape = (meta.width || 0) >= (meta.height || 0);
      pipeline = pipeline.resize(
        isLandscape ? { width: longEdge, withoutEnlargement: false } : { height: longEdge, withoutEnlargement: false },
        { kernel: sharp.kernel.lanczos3 }
      );
    }

    // Noise removal: a light median filter smooths sensor noise/grain.
    // Map 0-100 -> odd kernel size 1(off) .. 5, since larger kernels start
    // destroying real detail rather than just noise.
    const medianSize = noiseRemoval > 66 ? 5 : noiseRemoval > 33 ? 3 : 1;
    if (medianSize > 1) pipeline = pipeline.median(medianSize);

    // Sharpening: unsharp-mask style — sigma controls the radius, m1/m2
    // control how strongly edges are boosted.
    const sharpenSigma = 0.6 + (sharpening / 100) * 1.6; // ~0.6 .. 2.2
    pipeline = pipeline.sharpen({ sigma: sharpenSigma, m1: 1, m2: 0.6 + sharpening / 200 });

    // Low-light boost: lifts brightness and slightly lowers contrast on
    // shadows so dark photos recover detail without blowing out highlights.
    if (lowLightBoost > 0) {
      const brightnessMul = 1 + (lowLightBoost / 100) * 0.45; // up to +45%
      const gammaAdj = 1 + (lowLightBoost / 100) * 0.25; // lifts shadows
      pipeline = pipeline.modulate({ brightness: brightnessMul }).gamma(clamp(gammaAdj, 1, 3));
    }

    // "Face recovery" is a request for AI face restoration (GFPGAN-style),
    // which needs a real model we can't reliably reach on the free tier —
    // rather than fake it, apply a bit of extra local-contrast/sharpen
    // when it's on, which is an honest, smaller version of the same idea.
    if (faceRecoveryOn) {
      pipeline = pipeline.sharpen({ sigma: 1.1, m1: 1.2, m2: 0.9 }).normalise();
    }

    const buffer = await pipeline.png({ quality: 92 }).toBuffer();

    res.set("Content-Type", "image/png");
    res.send(buffer);
  } catch (err) {
    sendError(res, err);
  }
});

// Health check — handy for deploy checks on any host
app.get("/api/health", (req, res) => {
  res.json({ ok: true, hasToken: !!process.env.HF_TOKEN && !process.env.HF_TOKEN.startsWith("hf_xxxx") });
});

// Multer / body-parser errors (oversized file, bad multipart, etc.) land here
// instead of crashing the function.
app.use((err, req, res, next) => {
  sendError(res, err);
});

module.exports = app;
