# 4K & 8K Photo Video Editor

This is a real, working Next.js app — not a mockup. Home page cards only get
a link when the tool behind them is actually implemented; everything else is
honestly marked "Not built yet."

## What's implemented

**Fully local, no external API (high confidence — pure browser code):**
- Photo Editor — crop-free adjustments (brightness/contrast/saturation/
  exposure/temperature/blur), preset filters, rotate/flip, sharpen (real
  unsharp-mask convolution), undo/redo, before/after compare, PNG export.
- Image Converter — real format conversion (PNG/JPEG/WebP) via canvas,
  quality control, resize, batch processing with per-file download.

**Backed by a real Hugging Face model call (see caveat below):**
- Remove Background — `briaai/RMBG-1.4`
- Text to Image — `stabilityai/stable-diffusion-xl-base-1.0`
- Image to Image — `timbrooks/instruct-pix2pix` (instruction-based editing)
- 4K/8K Enhancer — `caidas/swin2SR-classical-sr-x2-64` (real super-resolution;
  reports the actual measured output resolution, never a marketing label)

**Working utilities:**
- Search — filters the same feature list the home page renders from, so it
  can never show a tool that doesn't exist.
- History — real activity log in the browser's localStorage (not a backend
  database yet — see the page's own disclaimer).

## What's actually real here

- **Upload → server → Hugging Face → real result → download** is a genuine
  round trip. The `/api/background-remove` route calls the Hugging Face
  Inference API server-side and streams back whatever the model actually
  returns.
- `HF_TOKEN` lives only in `.env.local` / your host's environment variables.
  It is read in `app/api/background-remove/route.ts`, which runs on the
  server (`export const runtime = 'nodejs'`) — the browser never sees it.
- Every failure mode (missing token, model cold-starting, rate limit, bad
  auth, unexpected response type, network timeout) returns a real, specific
  error message. Nothing is swallowed into a fake "success."

## Important: I could not test any of this against the live Hugging Face API

I built this in a sandboxed environment with **no network access at all**
(confirmed — `npm install` itself fails here with a 403). That means for
every HF-backed feature above:

- I could not confirm the exact response shape, current availability, or
  provider support of any of the four models today.
- I could not run `npm install`, so I could not run TypeScript's type
  checker or a production build. I reviewed every file by hand and the
  code is internally consistent, but a full `npm run build` may surface
  something I can't see from here.

**Before you rely on any of this, on your own machine:**

```bash
npm install
cp .env.example .env.local   # fill in HF_TOKEN
npm run build                # catches any type/build errors
npm run dev
```

Then actually exercise each tool with a real image/prompt. If a model
returns `model_unavailable` (404), it isn't served on the free serverless
tier right now — check that model's page on huggingface.co for which
Inference Providers currently support it, and swap in an alternative via
the model env vars below.

```
HF_BG_REMOVAL_MODEL=briaai/RMBG-1.4
HF_TEXT_TO_IMAGE_MODEL=stabilityai/stable-diffusion-xl-base-1.0
HF_IMAGE_TO_IMAGE_MODEL=timbrooks/instruct-pix2pix
HF_UPSCALE_MODEL=caidas/swin2SR-classical-sr-x2-64
```

**License note:** `briaai/RMBG-1.4` is free for non-commercial/research use
only. Check every model's license on its huggingface.co page before using
this commercially — don't take any default here as a legal green light.

## Running it

```bash
npm install
cp .env.example .env.local   # then fill in HF_TOKEN
npm run dev
```

Open http://localhost:3000, tap "Remove Background," upload a photo.

## Project structure

```
app/
  page.tsx                            # Home grid, built from lib/features.ts
  search/page.tsx                     # Real search over the same feature list
  history/page.tsx                    # Real localStorage-backed activity log
  layout.tsx
  globals.css                         # Design tokens: colors, spacing, cards, nav
  tools/
    background-remover/page.tsx       # Upload -> API -> transparent PNG
    text-to-image/page.tsx            # Prompt -> API -> generated image
    image-to-image/page.tsx           # Upload + instruction -> API -> edited image
    upscaler/page.tsx                 # Upload -> API -> measured-resolution result
    photo-editor/page.tsx             # 100% client-side canvas editor
    image-converter/page.tsx          # 100% client-side format/quality/batch converter
  api/
    background-remove/route.ts        # Server-only HF call (raw fetch, binary in/out)
    text-to-image/route.ts            # Server-only HF call (via @huggingface/inference)
    image-to-image/route.ts           # Server-only HF call (via @huggingface/inference)
    upscale/route.ts                  # Server-only HF call + real dimension reading
lib/
  features.ts                         # Single source of truth for every tool card
  history.ts                          # localStorage read/write helpers
  imageDimensions.ts                  # Dependency-free PNG/JPEG/WebP header parser
```

## How to add the next feature (e.g. Text-to-Image)

Follow the same three-file pattern so nothing fake ever ships:

1. `app/api/<feature>/route.ts` — server route, reads `HF_TOKEN` from
   `process.env`, calls the real HF endpoint for that task, returns the real
   bytes/JSON or a specific error. Never return a placeholder on failure.
2. `app/tools/<feature>/page.tsx` — client UI that calls that route, shows a
   real loading state while the request is in flight, and renders whatever
   comes back (or the real error).
3. In `app/page.tsx`, give that feature's `Feature` object an `href` — that's
   what turns it from "Not built yet" into a clickable, working card. Don't
   add `href` until the route actually works.

Before wiring a new feature, check the model's page on huggingface.co for:
- Which pipeline/task tag it uses (`text-to-image`, `image-to-image`,
  `automatic-speech-recognition`, etc.) — this fixes the request shape.
- Whether it's served on the free serverless Inference API or requires a
  paid Inference Endpoint / a specific Inference Provider.
- Its license, if you plan to use this commercially.

If no compatible model exists for a feature yet, leave that card disabled
with "Not built yet" — that's the honest state, not a bug to hide.
