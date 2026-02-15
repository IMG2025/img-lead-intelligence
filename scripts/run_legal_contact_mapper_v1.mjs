#!/usr/bin/env node
/**
 * Legal Contact Mapper Runner (v1) — Precision mode (Option A)
 * - Reads data/legal_signal_leads.json (or falls back to a minimal seed)
 * - Maps firm -> contacts using dist/resolution/legal_contact_mapper_v2.js
 * - Writes data/legal_contacts.json
 * Idempotent by design.
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

function sh(cmd){ return execSync(cmd, { encoding: "utf8" }).trim(); }
function exists(p){ return fs.existsSync(p); }
function read(p){ return fs.readFileSync(p, "utf8"); }
function write(p, s){ fs.writeFileSync(p, s); }

const ROOT = sh("git rev-parse --show-toplevel");
process.chdir(ROOT);

const { mapFirmContacts } = await import("../dist/resolution/legal_contact_mapper_v2.js");

if (!exists("data")) fs.mkdirSync("data", { recursive: true });

const seedPath = path.join("data", "legal_signal_leads.json");
let seeds = [];
if (exists(seedPath)) {
  const raw = read(seedPath);
  seeds = JSON.parse(raw);
  if (!Array.isArray(seeds)) throw new Error("data/legal_signal_leads.json must be a JSON array.");
}
if (seeds.length === 0) {
  seeds = [{ firm: "Cooley LLP", domain: "cooley.com", source: "fallback_seed", exposureScore: 92 }];
}

const out = [];
for (const s of seeds) {
  if (!s || !s.domain || !s.firm) continue;
  console.log(`Firm: ${s.firm} -> https://${String(s.domain).replace(/^https?:\/\//, "")}`);
  out.push(await mapFirmContacts(s));
}

write(path.join("data", "legal_contacts.json"), JSON.stringify(out, null, 2) + "\n");
console.log("Wrote: data/legal_contacts.json");
