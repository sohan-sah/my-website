# 4K & 8K Photo Video Editor

Your Hugging Face key stays secret on the server, and **every visitor gets
the AI features automatically — no key required from them.**

## PWA + APK

`public/` is now a full installable PWA: `manifest.json`, `sw.js` (offline
app-shell cache; `/api/*` calls always go live, never cached), and icons in
`public/icons/`. Once deployed to Vercel (HTTPS is required for PWAs),
open the site on Android Chrome and use **⋮ → Install app**, or on desktop
Chrome click the install icon in the address bar.

To get a real installable **APK** from this PWA (no native code needed):
1. Deploy to Vercel first — you need a live HTTPS URL.
2. Go to https://www.pwabuilder.com, paste your deployed URL, click
   **Start**, then generate the **Android** package. It reads your
   `manifest.json` automatically and produces a signed APK/AAB you can
   sideload or publish to the Play Store.
3. Alternatively, run Google's `bubblewrap` CLI locally
   (`npm i -g @bubblewrap/cli`) pointed at the same manifest URL for a
   Trusted Web Activity APK.

```
project/
├── api/
│   └── index.js       # Vercel serverless entry — exports server/app.js
├── server/
│   ├── app.js          # Express app: CORS, JSON parsing, 3 API routes (no listen/static)
│   ├── index.js         # LOCAL DEV ONLY entry — adds static serving + app.listen
│   └── hf.js             # Hugging Face call helper (retries while a model loads)
├── public/
│   └── index.html      # frontend — calls /api/* on the backend
├── vercel.json         # routes /api/* to the serverless function
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

## Deploy to Vercel (recommended)

1. Push this whole folder to a GitHub repo and import it in Vercel
   (vercel.com → **Add New → Project**). No build command is needed —
   Vercel auto-detects `/api/index.js` as a serverless function and
   serves everything in `/public` as static files at the root, so
   `index.html` loads at `/` with no extra configuration.
2. In **Project Settings → Environment Variables**, add:
   ```
   HF_TOKEN = hf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```
   (get a free token at https://huggingface.co/settings/tokens)
3. Optionally add the model overrides listed in "Swapping models" below.
4. Deploy. Your site is live at `https://your-project.vercel.app` — the
   frontend, backend, and static assets are all served from the same
   domain, so `API_BASE=''` in `public/index.html` needs no changes.
5. Test `https://your-project.vercel.app/api/health` — you should see
   `{"ok":true,"hasToken":true}`.

**Vercel-specific limits to know about:**
- Serverless functions on the Hobby plan cap request bodies at **4.5MB**.
  The upload limit in `server/app.js` is set to 4MB so oversized files
  fail with a clear client-side message instead of an opaque 413 from
  the platform.
- Functions have a execution timeout (10s on Hobby, more on Pro) — the
  Hugging Face free-tier "cold model" retry loop in `server/hf.js` can
  occasionally exceed that on first use. If a request times out, retry
  once the model has warmed up, or upgrade your Vercel plan for a
  longer function timeout.
- Free Hobby deployments don't sleep the way Render does, so there's no
  30–60s cold-start wait for the server itself (only for a "cold" HF
  model, which `hf.js` already retries around).

## Alternative: Render backend + separately hosted frontend

If you'd rather run the backend somewhere else (Render, Railway, a VM)
and host `public/index.html` separately (e.g. GitHub Pages), that still
works — the steps below are unchanged from before.

## 1. Deploy the backend to Render (free)

1. Push this whole folder to a GitHub repo (can be the same
   `my-website` repo, or a separate one just for the backend — either
   works).
2. Go to https://render.com → sign in with GitHub.
3. **New → Web Service** → pick that repo.
4. Settings:
   - **Build command:** `npm install`
   - **Start command:** `npm start`
5. Under **Environment**, add:
   ```
   HF_TOKEN = hf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```
   (get a free token at https://huggingface.co/settings/tokens — never
   commit this into a file, only paste it into Render's dashboard)
6. Click **Deploy**. After a couple of minutes you'll get a URL like:
   ```
   https://my-website-xxxx.onrender.com
   ```

That's your live backend. Test it: open
`https://my-website-xxxx.onrender.com/api/health` in a browser — you
should see `{"ok":true,"hasToken":true}`.

> Free Render web services "sleep" after inactivity — the first request
> after a while can take ~30–60s to wake up. Fine for a personal site;
> upgrade the Render plan later if you need always-on.

## 2. Point your GitHub Pages site at that backend

Open `public/index.html`, find this near the top of the `<script>` block:

```js
const API_BASE='';
```

Change it to your Render URL:

```js
const API_BASE='https://my-website-xxxx.onrender.com';
```

Then put this `index.html` in your `sohan-sah/my-website` repo (replace
the old one) and commit — GitHub Pages updates automatically.

Now anyone who visits your GitHub Pages site gets working AI features
immediately, using your key on the backend — they never see or need a
token.

## 3. What's live

| Feature | Status |
|---|---|
| AI Image Generator | **Live**, via `/api/generate-image` — real Hugging Face model call |
| Background Studio | **Live**, via `/api/remove-background` — real Hugging Face model call |
| 4K/8K Enhancer | **Live**, via `/api/enhance-image` — **not** an AI call (see below) |
| Brightness/Contrast/Saturation sliders (Editor) | **Live**, instant, done in-browser |
| Payment/credits/login | Dummy, as requested |

**Why the Enhancer isn't AI-based:** every super-resolution/upscaler
model we tried came back `Model not supported by provider
hf-inference` — Hugging Face's free tier genuinely doesn't reliably
serve that task right now (unlike text-to-image and background
removal, which do). Rather than ship an "Enhance" button that's a
coin flip depending on HF's catalog that day, `/api/enhance-image`
does real, deterministic image processing with the `sharp` library:
a high-quality Lanczos3 upscale, an unsharp-mask sharpen, a light
median-filter denoise, and a brightness/gamma lift for low-light
photos — driven by the same four sliders in the UI (Face recovery,
Noise removal, Sharpening, Low-light boost). It always succeeds, with
no external dependency or API key needed for this one feature. "Face
recovery" specifically is an honest smaller version of the idea (extra
local contrast/sharpen) rather than a fake claim of AI face
restoration, since a real GFPGAN-style model isn't reliably reachable
here either.

