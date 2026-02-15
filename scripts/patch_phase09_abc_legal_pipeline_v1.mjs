#!/usr/bin/env node
/**
 * Phase 09A/09B/09C — Legal pipeline expansion (Option A: precision-only)
 *
 * 09A: Firm ingestion scaling (seed list -> normalized ingest -> health checks)
 * 09B: Exposure deepening (crawl a bounded set of insight endpoints; keyword evidence)
 * 09C: Outreach substrate prep (firm dossiers + heatmap summary; contacts are optional)
 *
 * Constraints:
 * - Zero hand edits (scripted transforms only)
 * - Idempotent (safe re-run)
 * - Enterprise-grade (fail-safe, deterministic outputs)
 * - Must end with: npm run build
 */

import fs from "node:fs";
import path from "node:path";
import dns from "node:dns/promises";
import { execSync } from "node:child_process";

function run(cmd) { execSync(cmd, { stdio: "inherit" }); }
function sh(cmd) { return execSync(cmd, { encoding: "utf8" }).trim(); }
function exists(p) { return fs.existsSync(p); }
function read(p) { return fs.readFileSync(p, "utf8"); }
function mkdirp(p) { fs.mkdirSync(p, { recursive: true }); }
function writeIfChanged(p, next) {
  const prev = exists(p) ? read(p) : "";
  if (prev !== next) {
    mkdirp(path.dirname(p));
    fs.writeFileSync(p, next);
  }
}
function jsonStable(obj) {
  return JSON.stringify(obj, Object.keys(obj).sort(), 2) + "\n";
}
function readJson(p, fallback) {
  if (!exists(p)) return fallback;
  try { return JSON.parse(read(p)); } catch { return fallback; }
}
function nowIso() { return new Date().toISOString(); }

const ROOT = sh("git rev-parse --show-toplevel");
process.chdir(ROOT);

const PKG = "package.json";
if (!exists(PKG)) throw new Error("Missing: package.json");

const pkg = JSON.parse(read(PKG));

pkg.scripts ||= {};
const addScript = (k, v) => { if (!pkg.scripts[k]) pkg.scripts[k] = v; };

// 09A runner
addScript("legal:ingest", "node scripts/run_legal_firm_ingest_v1.mjs");
// 09B runner
addScript("legal:exposure", "node scripts/run_legal_exposure_deepener_v1.mjs");
// 09C runner
addScript("legal:dossiers", "node scripts/run_legal_dossier_builder_v1.mjs");
// Convenience: do all
addScript("legal:phase09", "npm run legal:ingest && npm run legal:exposure && npm run legal:dossiers");

writeIfChanged(PKG, JSON.stringify(pkg, null, 2) + "\n");

// -------------------------
// 09A — Firm ingestion scaling
// -------------------------

writeIfChanged("src/pipeline/legal/normalize.ts", `export type FirmSeed = {
  name: string;
  domain?: string;
  website?: string;
  notes?: string;
};

export type NormalizedFirm = {
  name: string;
  domain: string;
  website: string;
  source: "seed";
  createdAt: string;
  notes?: string;
};

export function normalizeDomain(input: string): string {
  const s = (input || "").trim().toLowerCase();
  const noProto = s.replace(/^https?:\\/\\//, "");
  const noPath = noProto.split("/")[0].trim();
  const noWww = noPath.replace(/^www\\./, "");
  return noWww;
}

export function normalizeFirm(seed: FirmSeed, createdAtIso: string): NormalizedFirm | null {
  const name = (seed.name || "").trim();
  if (!name) return null;

  const domainRaw =
    (seed.domain || "").trim() ||
    normalizeDomain(seed.website || "");

  const domain = normalizeDomain(domainRaw);
  if (!domain || !domain.includes(".")) return null;

  const website = seed.website?.trim() || `https://${domain}`;

  return {
    name,
    domain,
    website,
    source: "seed",
    createdAt: createdAtIso,
    notes: seed.notes?.trim() || undefined
  };
}

