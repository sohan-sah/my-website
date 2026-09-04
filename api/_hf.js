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

// Calls a Hugging Face inference model with a binary image body.
// STATUS: real code, UNTESTED — this sandbox's network egress blocks
// huggingface.co / api-inference.huggingface.co (confirmed: "host_not_allowed"),
// so this has never actually completed a request. Verify with a live
// HF_TOKEN before trusting it in production.
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
  } finally {
    clearTimeout(timeout);
  }

  if (res.status === 503) {
    const info = await res.json().catch(() => null);
    const err = new Error('Model is loading on the provider. Retry shortly.');
    err.statusCode = 503;
    err.detail = info;
    throw err;
  }
  if (res.status === 401 || res.status === 403) {
    const err = new Error('Authentication with Hugging Face failed.');
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
    throw err;
  }
  return { buffer: buf, contentType: ct };
}

module.exports = { readRawBody, callHfImageModel };
