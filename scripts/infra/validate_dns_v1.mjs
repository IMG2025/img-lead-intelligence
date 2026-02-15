#!/usr/bin/env node
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
  const d = sh(`dig +short ${type} ${name}`);
  if(d) return d.split(/\r?\n/).filter(Boolean);
  const n = sh(`nslookup -type=${type} ${name}`);
  if(!n) return [];
  // crude parse
  return n.split(/\r?\n/).filter(l => l.includes("text =") || l.includes("mail exchanger") || l.includes("canonical name") || l.includes("address"));
}

const base = "impulsemediagroup.com";
const subs = ["outreach","intelligence","connect"].map(s=>`${s}.${base}`);

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
    fs.readFileSync(envPath,"utf8").split(/\r?\n/).map(l=>l.trim()).filter(l=>l && !l.startsWith("#"))
      .map(l=>{ const i=l.indexOf("="); return [l.slice(0,i), l.slice(i+1)]; })
  );
  if(env.ZOHO_DKIM_SELECTOR){
    checks.push({ name: `${env.ZOHO_DKIM_SELECTOR}._domainkey.${base}`, type:"TXT", expect:["v=DKIM1","p="] });
  }
}

let failures = 0;
for(const c of checks){
  const got = dig(c.name, c.type);
  const joined = got.join(" | ");
  const ok = c.expect.every(e => joined.includes(e));
  const status = ok ? "OK" : "FAIL";
  if(!ok) failures++;
  console.log(`[${status}] ${c.type} ${c.name}\n  got: ${joined || "(none)"}\n  expect: ${c.expect.join(" + ")}\n`);
}

if(failures){
  process.exitCode = 1;
  console.error("DNS validation failed:", failures, "check(s). Apply records in GoDaddy and wait for propagation.");
} else {
  console.log("DNS validation passed.");
}
