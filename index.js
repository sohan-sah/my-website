// server/index.js
require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const { callHFModel } = require("./hf");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

// In-memory file uploads (fine for demo-scale files; swap for disk storage
// or S3 if you expect large volumes / production traffic).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
});

// ---- helper: map the UI's "AI model" chips to real HF model ids ----
const T2I_MODEL_MAP = {
  "Nova Vision v3": process.env.HF_MODEL_T2I_NOVA,
  "Aperture XL": process.env.HF_MODEL_T2I_APERTURE,
  Sketchline: process.env.HF_MODEL_T2I_SKETCHLINE,
  "Real-8K": process.env.HF_MODEL_T2I_REAL8K,
};

// ---- helper: map the UI's resolution dropdown label to pixel size ----
const RESOLUTION_MAP = {
  "1024 · Standard": 1024,
  "2048 · 2K": 1536, // most free SD checkpoints degrade badly above ~1536px
  "3840 · 4K": 1536, // native gen is capped; true 4K happens via the enhancer pass
  "7680 · 8K": 1536,
};

function sendError(res, err) {
  console.error(err);
  const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
  res.status(status).json({ error: err.message || "Something went wrong" });
}

/* =========================================================
   1) TEXT-TO-IMAGE   POST /api/generate-image
   body: { prompt, negativePrompt, model, resolution, aspectRatio }
   ========================================================= */
app.post("/api/generate-image", async (req, res) => {
  try {
    const { prompt, negativePrompt, model, resolution, aspectRatio } = req.body;

    if (!prompt || !prompt.trim()) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    const hfModel = T2I_MODEL_MAP[model] || process.env.HF_MODEL_T2I_NOVA;
    const base = RESOLUTION_MAP[resolution] || 1024;
    const { width, height } = dimensionsFromAspect(aspectRatio, base);

    const { buffer, contentType } = await callHFModel(
      hfModel,
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
   2) BACKGROUND REMOVAL   POST /api/remove-background
   multipart/form-data field: "image"
   ========================================================= */
app.post("/api/remove-background", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No image uploaded" });

    const hfModel = process.env.HF_MODEL_BG_REMOVAL;
    const { buffer, contentType } = await callHFModel(hfModel, req.file.buffer, {
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
   multipart/form-data field: "image", plus body field "targetResolution"
   ========================================================= */
app.post("/api/enhance-image", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No image uploaded" });

    const hfModel = process.env.HF_MODEL_UPSCALE;
    const { buffer, contentType } = await callHFModel(hfModel, req.file.buffer, {
      contentType: req.file.mimetype || "image/png",
    });

    res.set("Content-Type", contentType);
    res.send(buffer);
  } catch (err) {
    sendError(res, err);
  }
});

// Health check — handy for Render/Vercel deploy checks
app.get("/api/health", (req, res) => {
  res.json({ ok: true, hasToken: !!process.env.HF_TOKEN && !process.env.HF_TOKEN.startsWith("hf_xxxx") });
});
const path = require('path');

app.use(express.static(path.join(__dirname, '/')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`✔ 4K/8K Photo Video Editor server running on http://localhost:${PORT}`);
});
const path = require('path');

