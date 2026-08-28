import { NextRequest, NextResponse } from 'next/server';

// This route runs ONLY on the server. HF_TOKEN is read from process.env
// and is never sent to, or readable by, the browser.
export const runtime = 'nodejs';
export const maxDuration = 60;

const HF_TOKEN = process.env.HF_TOKEN;

// briaai/RMBG-1.4 is a widely-used background-removal model whose default
// pipeline returns the cut-out image directly (not just a mask), which is
// why we can pipe the response straight back to the client. It is free for
// non-commercial use only; for a commercial deployment, swap this for a
// model/provider you're licensed to use (see README).
const DEFAULT_MODEL = 'briaai/RMBG-1.4';
const HF_MODEL = process.env.HF_BG_REMOVAL_MODEL || DEFAULT_MODEL;
const HF_URL = `https://api-inference.huggingface.co/models/${HF_MODEL}`;

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8MB
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

export async function POST(req: NextRequest) {
  if (!HF_TOKEN) {
    // We do NOT fake a result here. We tell the caller exactly what's missing.
    return NextResponse.json(
      {
        ok: false,
        error: 'server_misconfigured',
        message:
          'HF_TOKEN is not set on the server. Add it to your environment (e.g. .env.local or your host\'s secret manager) and redeploy. See README.md.'
      },
      { status: 500 }
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { ok: false, error: 'invalid_request', message: 'Expected multipart/form-data with an "image" field.' },
      { status: 400 }
    );
  }

  const file = formData.get('image');
  if (!(file instanceof File)) {
    return NextResponse.json(
      { ok: false, error: 'missing_file', message: 'No image file was received.' },
      { status: 400 }
    );
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      {
        ok: false,
        error: 'unsupported_type',
        message: `Unsupported file type "${file.type}". Use PNG, JPEG, or WebP.`
      },
      { status: 400 }
    );
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      {
        ok: false,
        error: 'file_too_large',
        message: `File is ${(file.size / 1024 / 1024).toFixed(1)}MB. The limit is ${MAX_UPLOAD_BYTES / 1024 / 1024}MB.`
      },
      { status: 400 }
    );
  }

  const inputBytes = await file.arrayBuffer();

  let hfResponse: Response;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45_000);

    hfResponse = await fetch(HF_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${HF_TOKEN}`,
        'Content-Type': file.type
      },
      body: inputBytes,
      signal: controller.signal
    });

    clearTimeout(timeout);
  } catch (err: any) {
    const timedOut = err?.name === 'AbortError';
    return NextResponse.json(
      {
        ok: false,
        error: timedOut ? 'timeout' : 'network_error',
        message: timedOut
          ? 'The request to Hugging Face timed out. Try again, or try a smaller image.'
          : `Could not reach Hugging Face: ${err?.message || 'unknown network error'}`
      },
      { status: 502 }
    );
  }

  if (!hfResponse.ok) {
    // Hugging Face returns JSON error bodies (e.g. model loading, rate limit,
    // invalid token). Surface the real message instead of a generic one.
    let detail = '';
    try {
      const errBody = await hfResponse.json();
      detail = errBody?.error || JSON.stringify(errBody);
    } catch {
      detail = await hfResponse.text().catch(() => '');
    }

    if (hfResponse.status === 503) {
      return NextResponse.json(
        {
          ok: false,
          error: 'model_loading',
          message: `The model "${HF_MODEL}" is warming up on Hugging Face's infrastructure. Wait ~20-30s and try again. (${detail})`
        },
        { status: 503 }
      );
    }

    if (hfResponse.status === 401 || hfResponse.status === 403) {
      return NextResponse.json(
        {
          ok: false,
          error: 'auth_failed',
          message: `Hugging Face rejected the request (${hfResponse.status}). Check that HF_TOKEN is valid and, if the model is gated, that your account has accepted its license. (${detail})`
        },
        { status: 502 }
      );
    }

    if (hfResponse.status === 404) {
      return NextResponse.json(
        {
          ok: false,
          error: 'model_unavailable',
          message: `No compatible Hugging Face model/provider is currently available at "${HF_MODEL}" via the serverless Inference API. It may need to be run via a dedicated Inference Endpoint instead. (${detail})`
        },
        { status: 502 }
      );
    }

    if (hfResponse.status === 429) {
      return NextResponse.json(
        {
          ok: false,
          error: 'rate_limited',
          message: `Hugging Face rate-limited this request. Wait a moment and try again, or upgrade your HF plan for higher throughput. (${detail})`
        },
        { status: 429 }
      );
    }

    return NextResponse.json(
      {
        ok: false,
        error: 'hf_error',
        message: `Hugging Face returned an error (${hfResponse.status}): ${detail}`
      },
      { status: 502 }
    );
  }

  const contentType = hfResponse.headers.get('content-type') || '';
  if (!contentType.startsWith('image/')) {
    // The model didn't return an image, so we refuse to fabricate one.
    const bodyText = await hfResponse.text().catch(() => '');
    return NextResponse.json(
      {
        ok: false,
        error: 'unexpected_response',
        message: `Expected an image back from the model but got "${contentType}". Raw response: ${bodyText.slice(0, 300)}`
      },
      { status: 502 }
    );
  }

  const resultBytes = await hfResponse.arrayBuffer();

  return new NextResponse(resultBytes, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(resultBytes.byteLength),
      'X-Model-Used': HF_MODEL
    }
  });
}
