// api/_replicate.js — shared helper for the paid Replicate upscaling
// integration. Runs server-side only. Never imported by client code.
//
// Uses nightmareai/real-esrgan — a well-established, extremely widely used
// model (94M+ runs on Replicate as of the current docs), NOT a niche/free
// pick like the two Hugging Face attempts that failed. This is a genuinely
// PAID service: it requires a Replicate account with billing configured
// and a REPLICATE_API_TOKEN. STATUS: real code, UNTESTED from this sandbox
// — its network egress blocks external hosts the same way it blocked
// Hugging Face, so this has never completed a real request here.
import Replicate from 'replicate';

export function getReplicateClient() {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    const err = new Error('Server is not configured with REPLICATE_API_TOKEN.');
    err.statusCode = 500;
    throw err;
  }
  return new Replicate({ auth: token });
}

// Runs nightmareai/real-esrgan and returns the result as a Buffer,
// regardless of which shape the installed Replicate client version
// returns (a FileOutput-like object with .url()/.blob(), or a raw URL
// string) — handled defensively since this could not be verified live.
export async function runRealEsrgan(client, { imageBuffer, mimeType, scale, faceEnhance }) {
  const dataUri = `data:${mimeType};base64,${imageBuffer.toString('base64')}`;
  const output = await client.run('nightmareai/real-esrgan:latest', {
    input: {
      image: dataUri,
      scale: Math.min(10, Math.max(1, scale)),
      face_enhance: !!faceEnhance,
    },
  });

  // Newer Replicate JS client: output is a FileOutput-like object.
  if (output && typeof output.blob === 'function') {
    const blob = await output.blob();
    return Buffer.from(await blob.arrayBuffer());
  }
  if (output && typeof output.url === 'function') {
    const res = await fetch(output.url());
    if (!res.ok) {
      const err = new Error(`Failed to fetch Replicate output (${res.status}).`);
      err.statusCode = 502;
      throw err;
    }
    return Buffer.from(await res.arrayBuffer());
  }
  // Older client / raw string URL output.
  if (typeof output === 'string') {
    const res = await fetch(output);
    if (!res.ok) {
      const err = new Error(`Failed to fetch Replicate output (${res.status}).`);
      err.statusCode = 502;
      throw err;
    }
    return Buffer.from(await res.arrayBuffer());
  }
  if (Array.isArray(output) && typeof output[0] === 'string') {
    const res = await fetch(output[0]);
    if (!res.ok) {
      const err = new Error(`Failed to fetch Replicate output (${res.status}).`);
      err.statusCode = 502;
      throw err;
    }
    return Buffer.from(await res.arrayBuffer());
  }
  throw new Error('Unrecognized output shape from Replicate — check the installed "replicate" package version.');
}

export function toReplicateApiError(err) {
  if (err.statusCode) return { statusCode: err.statusCode, error: err.message };
  const cause = err.cause;
  if (cause || /fetch failed/i.test(err.message || '')) {
    return {
      statusCode: 502,
      error: 'Could not reach Replicate: ' +
        (cause ? `${cause.code || cause.name || ''} ${cause.message || ''}`.trim() : err.message),
      detail: { originalMessage: err.message, cause: cause ? String(cause) : null },
    };
  }
  return {
    statusCode: err.response?.status || err.status || 502,
    error: err.message || 'Unexpected error calling Replicate.',
    detail: err.name,
  };
}
