const path = require("path");
const fs   = require("fs");

const ROOT   = path.resolve(__dirname, "..", ".."); // repo root
const WORKDIR = path.join(__dirname, "../repos");
const LOGDIR = path.join(__dirname, "../logs");

// Ensure dirs exist the first time the app starts
[WORKDIR, LOGDIR].forEach((p) => {
  if (!fs.existsSync(p)) fs.mkdirSync(p);
});

module.exports = { ROOT, WORKDIR, LOGDIR };
