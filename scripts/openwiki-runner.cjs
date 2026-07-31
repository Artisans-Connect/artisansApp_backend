#!/usr/bin/env node

const { spawnSync } = require("node:child_process");
const path = require("node:path");

try {
  require("dotenv").config({ quiet: true });
} catch {
  // Some repos only use dotenv through OpenWiki's dependency tree.
}

const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPenRouter_OPENWIKI_KEY;

if (!apiKey) {
  console.error("OpenWiki requires OPENROUTER_API_KEY or OPenRouter_OPENWIKI_KEY in .env.");
  process.exit(1);
}

const executable = process.platform === "win32" ? "openwiki.cmd" : "openwiki";
const localBin = path.join(__dirname, "..", "node_modules", ".bin", executable);
const result = spawnSync(localBin, ["code", ...process.argv.slice(2)], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: {
    ...process.env,
    OPENWIKI_PROVIDER: process.env.OPENWIKI_PROVIDER || "openrouter",
    OPENWIKI_MODEL_ID: process.env.OPENWIKI_MODEL_ID || "z-ai/glm-5.2",
    OPENROUTER_API_KEY: apiKey,
  },
});

if (result.error) {
  console.error(`Unable to start OpenWiki: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
