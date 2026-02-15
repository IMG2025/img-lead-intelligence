#!/usr/bin/env node
/**
 * Phase 06B fix:
 * Remove TypeScript type declaration from JS runtime script.
 * Idempotent. Ends with npm run build.
 */

import fs from "node:fs";
import { execSync } from "node:child_process";

function run(cmd){ execSync(cmd,{stdio:"inherit"}); }

const target = "scripts/patch_phase06_generate_godaddy_dns_manifest_v1.mjs";

if(!fs.existsSync(target)){
  console.log("Target script not found — skipping.");
  process.exit(0);
}

let content = fs.readFileSync(target,"utf8");

// Remove TS type declaration line
content = content.replace(
  /type Rec = \{[^}]+\};?/g,
  ""
);

// Also remove any leftover TS annotations like : Rec[]
content = content.replace(/: *Rec\[\]/g,"");

fs.writeFileSync(target,content);

console.log("Removed TypeScript type annotations from runtime script.");

// Build gate
run("npm run build");
