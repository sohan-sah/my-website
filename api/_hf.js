// api/_hf.js — shared helper, imported by the other /api/*.js functions.
// Runs server-side only on Vercel. Never imported by client code.
//
// Uses the current Hugging Face Inference Providers SDK (@huggingface/inference),
// NOT the decommissioned https://api-inference.huggingface.co endpoint. The
// SDK itself talks to https://router.huggingface.co and picks the correct
// provider-specific request/response protocol per model — that per-provider
// protocol difference (raw bytes vs base64 vs URL vs polling) is exactly why
// a hand-rolled fetch to a single hardcoded host broke.
import { InferenceClient } from '@huggingface/inference';

export function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Parses a single-file multipart/form-data body (field name doesn't matter —
// returns the first file part found). No external dependencies: does a
// byte-accurate split on the boundary using Buffer.indexOf, so binary image
// data is never corrupted by string re-encoding. (Unchanged by this update —
// this only concerns the browser -> our server upload, not our server -> HF.)
export function parseMultipartFile(buffer, contentTypeHeader) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentTypeHeader || '');
  const boundary = m && (m[1] || m[2]);
  if (!boundary) {
    const err = new Error('Missing multipart boundary in Content-Type header.');
    err.statusCode = 400;
    throw err;
  }
  const marker = Buffer.from('--' + boundary);
  const parts = [];
  let start = buffer.indexOf(marker);
  while (start !== -1) {
    const next = buffer.indexOf(marker, start + marker.length);
    if (next === -1) break;
    parts.push(buffer.slice(start + marker.length, next));
    start = next;
  }
  for (const part of parts) {
    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd === -1) continue;
    const headers = part.slice(0, headerEnd).toString('latin1');
    if (!/filename="/i.test(headers)) continue; // skip non-file fields
    const filenameMatch = /filename="([^"]*)"/i.exec(headers);
    const typeMatch = /Content-Type:\s*([^\r\n]+)/i.exec(headers);
    let body = part.slice(headerEnd + 4);
    if (body.slice(-2).toString('latin1') === '\r\n') body = body.slice(0, -2);
    return {
      filename: filenameMatch ? filenameMatch[1] : 'upload',
      mimeType: typeMatch ? typeMatch[1].trim() : 'application/octet-stream',
      buffer: body,
    };
  }
  const err = new Error('No file field found in the uploaded form data.');
  err.statusCode = 400;
  throw err;
}

// Returns an authenticated InferenceClient. HF_TOKEN is read server-side
// only (process.env.HF_TOKEN) and is never sent to the browser.
export function getClient() {
  const token = process.env.HF_TOKEN;
  if (!token) {
    const err = new Error('Server is not configured with HF_TOKEN.');
    err.statusCode = 500;
    throw err;
  }
  return new InferenceClient(token);
}

// Normalizes any error from the SDK (network failure, provider error,
// auth error) into a {statusCode, error, detail} shape the API routes can
// send back — the REAL cause is always kept, never hidden behind a
// generic message.
// STATUS: real code, UNTESTED from this build sandbox — its network egress
// blocks both huggingface.co and registry.npmjs.org (confirmed:
// "host_not_allowed" on both), so this SDK has never been installed or
// called here. Verify with a live HF_TOKEN on Vercel before trusting output.
export function toApiError(err) {
  if (err.statusCode) return { statusCode: err.statusCode, error: err.message };

  const cause = err.cause;
  if (cause || /fetch failed/i.test(err.message || '')) {
    return {
      statusCode: 502,
      error: 'Could not reach Hugging Face: ' +
        (cause ? `${cause.code || cause.name || ''} ${cause.message || ''}`.trim() : err.message),
      detail: { originalMessage: err.message, cause: cause ? String(cause) : null },
    };
  }
  return {
    statusCode: err.httpResponse?.status || 502,
    error: err.message || 'Unexpected error calling Hugging Face.',
    detail: err.name,
  };
}
