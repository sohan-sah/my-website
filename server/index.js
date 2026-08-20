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

app.listen(PORT, () => {
  console.log(`✔ 4K/8K Photo Video Editor server running on http://localhost:${PORT}`);
});
