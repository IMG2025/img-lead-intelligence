#!/usr/bin/env node
/**
 * Phase 06: Generate GoDaddy DNS manifest for IMG subdomains + Zoho mail.
 * - Creates infra/dns/godaddy/records.template.json + records.template.csv
 * - Creates infra/dns/godaddy/ZOHO_VALUES.env (placeholders to paste Zoho-provided values)
 * - Creates scripts/infra/validate_dns_v1.mjs to verify live DNS after you apply in GoDaddy
 * Idempotent. Ends with npm run build.
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

function run(cmd){ execSync(cmd,{stdio:"inherit"}); }
function sh(cmd){ return execSync(cmd,{encoding:"utf8"}).trim(); }
function exists(p){ return fs.existsSync(p); }
function read(p){ return fs.readFileSync(p,"utf8"); }
function writeIfChanged(p,next){
  const prev = exists(p)?read(p):"";
  if(prev!==next){
    fs.mkdirSync(path.dirname(p),{recursive:true});
    fs.writeFileSync(p,next);
  }
}

const ROOT = sh("git rev-parse --show-toplevel");
process.chdir(ROOT);

const BASE_DOMAIN = "impulsemediagroup.com";
const SUBDOMAINS = ["outreach", "intelligence", "connect"].map(s => `${s}.${BASE_DOMAIN}`);

// Zoho MX targets (domain-level; subdomains can also have MX if using mailbox addresses on subdomains)
const ZOHO_MX = [
  { priority: 10, host: "mx.zoho.com" },
  { priority: 20, host: "mx2.zoho.com" },
  { priority: 50, host: "mx3.zoho.com" }
];

// DMARC baseline (tighten later)
const DMARC_VALUE = "v=DMARC1; p=none; rua=mailto:dmarc@" + BASE_DOMAIN + "; ruf=mailto:dmarc@" + BASE_DOMAIN + "; fo=1; adkim=s; aspf=s; pct=100";

// SPF baseline for Zoho Mail. (If you also send via other systems later, we will merge includes.)
const SPF_VALUE = "v=spf1 include:zoho.com ~all";

// Placeholders (to be copied from Zoho Admin Console)
const placeholders = {
  // Zoho domain verification TXT record usually looks like: zoho-verification=zb12345678.zmverify.zoho.com
  ZOHO_DOMAIN_VERIFY_TXT_HOST: "@",
  ZOHO_DOMAIN_VERIFY_TXT_VALUE: "PASTE_FROM_ZOHO_ADMIN__DOMAIN_VERIFICATION_TXT_VALUE",

  // DKIM: Zoho provides a selector and a TXT value
  ZOHO_DKIM_SELECTOR: "PASTE_SELECTOR_FROM_ZOHO_ADMIN__e.g._zmail",
  ZOHO_DKIM_TXT_VALUE: "PASTE_FROM_ZOHO_ADMIN__DKIM_PUBLIC_KEY_TXT_VALUE"
};

const envPath = "infra/dns/godaddy/ZOHO_VALUES.env";
const envBody =
`# Paste Zoho-provided values here (from Zoho Mail Admin Console)
# Then re-run:
#   node scripts/infra/render_dns_from_env_v1.mjs
# This file is safe to keep private. Do NOT commit real keys.

ZOHO_DOMAIN_VERIFY_TXT_HOST=${placeholders.ZOHO_DOMAIN_VERIFY_TXT_HOST}
ZOHO_DOMAIN_VERIFY_TXT_VALUE=${placeholders.ZOHO_DOMAIN_VERIFY_TXT_VALUE}

ZOHO_DKIM_SELECTOR=${placeholders.ZOHO_DKIM_SELECTOR}
ZOHO_DKIM_TXT_VALUE=${placeholders.ZOHO_DKIM_TXT_VALUE}
`;
writeIfChanged(envPath, envBody);

// Core record set template (records that do NOT require Zoho-generated values)


const records = [];

// Root SPF
records.push({ type:"TXT", name:"@", value: SPF_VALUE, ttl: 3600, note:"SPF for Zoho Mail (root domain). Merge later if adding other senders." });

// Root DMARC
records.push({ type:"TXT", name:"_dmarc", value: DMARC_VALUE, ttl: 3600, note:"DMARC baseline (monitor). Tighten to quarantine/reject after warmup stability." });

// Root MX (Zoho)
for(const mx of ZOHO_MX){
  records.push({ type:"MX", name:"@", value: mx.host, priority: mx.priority, ttl: 3600, note:"Zoho Mail MX (root domain)." });
}

// Optional: subdomain MX (ONLY if you intend to use mailboxes like alex@outreach.impulsemediagroup.com).
// Zoho supports this; we add them so subdomain-address mail routes properly.
for(const sd of ["outreach","intelligence","connect"]){
  for(const mx of ZOHO_MX){
    records.push({ type:"MX", name: sd, value: mx.host, priority: mx.priority, ttl: 3600, note:`Zoho Mail MX for ${sd}.${BASE_DOMAIN} (required if using mailboxes on this subdomain).` });
  }
  // SPF TXT at subdomain (some providers respect root SPF, but explicit SPF reduces ambiguity)
  records.push({ type:"TXT", name: sd, value: SPF_VALUE, ttl: 3600, note:`SPF for ${sd}.${BASE_DOMAIN} (explicit).` });

  // DMARC for subdomain can inherit root; we keep root-only for simplicity.
}

// Records requiring Zoho-provided values (left as placeholders)
records.push({
  type:"TXT",
  name: "@",
  value: placeholders.ZOHO_DOMAIN_VERIFY_TXT_VALUE,
  ttl: 3600,
  note: "Zoho domain verification TXT value (PASTE actual value into infra/dns/godaddy/ZOHO_VALUES.env then render)."
});

// DKIM record (host = <selector>._domainkey ; value = public key)
records.push({
  type:"TXT",
  name: `${placeholders.ZOHO_DKIM_SELECTOR}._domainkey`,
  value: placeholders.ZOHO_DKIM_TXT_VALUE,
  ttl: 3600,
  note: "Zoho DKIM TXT record. Replace selector + value using ZOHO_VALUES.env then render."
});

// Renderer: takes ZOHO_VALUES.env and outputs final records.json/csv (still no hand edits)
const renderScriptPath = "scripts/infra/render_dns_from_env_v1.mjs";
const renderScript = `#!/usr/bin/env node
/**
 * Render final DNS records from infra/dns/godaddy/ZOHO_VALUES.env (no hand edits to record files).
 * Idempotent.
 */
