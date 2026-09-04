// api/_hf.js — shared helper, imported by the other /api/*.js functions.
// Runs server-side only on Vercel. Never imported by client code.

function readRawBody(req) {
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
// data is never corrupted by string re-encoding.
function parseMultipartFile(buffer, contentTypeHeader) {
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
    // strip the trailing \r\n that precedes the next boundary marker
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

// Calls a Hugging Face inference model with a binary image body.
// STATUS: real code, UNTESTED from this build sandbox — its network egress
// blocks huggingface.co / api-inference.huggingface.co (confirmed:
// "host_not_allowed"), so this has never completed a real request here.
// On a real deployment, any network-level failure (DNS, TLS, the endpoint
// having moved, etc.) is now surfaced with its actual cause below instead
// of a bare "fetch failed".
async function callHfImageModel(modelId, inputBuffer, contentType) {
  const token = process.env.HF_TOKEN;
  if (!token) {
    const err = new Error('Server is not configured with HF_TOKEN.');
    err.statusCode = 500;
    throw err;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55_000);
  let res;
  try {
    res = await fetch(`https://api-inference.huggingface.co/models/${modelId}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': contentType || 'application/octet-stream',
        Accept: 'image/png',
      },
      body: inputBuffer,
      signal: controller.signal,
    });
  } catch (networkErr) {
    clearTimeout(timeout);
    if (networkErr.name === 'AbortError') {
      const err = new Error('Request to Hugging Face timed out after 55s.');
      err.statusCode = 504;
      throw err;
    }
    // Surface the REAL cause (e.g. ENOTFOUND, ECONNREFUSED, certificate
    // error) instead of the generic "fetch failed" wrapper message.
    const cause = networkErr.cause;
    const err = new Error(
      'Could not reach Hugging Face: ' +
      (cause ? `${cause.code || cause.name || ''} ${cause.message || ''}`.trim() : networkErr.message)
    );
    err.statusCode = 502;
    err.detail = { originalMessage: networkErr.message, cause: cause ? String(cause) : null };
    throw err;
  }
  clearTimeout(timeout);

  if (res.status === 503) {
    const info = await res.json().catch(() => null);
    const err = new Error('Model is loading on the provider. Retry shortly.');
    err.statusCode = 503;
    err.detail = info;
    throw err;
  }
  if (res.status === 401 || res.status === 403) {
    const err = new Error('Authentication with Hugging Face failed (check HF_TOKEN).');
    err.statusCode = 502;
    throw err;
  }
  if (res.status === 404) {
    const err = new Error(`Model "${modelId}" was not found by the inference provider.`);
    err.statusCode = 502;
    throw err;
  }
  if (res.status === 429) {
    const err = new Error('Rate limited by the inference provider.');
    err.statusCode = 429;
    throw err;
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`Provider returned an error (${res.status}).`);
    err.statusCode = 502;
    err.detail = text.slice(0, 500);
    throw err;
  }
  const ct = res.headers.get('content-type') || '';
  const buf = Buffer.from(await res.arrayBuffer());
  if (!ct.startsWith('image/') || buf.length === 0) {
    const err = new Error('Provider did not return a valid image.');
    err.statusCode = 502;
    err.detail = ct;
    throw err;
  }
  return { buffer: buf, contentType: ct };
}

module.exports = { readRawBody, parseMultipartFile, callHfImageModel };
