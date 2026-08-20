# 4K & 8K Photo Video Editor

Your Hugging Face key stays secret on the server, and **every visitor gets
the AI features automatically — no key required from them.**

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
| AI Image Generator | **Live**, via `/api/generate-image` |
| Background Studio | **Live**, via `/api/remove-background` |
| 4K/8K Enhancer | **Live**, via `/api/enhance-image` |
| Brightness/Contrast/Saturation sliders | **Live**, instant, done in-browser (not an AI task) |
| Sharpen slider | UI-only for now |
| Payment/credits/login | Dummy, as requested |

## 4. Swapping models

Edit the environment variables on Render (Environment tab), no code
changes needed:
```
HF_MODEL_T2I_NOVA=stabilityai/stable-diffusion-xl-base-1.0
HF_MODEL_T2I_APERTURE=stabilityai/stable-diffusion-xl-base-1.0
HF_MODEL_T2I_SKETCHLINE=runwayml/stable-diffusion-v1-5
HF_MODEL_T2I_REAL8K=black-forest-labs/FLUX.1-schnell
HF_MODEL_BG_REMOVAL=briaai/RMBG-1.4
HF_MODEL_UPSCALE=caidas/swin2SR-classical-sr-x4-64
```

**Honesty note:** free-tier serverless HF Inference works very
reliably for text-to-image. Background-removal/upscaling models are
more of a mixed bag on the free tier — if one keeps failing, try
swapping its model id here; some models need a paid HF Inference
Endpoint instead of the free serverless API.

## 5. Local testing (optional, before deploying)

```bash
npm install
cp .env.example .env   # paste your HF_TOKEN
npm start
```
Open `http://localhost:3000` — same app, running locally with
`API_BASE=''` (same-origin), so no URL change needed for local testing.
