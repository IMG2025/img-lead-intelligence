#!/usr/bin/env node
/**
 * Phase 5B: Add Legal Ops Contact Mapper (Option A)
 * - Adds HTML parsing via cheerio
 * - Adds resolution module + orchestrator script
 * - Idempotent file writes
 * - Required gate: npm run build (final)
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

function run(cmd){ execSync(cmd, { stdio: "inherit" }); }
function exists(p){ return fs.existsSync(p); }
function read(p){ return fs.readFileSync(p, "utf8"); }
function writeIfChanged(p, next){
  const prev = exists(p) ? read(p) : "";
  if (prev !== next){
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, next);
    console.log("Wrote:", p);
  } else {
    console.log("Unchanged:", p);
  }
}

const ROOT = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();
process.chdir(ROOT);

// 1) Ensure dependency (cheerio)
if (!exists("package.json")) throw new Error("Missing package.json");
const pkg = JSON.parse(read("package.json"));

pkg.dependencies ||= {};
const hasCheerio = typeof pkg.dependencies["cheerio"] === "string";

// Pin conservatively; you can bump later
if (!hasCheerio){
  pkg.dependencies["cheerio"] = "^1.0.0-rc.12";
  writeIfChanged("package.json", JSON.stringify(pkg, null, 2) + "\n");
  // install only if we changed deps
  run("npm install");
} else {
  console.log("Dependency already present: cheerio");
}

// 2) Add role taxonomy
writeIfChanged("src/resolution/legal_role_taxonomy.ts", `export const ROLE_KEYWORDS = [
  // Legal Ops / Operations
  "legal operations",
  "law firm operations",
  "director of operations",
  "operations director",

  // IT / Tech leadership
  "cio",
  "chief information officer",
  "cto",
  "chief technology officer",
  "it director",
  "director of it",
  "head of it",
  "technology director",
  "director of technology",
  "vp of technology",

  // Innovation
  "innovation",
  "legal innovation",
  "innovation officer",
  "director of innovation",

  // Knowledge / KM
  "knowledge management",
  "km",
  "director of knowledge",
  "knowledge director",
  "knowledge officer",
  "director of knowledge management",

  // Litigation support / eDiscovery
  "litigation support",
  "ediscovery",
  "e-discovery",
  "director of litigation support",
  "litigation technology",
  "litigation technologist",
  "director of ediscovery",
  "ediscovery manager"
] as const;

export function isTargetRole(roleText: string): boolean {
  const t = (roleText || "").toLowerCase();
  return ROLE_KEYWORDS.some(k => t.includes(k));
}
`);

// 3) Add HTML extractor
writeIfChanged("src/resolution/legal_contact_extractor.ts", `import * as cheerio from "cheerio";
import { isTargetRole } from "./legal_role_taxonomy.js";

export type Contact = {
  name: string;
  role: string;
  profileUrl?: string;
  sourceUrl: string;
  evidenceText: string;
  confidence: number; // 0-1
};

function clean(s: string): string {
  return (s || "").replace(/\\s+/g, " ").trim();
}

/**
 * Heuristic extraction:
 * - Look for elements that resemble a person card (name + role in proximity)
 * - Filter to target roles only (Option A)
 */
export function extractContactsFromHtml(html: string, sourceUrl: string): Contact[] {
  const $ = cheerio.load(html);
  const results: Contact[] = [];

  // Candidate containers
  const containers = [
    "[class*='person']",
    "[class*='profile']",
    "[class*='bio']",
    "[class*='team']",
    "[class*='card']",
    "article",
    "li",
    "div"
  ];

  const seen = new Set<string>();

  for (const sel of containers) {
    $(sel).each((_i, el) => {
      const text = clean($(el).text());
      if (text.length < 20) return;

      // Find a likely name: prefer headings
      const name =
        clean($(el).find("h1,h2,h3,h4,strong").first().text()) ||
        clean($(el).find("a").first().text());

      if (!name || name.length < 3) return;

      // Find role-ish text: look for common role containers
      const role =
        clean($(el).find("[class*='title'],[class*='role'],[class*='position']").first().text()) ||
        // fallback: second line heuristic
        clean(text.split(" ").slice(0, 30).join(" "));

      if (!isTargetRole(role) && !isTargetRole(text)) return;

      // Profile URL (best-effort)
      const href = $(el).find("a[href]").first().attr("href") || "";
      const profileUrl = href ? href : undefined;

      const key = (name + "|" + (role || "")).toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);

      // confidence heuristic
      let confidence = 0.45;
      if (isTargetRole(role)) confidence += 0.35;
      if ($(el).find("[class*='title'],[class*='role'],[class*='position']").length > 0) confidence += 0.1;
      if (profileUrl) confidence += 0.1;
      confidence = Math.min(0.98, confidence);

      results.push({
        name: clean(name),
        role: clean(role),
        profileUrl,
        sourceUrl,
        evidenceText: text.slice(0, 240),
        confidence
      });
    });

    if (results.length >= 25) break; // cap per page
  }

  return results;
}
`);

// 4) Add small fetcher (polite)
writeIfChanged("src/resolution/polite_fetch.ts", `export type FetchResult = { url: string; ok: boolean; status: number; text?: string; error?: string };

