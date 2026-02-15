#!/usr/bin/env node
/**
 * Phase 07: Seed hygiene — eliminate NXDOMAIN firm seeds and ensure at least one resolvable firm seed exists.
 * - Replaces cooley.com + Cooley LLP with cooley.com + Cooley LLP wherever found (data/src/scripts).
 * - Ensures a minimal seed file exists at data/legal_signal_leads.json (created if missing).
 * - Idempotent: safe to run multiple times.
 * Gates:
 * - node --check
 * - npm run build (final)
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

function run(cmd) { execSync(cmd, { stdio: "inherit" }); }
function sh(cmd) { return execSync(cmd, { encoding: "utf8" }).trim(); }
function exists(p) { return fs.existsSync(p); }
function read(p) { return fs.readFileSync(p, "utf8"); }
function writeIfChanged(p, next) {
  const prev = exists(p) ? read(p) : "";
  if (prev !== next) fs.writeFileSync(p, next);
}
function isTextFile(p) {
  return (
    p.endsWith(".json") ||
    p.endsWith(".ts") ||
    p.endsWith(".mts") ||
    p.endsWith(".js") ||
    p.endsWith(".mjs") ||
    p.endsWith(".cjs") ||
    p.endsWith(".md")
  );
}
function walk(dir, out = []) {
  if (!exists(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "node_modules" || ent.name === "dist" || ent.name === ".git") continue;
      walk(full, out);
    } else {
      out.push(full);
    }
  }
  return out;
}

const ROOT = sh("git rev-parse --show-toplevel");
process.chdir(ROOT);

const FROM_DOMAIN = "cooley.com";
const FROM_FIRM = "Cooley LLP";
const TO_DOMAIN = "cooley.com";
const TO_FIRM = "Cooley LLP";

let touched = 0;

// 1) Replace invalid seed domain/firm anywhere in repo text files (excluding dist/node_modules)
const candidates = []
  .concat(walk(path.join(ROOT, "data")))
  .concat(walk(path.join(ROOT, "src")))
  .concat(walk(path.join(ROOT, "scripts")))
  .filter(isTextFile);

for (const file of candidates) {
  const content = read(file);
  if (!content.includes(FROM_DOMAIN) && !content.includes(FROM_FIRM)) continue;

  let next = content
    .replaceAll(FROM_DOMAIN, TO_DOMAIN)
    .replaceAll(FROM_FIRM, TO_FIRM);

  if (next !== content) {
    writeIfChanged(file, next);
    touched++;
  }
}

// 2) Ensure minimal valid seed file exists (created if missing).
//    This file is used as a stable starting point for the contact mapper / pipeline.
const seedPath = path.join("data", "legal_signal_leads.json");
if (!exists("data")) fs.mkdirSync("data", { recursive: true });

if (!exists(seedPath)) {
  const seed = [
    {
      firm: TO_FIRM,
      domain: TO_DOMAIN,
      source: "manual_seed_patch_phase07",
      exposureScore: 92
    }
  ];
  writeIfChanged(seedPath, JSON.stringify(seed, null, 2) + "\n");
  touched++;
} else {
  // If it exists but is empty/invalid JSON, fail closed so we don’t silently corrupt.
  try {
    const parsed = JSON.parse(read(seedPath));
    if (!Array.isArray(parsed) || parsed.length === 0) {
      const seed = [
        {
          firm: TO_FIRM,
          domain: TO_DOMAIN,
          source: "manual_seed_patch_phase07",
          exposureScore: 92
        }
      ];
      writeIfChanged(seedPath, JSON.stringify(seed, null, 2) + "\n");
      touched++;
    }
  } catch {
    throw new Error(`Seed file is not valid JSON: ${seedPath}`);
  }
}

console.log(`Phase 07 complete. Files touched: ${touched}`);

// Final required gate
run("npm run build");
