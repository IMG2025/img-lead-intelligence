#!/usr/bin/env node
/**
 * Phase 06C:
 * Remove TypeScript ":any" annotations from infra scripts.
 * Idempotent. Ends with npm run build.
 */

import fs from "node:fs";
import { execSync } from "node:child_process";

function run(cmd){ execSync(cmd,{stdio:"inherit"}); }

const target = "scripts/infra/render_dns_from_env_v1.mjs";

if(!fs.existsSync(target)){
  console.log("Target not found — skipping.");
  process.exit(0);
}

let content = fs.readFileSync(target,"utf8");

// Remove :any annotations
content = content.replace(/:any/g,"");

// Remove leftover TS generic patterns if present
content = content.replace(/<any>/g,"");

fs.writeFileSync(target,content);

console.log("Removed TypeScript ':any' annotations from render script.");

// Build gate
run("npm run build");