function sleep(ms: number){ return new Promise(r => setTimeout(r, ms)); }

export async function fetchText(url: string, opts?: { timeoutMs?: number; minDelayMs?: number }): Promise<FetchResult> {
  const timeoutMs = opts?.timeoutMs ?? 12000;
  const minDelayMs = opts?.minDelayMs ?? 750;

  await sleep(minDelayMs);

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "user-agent": "IMG-Lead-Intelligence/1.0 (contact-mapper; +https://impulsemediagroup.com)",
        "accept": "text/html,application/xhtml+xml"
      }
    });
    const status = res.status;
    if (!res.ok) return { url, ok: false, status, error: "HTTP_" + status };
    const text = await res.text();
    return { url, ok: true, status, text };
  } catch (e: any) {
    return { url, ok: false, status: 0, error: e?.name === "AbortError" ? "TIMEOUT" : String(e?.message || e) };
  } finally {
    clearTimeout(t);
  }
}
`);

// 5) Add orchestrator (runtime script uses dist)
writeIfChanged("scripts/run_legal_contact_mapper_v1.mjs", `#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fetchText } from "../dist/resolution/polite_fetch.js";
import { extractContactsFromHtml } from "../dist/resolution/legal_contact_extractor.js";

function readJson(p){
  return JSON.parse(fs.readFileSync(p, "utf8"));
}
function writeJson(p, obj){
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2));
}

const INPUT = "data/legal_signal_leads.json";
const OUTPUT = "data/legal_contacts.json";

const leads = fs.existsSync(INPUT) ? readJson(INPUT) : [];
if (!Array.isArray(leads) || leads.length === 0){
  console.log("No leads found at", INPUT, "- writing empty contacts file.");
  writeJson(OUTPUT, []);
  process.exit(0);
}

const PATHS = [
  "/people",
  "/team",
  "/leadership",
  "/about",
  "/attorneys",
  "/professionals",
  "/our-people",
  "/who-we-are"
];

const allContacts = [];
for (const lead of leads){
  const firm = lead.firm || lead.name || "unknown";
  const domain = lead.domain || "";
  if (!domain || typeof domain !== "string"){
    continue;
  }

  const base = domain.startsWith("http") ? domain : "https://" + domain.replace(/\\/$/, "");
  console.log("\\nFirm:", firm, "→", base);

  let firmContacts = [];
  for (const p of PATHS){
    const url = base + p;
    const res = await fetchText(url, { timeoutMs: 12000, minDelayMs: 750 });
    if (!res.ok){
      console.log("  skip", url, "(", res.error || res.status, ")");
      continue;
    }
    const contacts = extractContactsFromHtml(res.text || "", url);
    if (contacts.length){
      console.log("  hit", url, "→", contacts.length, "candidates");
      firmContacts.push(...contacts);
    } else {
      console.log("  no match", url);
    }
    if (firmContacts.length >= 30) break; // cap per firm
  }

  // De-dupe within firm
  const seen = new Set();
  firmContacts = firmContacts.filter(c=>{
    const k = (c.name + "|" + c.role).toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  allContacts.push({
    firm,
    domain,
    source: lead.source || "legal_signal_harvester",
    exposureScore: lead.exposureScore ?? null,
    contacts: firmContacts
  });
}

writeJson(OUTPUT, allContacts);
console.log("\\nWrote:", OUTPUT);
`);

// ensure executable bit (best-effort)
try { fs.chmodSync("scripts/run_legal_contact_mapper_v1.mjs", 0o755); } catch {}

run("node --check scripts/run_legal_contact_mapper_v1.mjs");

// Final required gate
run("npm run build");