import fs from "node:fs";
import path from "node:path";

function exists(p){ return fs.existsSync(p); }
function read(p){ return fs.readFileSync(p,"utf8"); }
function writeIfChanged(p,next){
  const prev = exists(p)?read(p):"";
  if(prev!==next){
    fs.mkdirSync(path.dirname(p),{recursive:true});
    fs.writeFileSync(p,next);
  }
}

const envPath = "infra/dns/godaddy/ZOHO_VALUES.env";
if(!exists(envPath)) throw new Error("Missing: " + envPath);

const env = Object.fromEntries(
  read(envPath).split(/\\r?\\n/).map(l=>l.trim()).filter(l=>l && !l.startsWith("#"))
    .map(l=> {
      const idx = l.indexOf("=");
      return [l.slice(0,idx), l.slice(idx+1)];
    })
);

function sub(s){
  return s
    .replaceAll("PASTE_FROM_ZOHO_ADMIN__DOMAIN_VERIFICATION_TXT_VALUE", env.ZOHO_DOMAIN_VERIFY_TXT_VALUE || "")
    .replaceAll("PASTE_SELECTOR_FROM_ZOHO_ADMIN__e.g._zmail", env.ZOHO_DKIM_SELECTOR || "")
    .replaceAll("PASTE_FROM_ZOHO_ADMIN__DKIM_PUBLIC_KEY_TXT_VALUE", env.ZOHO_DKIM_TXT_VALUE || "");
}

const templatePath = "infra/dns/godaddy/records.template.json";
if(!exists(templatePath)) throw new Error("Missing: " + templatePath);

const template = JSON.parse(read(templatePath));
const rendered = template.map((r:any) => ({...r, name: sub(r.name), value: sub(r.value)}));

// Basic guard: ensure Zoho values were actually filled
const missing = [];
if(!env.ZOHO_DOMAIN_VERIFY_TXT_VALUE || env.ZOHO_DOMAIN_VERIFY_TXT_VALUE.includes("PASTE_")) missing.push("ZOHO_DOMAIN_VERIFY_TXT_VALUE");
if(!env.ZOHO_DKIM_SELECTOR || env.ZOHO_DKIM_SELECTOR.includes("PASTE_")) missing.push("ZOHO_DKIM_SELECTOR");
if(!env.ZOHO_DKIM_TXT_VALUE || env.ZOHO_DKIM_TXT_VALUE.includes("PASTE_")) missing.push("ZOHO_DKIM_TXT_VALUE");
if(missing.length) {
  throw new Error("Missing Zoho values in ZOHO_VALUES.env: " + missing.join(", "));
}

const outJson = "infra/dns/godaddy/records.json";
writeIfChanged(outJson, JSON.stringify(rendered, null, 2) + "\\n");