`sharp` needs no extra setup on Vercel — it's a normal npm dependency,
and Vercel's build step installs the correct native binary for you
automatically (the same library Next.js itself uses for image
optimization).

## 3a. The 29 dedicated tool pages (`/tools/<slug>`)

Every tool/button now opens its own real, bookmarkable URL — e.g.
`/tools/4k-enhancer`, `/tools/background-remover` — implemented by a
small client-side router in `public/index.html` (see `TOOL_CATALOG`,
`renderToolRoute()`, and the `/tools/*` handling near the bottom of
the `<script>` block). Because these are real History-API routes and
not just in-page anchors, the browser **back/forward buttons work
correctly**, and a hard refresh on a tool page still works because
`server/index.js` (local) and `vercel.json` (Vercel) both fall back to
serving `index.html` for any non-`/api` path.

Each tool page falls into one of these buckets — all of them have a
complete Upload → Preview → Process → Result → Download workflow, and
none of them fake a result:

| Bucket | Tools | How it works |
|---|---|---|
| **Reuses an existing, working page** | AI Generator, AI Editor, AI Portrait, Photo Restore, Background Remover, Object Remover, Image Converter, Photo Filters, Templates, Video Studio, Video Trim, My Gallery, 4K/8K/HD Enhancer | Same real functionality described above, just given its own URL + (where relevant) a preset — e.g. `/tools/8k-enhancer` opens the Enhancer pre-set to the 8K chip. |
| **New, real client-side processing** | Background Changer, Face Retouch, Image to Sketch, Image Compressor, Photo Resize, Photo Cropper, Video Compressor, Batch Processing | Genuine `<canvas>`/`MediaRecorder` processing done entirely in the browser (or, for Background Changer, a real call to `/api/remove-background` + a canvas composite). Batch Processing zips results with JSZip (loaded from a CDN in `<head>`). |
| **Honestly unavailable — no fake success** | Photo Colorize, Cartoon/Anime, AI Effects (true style-transfer), Video Split, Video Merge, Video to GIF | These need a real hosted model (colorization, style-transfer) or a server-side video pipeline (ffmpeg) that isn't wired up yet. The page still has the full upload/process UI, but pressing "Process" always returns an honest error explaining exactly what's missing, with **Retry** and **Try another file** — never a fabricated result. To make one of these real: add a new `/api/*` route in `server/app.js` (following the pattern of `/api/remove-background`) or a hosted ffmpeg service, then replace that tool's entry in `buildUnavailableImpl()`/`TOOL_IMPL` in `public/index.html` with a real `run()` that calls it. |


## 4. Swapping / adding AI models (Generator & Background Studio)

Each of those two features tries a **chain** of candidate models
instead of a single hardcoded one, because Hugging Face's free
`hf-inference` provider adds and drops model coverage over time — the
fixed model id that worked today can start returning `Model not
supported by provider hf-inference` next month with no warning.
`server/app.js` tries your env var first, then falls through a short
list of widely-mirrored fallback checkpoints automatically. A genuine
error (bad token, malformed request) is never silently retried — only
"this specific model isn't available here" failures fall through to
the next candidate.

Set your preferred model per feature the same way as before:
```
HF_MODEL_T2I_NOVA=stabilityai/stable-diffusion-xl-base-1.0
HF_MODEL_T2I_APERTURE=stabilityai/stable-diffusion-xl-base-1.0
HF_MODEL_T2I_SKETCHLINE=runwayml/stable-diffusion-v1-5
HF_MODEL_T2I_REAL8K=black-forest-labs/FLUX.1-schnell
HF_MODEL_BG_REMOVAL=briaai/RMBG-1.4
```
It's tried first, then the built-in fallback list in `server/app.js`
kicks in if it's unset or no longer served. (`HF_MODEL_UPSCALE` is no
longer used, since the Enhancer doesn't call Hugging Face — see above.)

**If every candidate in a chain fails** you'll see an error naming all
the models that were tried. To find a currently-live replacement:
open any model's page on huggingface.co, look at its "Inference
Providers" panel, and confirm `hf-inference` is listed as a live
provider for the task you need (text-to-image, image-segmentation).
Then either set the matching `HF_MODEL_*` env var, or add the id to
that feature's fallback array in `server/app.js`. Full provider docs:
https://huggingface.co/docs/inference-providers

**Honesty note:** the free `hf-inference` provider is genuinely
narrower than the old Inference API used to be — it leans toward
smaller/CPU-friendly models. If a whole *category* keeps failing
(e.g. no upscaler works), the more durable fix is a paid HF Inference
Endpoint or a named third-party provider (`fal-ai`, `replicate`,
`together`) for that one feature, which needs a small code change in
`server/hf.js` (different URL shape per provider) rather than just an
env var swap.

## 5. Local testing (optional, before deploying)

```bash
npm install
cp .env.example .env   # paste your HF_TOKEN
npm start
```
Open `http://localhost:3000` — same app, running locally with
`API_BASE=''` (same-origin), so no URL change needed for local testing.
