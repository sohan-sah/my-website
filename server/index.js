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

// SPA history-mode fallback: the frontend uses real URLs like
// /tools/4k-enhancer for each dedicated tool page (so the browser back
// button and page refresh both work), but there's no actual file at that
// path — it's rendered client-side by public/index.html's router. Any
// GET that isn't an API call and isn't a real static file falls through
// to index.html so a hard refresh / direct link on a tool page works
// instead of 404ing.
app.get(/^(?!\/api\/).*/, (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`✔ 4K/8K Photo Video Editor server running on http://localhost:${PORT}`);
});