export function dedupeFirms(items: NormalizedFirm[]): NormalizedFirm[] {
  const byDomain = new Map<string, NormalizedFirm>();
  for (const f of items) {
    const key = f.domain;
    const prev = byDomain.get(key);
    if (!prev) byDomain.set(key, f);
    else {
      // deterministic merge: keep earliest createdAt, prefer longer name (often more specific)
      const keep = (prev.createdAt <= f.createdAt) ? prev : f;
      const other = keep === prev ? f : prev;
      byDomain.set(key, {
        ...keep,
        name: keep.name.length >= other.name.length ? keep.name : other.name,
        notes: keep.notes || other.notes
      });
    }
  }
  return [...byDomain.values()].sort((a, b) => a.domain.localeCompare(b.domain));
}
`);

writeIfChanged("src/pipeline/legal/health.ts", `export type FirmHealth = {
  domain: string;
  dnsA?: boolean;
  dnsAAAA?: boolean;
  http?: { url: string; status: number } | null;
  https?: { url: string; status: number } | null;
  checkedAt: string;
  error?: string;
};

export function scoreHealth(h: FirmHealth): number {
  // Deterministic: DNS presence matters most, then HTTPS, then HTTP
  let s = 0;
  if (h.dnsA) s += 40;
  if (h.dnsAAAA) s += 10;
  if (h.https && h.https.status >= 200 && h.https.status < 400) s += 40;
  if (h.http && h.http.status >= 200 && h.http.status < 400) s += 10;
  return Math.min(100, s);
}
`);

writeIfChanged("scripts/run_legal_firm_ingest_v1.mjs", `#!/usr/bin/env node
/**
 * 09A runner — ingest firms from seed list, normalize, dedupe, and health-check (DNS + HTTP/S).
 * Option A: does NOT scrape directories, does NOT enrich contacts.
 *
 * Outputs:
 * - data/legal_firms_ingested.json
 * - data/legal_firm_health.json
 *
 * Always ends with npm run build (called by patch gate or by user).
 */
import fs from "node:fs";
import path from "node:path";
import dns from "node:dns/promises";

function exists(p){ return fs.existsSync(p); }
function read(p){ return fs.readFileSync(p,"utf8"); }
function mkdirp(p){ fs.mkdirSync(p,{recursive:true}); }
function writeJson(p,obj){ mkdirp(path.dirname(p)); fs.writeFileSync(p, JSON.stringify(obj,null,2)+"\\n"); }
function nowIso(){ return new Date().toISOString(); }

const SEED = "data/legal_firms_seed.json";
const OUT_INGESTED = "data/legal_firms_ingested.json";
const OUT_HEALTH = "data/legal_firm_health.json";

const seed = exists(SEED) ? JSON.parse(read(SEED)) : [];
if (!Array.isArray(seed)) throw new Error("Seed must be an array: data/legal_firms_seed.json");

const { normalizeFirm, dedupeFirms } = await import("../dist/pipeline/legal/normalize.js");
const createdAt = nowIso();

const normalized = [];
for (const s of seed) {
  const f = normalizeFirm(s, createdAt);
  if (f) normalized.push(f);
}
const ingested = dedupeFirms(normalized);

