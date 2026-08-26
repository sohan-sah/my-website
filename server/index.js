// server/index.js
// LOCAL DEV ONLY entry point. Serves the API routes from server/app.js
// plus the static /public folder, and calls app.listen(). On Vercel this
// file is never used — api/index.js exports server/app.js directly and
// Vercel serves /public automatically. Run locally with `npm start`.
const path = require("path");
const express = require("express");
const app = require("./app");

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "..", "public")));

// SPA fallback: every real tool page (e.g. /tools/4k-enhancer) is a
// client-side route handled by index.html's own router, not a real file
// on disk. So a full page load or refresh on one of those URLs needs to
// still get index.html — this catches anything that isn't /api/* and
// isn't an actual static file (has no "." in the last path segment).
app.get(/^\/(?!api\/).*/, (req, res, next) => {
  if (path.extname(req.path)) return next(); // let a real static file 404 normally
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`✔ 4K/8K Photo Video Editor server running on http://localhost:${PORT}`);
});
