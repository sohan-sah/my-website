import { NextRequest, NextResponse } from 'next/server';
import { HfInference } from '@huggingface/inference';

export const runtime = 'nodejs';
export const maxDuration = 60;

const HF_TOKEN = process.env.HF_TOKEN;
// instruct-pix2pix takes an image + a plain-language instruction ("make it
// look like winter") rather than a strength/style prompt — that's the
// workflow this UI is built around.
const MODEL = process.env.HF_IMAGE_TO_IMAGE_MODEL || 'timbrooks/instruct-pix2pix';

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

export async function POST(req: NextRequest) {
  if (!HF_TOKEN) {
    return NextResponse.json(
      { ok: false, error: 'server_misconfigured', message: 'HF_TOKEN is not set on the server. See README.md.' },
      { status: 500 }
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { ok: false, error: 'invalid_request', message: 'Expected multipart/form-data with "image" and "prompt" fields.' },
      { status: 400 }
    );
  }

  const file = formData.get('image');
  const prompt = (formData.get('prompt') as string | null)?.trim();

  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: 'missing_file', message: 'No image file was received.' }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { ok: false, error: 'unsupported_type', message: `Unsupported file type "${file.type}". Use PNG, JPEG, or WebP.` },
      { status: 400 }
    );
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { ok: false, error: 'file_too_large', message: `File is ${(file.size / 1024 / 1024).toFixed(1)}MB. Limit is 8MB.` },
      { status: 400 }
    );
  }
  if (!prompt) {
    return NextResponse.json(
      { ok: false, error: 'missing_prompt', message: 'Describe the edit you want, e.g. "make it look like autumn".' },
      { status: 400 }
    );
  }

  const hf = new HfInference(HF_TOKEN);
  const inputBlob = new Blob([await file.arrayBuffer()], { type: file.type });

  try {
    const result = await withTimeout(
      hf.imageToImage({
        model: MODEL,
        inputs: inputBlob,
        parameters: { prompt }
      }),
      55_000
    );

    if (!(result instanceof Blob)) {
      return NextResponse.json(
        { ok: false, error: 'unexpected_response', message: 'The model did not return an image.' },
        { status: 502 }
      );
    }

    const bytes = await result.arrayBuffer();
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'Content-Type': result.type || 'image/png',
        'Content-Length': String(bytes.byteLength),
        'X-Model-Used': MODEL
      }
    });
  } catch (err: any) {
    const msg = String(err?.message || 'Unknown error from Hugging Face');
    const lower = msg.toLowerCase();
    let status = 502;
    let error = 'hf_error';

    if (lower.includes('aborted')) { status = 504; error = 'timeout'; }
    else if (lower.includes('loading')) { status = 503; error = 'model_loading'; }
    else if (lower.includes('rate limit')) { status = 429; error = 'rate_limited'; }
    else if (lower.includes('401') || lower.includes('403') || lower.includes('unauthorized')) { error = 'auth_failed'; }
    else if (lower.includes('404') || lower.includes('not found')) { error = 'model_unavailable'; }

    return NextResponse.json({ ok: false, error, message: msg }, { status });
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('aborted: request timed out')), ms))
  ]);
}
