// api/index.js
// Vercel serverless entry point. Vercel auto-detects any file under /api
// as a serverless function; exporting the Express app directly works
// because Express apps are themselves valid (req, res) request handlers.
// vercel.json rewrites every /api/* request to this single function, and
// Vercel serves everything in /public as static assets automatically —
// no separate build step needed.
module.exports = require("../server/app");
