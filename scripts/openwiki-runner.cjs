#!/usr/bin/env node

const { spawnSync } = require("node:child_process");
const path = require("node:path");

try {
  require("dotenv").config({ quiet: true });
} catch {
  // Some repos only use dotenv through OpenWiki's dependency tree.
}

const apiKey = process.env.OPENAI_COMPATIBLE_API_KEY || process.env.OPENROUTER_API_KEY || process.env.OPenRouter_OPENWIKI_KEY || "ollama";
const baseUrl = process.env.OPENAI_COMPATIBLE_BASE_URL || "http://localhost:11434/v1";
const provider = process.env.OPENWIKI_PROVIDER || "openai-compatible";
const modelId = process.env.OPENWIKI_MODEL_ID || "qwen2.5-coder:7b";

const executable = process.platform === "win32" ? "openwiki.cmd" : "openwiki";
const localBin = path.join(__dirname, "..", "node_modules", ".bin", executable);
const result = spawnSync(localBin, ["code", ...process.argv.slice(2)], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: {
    ...process.env,
    OPENWIKI_PROVIDER: provider,
    OPENAI_COMPATIBLE_BASE_URL: baseUrl,
    OPENAI_COMPATIBLE_API_KEY: apiKey,
    OPENWIKI_MODEL_ID: modelId,
  },
});

if (result.error) {
  console.error(`Unable to start OpenWiki: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