const header = ["Type","Name","Value","TTL","Priority","Note"];
const rows = rendered.map((r:any)=>[
  r.type,
  r.name,
  r.value,
  String(r.ttl ?? 3600),
  r.priority == null ? "" : String(r.priority),
  r.note
]);
const csv = [header, ...rows].map(cols =>
  cols.map(c => {
    const s = String(c ?? "");
    // CSV escape
    return /[",\\n]/.test(s) ? '"' + s.replaceAll('"','""') + '"' : s;
  }).join(",")
).join("\\n") + "\\n";

writeIfChanged("infra/dns/godaddy/records.csv", csv);

console.log("Rendered DNS records:");
console.log(" - infra/dns/godaddy/records.json");
console.log(" - infra/dns/godaddy/records.csv");
`;
writeIfChanged(renderScriptPath, renderScript);

// DNS validator script (after you apply records in GoDaddy)
const validatePath = "scripts/infra/validate_dns_v1.mjs";
const validateScript = `#!/usr/bin/env node
/**
 * Validate live DNS for Zoho mail + SPF/DKIM/DMARC.
 * Usage:
 *   node scripts/infra/validate_dns_v1.mjs
 */
import { execSync } from "node:child_process";
import fs from "node:fs";

function sh(cmd){
  try { return execSync(cmd, { encoding:"utf8" }).trim(); }
  catch(e:any){ return ""; }
}

function dig(name, type){
  // Prefer dig; fall back to nslookup
  const d = sh(\`dig +short \${type} \${name}\`);
  if(d) return d.split(/\\r?\\n/).filter(Boolean);
  const n = sh(\`nslookup -type=\${type} \${name}\`);
  if(!n) return [];
  // crude parse
  return n.split(/\\r?\\n/).filter(l => l.includes("text =") || l.includes("mail exchanger") || l.includes("canonical name") || l.includes("address"));
}

const base = "${BASE_DOMAIN}";
const subs = ["outreach","intelligence","connect"].map(s=>\`\${s}.\${base}\`);

const checks = [
  { name: base, type:"MX", expect:["mx.zoho.com","mx2.zoho.com","mx3.zoho.com"] },
  { name: base, type:"TXT", expect:["v=spf1"] },
  { name: "_dmarc."+base, type:"TXT", expect:["v=DMARC1"] }
];

for(const s of ["outreach","intelligence","connect"]){
  checks.push({ name: s+"."+base, type:"MX", expect:["mx.zoho.com"] });
  checks.push({ name: s+"."+base, type:"TXT", expect:["v=spf1"] });
}

// DKIM selector read from env if present
const envPath = "infra/dns/godaddy/ZOHO_VALUES.env";
if(fs.existsSync(envPath)){
  const env = Object.fromEntries(
    fs.readFileSync(envPath,"utf8").split(/\\r?\\n/).map(l=>l.trim()).filter(l=>l && !l.startsWith("#"))
      .map(l=>{ const i=l.indexOf("="); return [l.slice(0,i), l.slice(i+1)]; })
  );
  if(env.ZOHO_DKIM_SELECTOR){
    checks.push({ name: \`\${env.ZOHO_DKIM_SELECTOR}._domainkey.\${base}\`, type:"TXT", expect:["v=DKIM1","p="] });
  }
}

let failures = 0;
for(const c of checks){
  const got = dig(c.name, c.type);
  const joined = got.join(" | ");
  const ok = c.expect.every(e => joined.includes(e));
  const status = ok ? "OK" : "FAIL";
  if(!ok) failures++;
  console.log(\`[\${status}] \${c.type} \${c.name}\\n  got: \${joined || "(none)"}\\n  expect: \${c.expect.join(" + ")}\\n\`);
}

if(failures){
  process.exitCode = 1;
  console.error("DNS validation failed:", failures, "check(s). Apply records in GoDaddy and wait for propagation.");
} else {
  console.log("DNS validation passed.");
}
`;
writeIfChanged(validatePath, validateScript);

// Write templates
writeIfChanged("infra/dns/godaddy/records.template.json", JSON.stringify(records, null, 2) + "\n");

// CSV template (contains placeholders for Zoho values)
const header = ["Type","Name","Value","TTL","Priority","Note"];
const rows = records.map(r=>[
  r.type,
  r.name,
  r.value,
  String(r.ttl ?? 3600),
  r.priority == null ? "" : String(r.priority),
  r.note
]);
const csv = [header, ...rows].map(cols =>
  cols.map(c => {
    const s = String(c ?? "");
    return /[",\n]/.test(s) ? '"' + s.replaceAll('"','""') + '"' : s;
  }).join(",")
).join("\n") + "\n";
writeIfChanged("infra/dns/godaddy/records.template.csv", csv);

// Make infra scripts executable (best-effort)
try { fs.chmodSync(renderScriptPath, 0o755); } catch {}
try { fs.chmodSync(validatePath, 0o755); } catch {}

run("npm run build");
