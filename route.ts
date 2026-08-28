import { NextRequest, NextResponse } from 'next/server';
import { HfInference } from '@huggingface/inference';

export const runtime = 'nodejs';
export const maxDuration = 60;

const HF_TOKEN = process.env.HF_TOKEN;
// SDXL base supports negative_prompt + explicit width/height, which is why it's
// the default here (unlike distilled fast models such as FLUX.1-schnell, which
// mostly ignore those parameters).
const MODEL = process.env.HF_TEXT_TO_IMAGE_MODEL || 'stabilityai/stable-diffusion-xl-base-1.0';

export async function POST(req: NextRequest) {
  if (!HF_TOKEN) {
    return NextResponse.json(
      { ok: false, error: 'server_misconfigured', message: 'HF_TOKEN is not set on the server. See README.md.' },
      { status: 500 }
    );
  }

  let body: { prompt?: string; negativePrompt?: string; width?: number; height?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_request', message: 'Expected JSON body.' }, { status: 400 });
  }

  const prompt = body.prompt?.trim();
  if (!prompt) {
    return NextResponse.json({ ok: false, error: 'missing_prompt', message: 'A prompt is required.' }, { status: 400 });
  }
  if (prompt.length > 1000) {
    return NextResponse.json(
      { ok: false, error: 'prompt_too_long', message: 'Keep prompts under 1000 characters.' },
      { status: 400 }
    );
  }

  const width = clampDim(body.width, 1024);
  const height = clampDim(body.height, 1024);

  const hf = new HfInference(HF_TOKEN);

  try {
    const result = await withTimeout(
      hf.textToImage({
        model: MODEL,
        inputs: prompt,
        parameters: {
          negative_prompt: body.negativePrompt?.trim() || undefined,
          width,
          height
        }
      }),
      55_000
    );

    // The SDK returns a Blob on success. Anything else means something
    // unexpected happened upstream — we don't guess, we report it.
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
    return NextResponse.json(mapHfError(err, MODEL), { status: mapHfStatus(err) });
  }
}

/** Race the HF call against a manual timeout — avoids depending on whatever
 * abort/signal support a given @huggingface/inference version does or doesn't have. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('aborted: request timed out')), ms))
  ]);
}

function clampDim(value: number | undefined, fallback: number) {
  if (!value || Number.isNaN(value)) return fallback;
  return Math.min(1536, Math.max(256, Math.round(value / 8) * 8));
}

function mapHfStatus(err: any): number {
  const msg = String(err?.message || '').toLowerCase();
  if (msg.includes('rate limit') || msg.includes('429')) return 429;
  if (msg.includes('loading') || msg.includes('503')) return 503;
  if (msg.includes('unauthorized') || msg.includes('401') || msg.includes('403')) return 502;
  if (msg.includes('aborted')) return 504;
  return 502;
}

function mapHfError(err: any, model: string) {
  const msg = String(err?.message || 'Unknown error from Hugging Face');
  const lower = msg.toLowerCase();

  if (lower.includes('aborted')) {
    return { ok: false, error: 'timeout', message: 'The request timed out. Try a shorter prompt or try again.' };
  }
  if (lower.includes('loading')) {
    return {
      ok: false,
      error: 'model_loading',
      message: `"${model}" is warming up on Hugging Face's infrastructure. Wait ~20-30s and try again. (${msg})`
    };
  }
  if (lower.includes('rate limit')) {
    return { ok: false, error: 'rate_limited', message: `Hugging Face rate-limited this request. (${msg})` };
  }
  if (lower.includes('unauthorized') || lower.includes('401') || lower.includes('403')) {
    return {
      ok: false,
      error: 'auth_failed',
      message: `Hugging Face rejected the request. Check HF_TOKEN and, if "${model}" is gated, that your account accepted its license. (${msg})`
    };
  }
  if (lower.includes('not found') || lower.includes('404')) {
    return {
      ok: false,
      error: 'model_unavailable',
      message: `No compatible Hugging Face model/provider is currently configured for text-to-image at "${model}". (${msg})`
    };
  }

  return { ok: false, error: 'hf_error', message: msg };
}
