#!/usr/bin/env node
/**
 * Phase 04B fix:
 * Replace unsafe glob comment causing Node syntax break.
 * Idempotent. Ends with npm run build.
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

function run(cmd){ execSync(cmd,{stdio:"inherit"}); }
function exists(p){ return fs.existsSync(p); }
function read(p){ return fs.readFileSync(p,"utf8"); }
function writeIfChanged(p,next){
  const prev = exists(p)?read(p):"";
  if(prev!==next){
    fs.mkdirSync(path.dirname(p),{recursive:true});
    fs.writeFileSync(p,next);
  }
}

const scriptPath = "scripts/patch_phase04_fix_tsc_no_inputs_v1.mjs";

if(exists(scriptPath)){
  let content = read(scriptPath);

  content = content.replace(
    /src\/\*\*\/\*\.ts/g,
    "src/(all ts files)"
  );

  writeIfChanged(scriptPath,content);
}

run("npm run build");
