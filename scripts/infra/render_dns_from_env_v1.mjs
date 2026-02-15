#!/usr/bin/env node
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
  read(envPath).split(/\r?\n/).map(l=>l.trim()).filter(l=>l && !l.startsWith("#"))
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
const rendered = template.map((r) => ({...r, name: sub(r.name), value: sub(r.value)}));

// Basic guard: ensure Zoho values were actually filled
const missing = [];
if(!env.ZOHO_DOMAIN_VERIFY_TXT_VALUE || env.ZOHO_DOMAIN_VERIFY_TXT_VALUE.includes("PASTE_")) missing.push("ZOHO_DOMAIN_VERIFY_TXT_VALUE");
if(!env.ZOHO_DKIM_SELECTOR || env.ZOHO_DKIM_SELECTOR.includes("PASTE_")) missing.push("ZOHO_DKIM_SELECTOR");
if(!env.ZOHO_DKIM_TXT_VALUE || env.ZOHO_DKIM_TXT_VALUE.includes("PASTE_")) missing.push("ZOHO_DKIM_TXT_VALUE");
if(missing.length) {
  throw new Error("Missing Zoho values in ZOHO_VALUES.env: " + missing.join(", "));
}

const outJson = "infra/dns/godaddy/records.json";
writeIfChanged(outJson, JSON.stringify(rendered, null, 2) + "\n");

const header = ["Type","Name","Value","TTL","Priority","Note"];
const rows = rendered.map((r)=>[
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
    return /[",\n]/.test(s) ? '"' + s.replaceAll('"','""') + '"' : s;
  }).join(",")
).join("\n") + "\n";

writeIfChanged("infra/dns/godaddy/records.csv", csv);

console.log("Rendered DNS records:");
console.log(" - infra/dns/godaddy/records.json");
console.log(" - infra/dns/godaddy/records.csv");