async function checkDomain(domain){
  const checkedAt = nowIso();
  const res = { domain, dnsA: false, dnsAAAA: false, http: null, https: null, checkedAt };
  try {
    try { await dns.resolve4(domain); res.dnsA = true; } catch {}
    try { await dns.resolve6(domain); res.dnsAAAA = true; } catch {}

    // bounded, fast checks
    const tryFetch = async (url) => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      try {
        const r = await fetch(url, { method: "GET", redirect: "follow", signal: ctrl.signal, headers: { "user-agent": "img-lead-intelligence/1.0" } });
        return { url, status: r.status };
      } catch {
        return null;
      } finally {
        clearTimeout(t);
      }
    };

    res.https = await tryFetch(\`https://\${domain}\`);
    res.http = await tryFetch(\`http://\${domain}\`);
    return res;
  } catch (e) {
    res.error = String(e?.message || e);
    return res;
  }
}

const health = [];
for (const f of ingested) {
  // Only check valid-looking domains
  const h = await checkDomain(f.domain);
  health.push(h);
}

writeJson(OUT_INGESTED, ingested);
writeJson(OUT_HEALTH, health);

console.log(\`Ingested firms: \${ingested.length}\`);
console.log(\`Wrote: \${OUT_INGESTED}\`);
console.log(\`Wrote: \${OUT_HEALTH}\`);
`);

writeIfChanged("data/legal_firms_seed.json", `[
  { "name": "Cooley LLP", "domain": "cooley.com", "notes": "JS directory; Option A will not expand crawl." },
  { "name": "Goodwin", "domain": "goodwinlaw.com" },
  { "name": "Wilson Sonsini", "domain": "wsgr.com" },
  { "name": "Latham & Watkins", "domain": "lw.com" },
  { "name": "Skadden", "domain": "skadden.com" }
]
`);

// -------------------------
// 09B — Exposure deepening (bounded insights crawl)
// -------------------------

writeIfChanged("src/pipeline/legal/exposure.ts", `export type ExposureEvidence = {
  url: string;
  matchedTerms: string[];
  snippet: string;
  confidence: number; // 0..1
};

export type ExposureResult = {
  domain: string;
  website: string;
  checkedAt: string;
  endpointsTried: string[];
  evidences: ExposureEvidence[];
  exposureScore: number; // 0..100
  notes?: string;
};

const TERMS = [
  "artificial intelligence",
  "generative ai",
  "genai",
  "chatgpt",
  "copilot",
  "automation",
  "machine learning",
  "ai act",
  "eu ai act",
  "model risk",
  "governance",
  "compliance",
  "privacy",
  "data security",
  "responsible ai"
];

const ENDPOINTS = [
  "/insights",
  "/publications",
  "/client-alerts",
  "/news",
  "/newsroom",
  "/blog",
  "/thought-leadership"
];

function clamp01(x: number){ return Math.max(0, Math.min(1, x)); }

export function scoreFromEvidences(evs: ExposureEvidence[]): number {
  // deterministic score: # evidences weighted by term diversity and confidence
  const termSet = new Set<string>();
  let sumConf = 0;
  for (const e of evs) {
    sumConf += e.confidence;
    for (const t of e.matchedTerms) termSet.add(t);
  }
  const diversity = termSet.size;
  const base = Math.min(60, evs.length * 10);
  const div = Math.min(25, diversity * 3);
  const conf = Math.min(15, Math.round((sumConf / Math.max(1, evs.length)) * 15));
  return Math.min(100, base + div + conf);
}

export function pickEndpoints(baseUrl: string): string[] {
  return ENDPOINTS.map(p => baseUrl.replace(/\\/$/, "") + p);
}

export function findEvidences(url: string, html: string): ExposureEvidence[] {
  const text = html
    .replace(/<script[\\s\\S]*?<\\/script>/gi, " ")
    .replace(/<style[\\s\\S]*?<\\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\\s+/g, " ")
    .trim()
    .toLowerCase();

  const hits: ExposureEvidence[] = [];

  const matched = TERMS.filter(t => text.includes(t));
  if (matched.length === 0) return hits;

  // conservative snippet: first 220 chars around the first match
  const first = matched[0];
  const idx = text.indexOf(first);
  const start = Math.max(0, idx - 60);
  const end = Math.min(text.length, idx + 160);
  const snippet = text.slice(start, end);

  // confidence is bounded by match count; capped to avoid overclaim
  const confidence = clamp01(0.35 + matched.length * 0.08);

  hits.push({
    url,
    matchedTerms: matched.slice(0, 10),
    snippet,
    confidence
  });

  return hits;
}
`);

writeIfChanged("scripts/run_legal_exposure_deepener_v1.mjs", `#!/usr/bin/env node
/**
 * 09B runner — bounded exposure crawl (Option A compliant)
 *
 * Inputs:
 * - data/legal_firms_ingested.json (from 09A)
 *
 * Outputs:
 * - data/legal_exposure.json
 */
import fs from "node:fs";
import path from "node:path";

function exists(p){ return fs.existsSync(p); }
function read(p){ return fs.readFileSync(p,"utf8"); }
function mkdirp(p){ fs.mkdirSync(p,{recursive:true}); }
function writeJson(p,obj){ mkdirp(path.dirname(p)); fs.writeFileSync(p, JSON.stringify(obj,null,2)+"\\n"); }
function nowIso(){ return new Date().toISOString(); }

const IN = "data/legal_firms_ingested.json";
const OUT = "data/legal_exposure.json";

if (!exists(IN)) {
  console.log(\`Missing \${IN} — run: npm run legal:ingest\`);
  process.exit(0);
}

const firms = JSON.parse(read(IN));
if (!Array.isArray(firms)) throw new Error("Ingested firms must be an array.");

const { pickEndpoints, findEvidences, scoreFromEvidences } = await import("../dist/pipeline/legal/exposure.js");

async function fetchHtml(url){
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: ctrl.signal,
      headers: { "user-agent": "img-lead-intelligence/1.0" }
    });
    if (!r.ok) return { ok: false, status: r.status, html: "" };
    const ct = (r.headers.get("content-type") || "").toLowerCase();
    if (!ct.includes("text/html")) return { ok: false, status: r.status, html: "" };
    const html = await r.text();
    return { ok: true, status: r.status, html };
  } catch {
    return { ok: false, status: 0, html: "" };
  } finally {
    clearTimeout(t);
  }
}

const results = [];

for (const f of firms) {
  const checkedAt = nowIso();
  const base = (f.website || \`https://\${f.domain}\`).replace(/\\/$/, "");
  const endpoints = pickEndpoints(base);

  const evidences = [];
  const tried = [];

  // bounded crawl: at most 4 endpoints per firm, deterministic order
  for (const url of endpoints.slice(0, 4)) {
    tried.push(url);
    const { ok, html } = await fetchHtml(url);
    if (!ok) continue;

    const evs = findEvidences(url, html);
    for (const e of evs) evidences.push(e);

    // stop early if we have enough evidence
    if (evidences.length >= 3) break;
  }

  const exposureScore = scoreFromEvidences(evidences);

  results.push({
    domain: f.domain,
    website: base,
    checkedAt,
    endpointsTried: tried,
    evidences,
    exposureScore,
    notes: f.notes || undefined
  });
}

writeJson(OUT, results);
console.log(\`Wrote: \${OUT}\`);
`);


// -------------------------
// 09C — Outreach substrate prep (dossiers + heatmap)
// -------------------------

writeIfChanged("src/pipeline/legal/dossiers.ts", `export type Dossier = {
  firm: string;
  domain: string;
  website: string;
  generatedAt: string;
  exposureScore: number;
  exposureEvidenceTop: Array<{ url: string; matchedTerms: string[]; snippet: string; confidence: number }>;
  contactsPresent: boolean;
  outreachAngle: string;
};

export type Heatmap = {
  generatedAt: string;
  bands: Array<{ band: string; min: number; max: number; count: number }>;
  topFirms: Array<{ domain: string; exposureScore: number }>;
};

export function band(score: number): string {
  if (score >= 80) return "HIGH";
  if (score >= 50) return "MEDIUM";
  return "LOW";
}

export function outreachAngleFromScore(score: number): string {
  if (score >= 80) return "High AI surface area — governance readiness + policy controls + client risk messaging.";
  if (score >= 50) return "Emerging AI surface — tighten risk controls, internal policy, and vendor governance.";
  return "Low explicit AI surface — baseline governance posture and monitoring to prevent silent adoption risk.";
}
`);

writeIfChanged("scripts/run_legal_dossier_builder_v1.mjs", `#!/usr/bin/env node
/**
 * 09C runner — build firm dossiers + heatmap (Option A compliant)
 *
 * Inputs:
 * - data/legal_firms_ingested.json
 * - data/legal_exposure.json
 * - (optional) data/legal_contacts.json
 *
 * Outputs:
 * - data/legal_dossiers.json
 * - data/legal_heatmap.json
 */
import fs from "node:fs";
import path from "node:path";

function exists(p){ return fs.existsSync(p); }
function read(p){ return fs.readFileSync(p,"utf8"); }
function mkdirp(p){ fs.mkdirSync(p,{recursive:true}); }
function writeJson(p,obj){ mkdirp(path.dirname(p)); fs.writeFileSync(p, JSON.stringify(obj,null,2)+"\\n"); }
function nowIso(){ return new Date().toISOString(); }

const IN_FIRMS = "data/legal_firms_ingested.json";
const IN_EXPO = "data/legal_exposure.json";
const IN_CONTACTS = "data/legal_contacts.json";

const OUT_DOSSIERS = "data/legal_dossiers.json";
const OUT_HEATMAP = "data/legal_heatmap.json";

if (!exists(IN_FIRMS)) { console.log(\`Missing \${IN_FIRMS} — run: npm run legal:ingest\`); process.exit(0); }
if (!exists(IN_EXPO)) { console.log(\`Missing \${IN_EXPO} — run: npm run legal:exposure\`); process.exit(0); }

const firms = JSON.parse(read(IN_FIRMS));
const expo = JSON.parse(read(IN_EXPO));
const contacts = exists(IN_CONTACTS) ? JSON.parse(read(IN_CONTACTS)) : [];

const byDomain = new Map();
for (const e of expo) byDomain.set(e.domain, e);

const contactsByDomain = new Map();
if (Array.isArray(contacts)) {
  for (const c of contacts) contactsByDomain.set(c.domain, c);
}

const { outreachAngleFromScore } = await import("../dist/pipeline/legal/dossiers.js");

const generatedAt = nowIso();
const dossiers = [];

for (const f of firms) {
  const e = byDomain.get(f.domain) || { exposureScore: 0, evidences: [] };
  const c = contactsByDomain.get(f.domain);
  const exposureEvidenceTop = (e.evidences || []).slice(0, 3);

  dossiers.push({
    firm: f.name,
    domain: f.domain,
    website: f.website,
    generatedAt,
    exposureScore: e.exposureScore || 0,
    exposureEvidenceTop,
    contactsPresent: Boolean(c && Array.isArray(c.contacts) && c.contacts.length > 0),
    outreachAngle: outreachAngleFromScore(e.exposureScore || 0)
  });
}

dossiers.sort((a,b)=> (b.exposureScore - a.exposureScore) || a.domain.localeCompare(b.domain));

const bands = [
  { band: "HIGH", min: 80, max: 100, count: dossiers.filter(d => d.exposureScore >= 80).length },
  { band: "MEDIUM", min: 50, max: 79, count: dossiers.filter(d => d.exposureScore >= 50 && d.exposureScore < 80).length },
  { band: "LOW", min: 0, max: 49, count: dossiers.filter(d => d.exposureScore < 50).length },
];

const heatmap = {
  generatedAt,
  bands,
  topFirms: dossiers.slice(0, 10).map(d => ({ domain: d.domain, exposureScore: d.exposureScore }))
};

writeJson(OUT_DOSSIERS, dossiers);
writeJson(OUT_HEATMAP, heatmap);

console.log(\`Wrote: \${OUT_DOSSIERS}\`);
console.log(\`Wrote: \${OUT_HEATMAP}\`);
`);


// -------------------------
// Gates
// -------------------------

// 1) node --check (touched runtime scripts)
run("node --check scripts/run_legal_firm_ingest_v1.mjs");
run("node --check scripts/run_legal_exposure_deepener_v1.mjs");
run("node --check scripts/run_legal_dossier_builder_v1.mjs");
run("node --check scripts/patch_phase09_abc_legal_pipeline_v1.mjs");

// 2) Required final gate
run("npm run build");

console.log("Phase 09A/09B/09C installed (Option A).");
