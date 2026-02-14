#!/usr/bin/env node
/**
 * Phase 05 baseline lock:
 * - Ensure dist + node_modules ignored
 * - Ensure package scripts exist
 * - Ensure README exists
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

// .gitignore
const giPath = ".gitignore";
const gi = new Set((exists(giPath)?read(giPath):"").split("\n").map(s=>s.trim()).filter(Boolean));
["node_modules","dist",".env","*.log",".DS_Store"].forEach(x=>gi.add(x));
writeIfChanged(giPath, Array.from(gi).join("\n") + "\n");

// package.json scripts
const pkgPath = "package.json";
if(!exists(pkgPath)) throw new Error("Missing package.json");
const pkg = JSON.parse(read(pkgPath));
pkg.scripts = pkg.scripts || {};
pkg.scripts.build = pkg.scripts.build || "tsc";
pkg.scripts.start = pkg.scripts.start || "node dist/index.js";
writeIfChanged(pkgPath, JSON.stringify(pkg,null,2) + "\n");

// README
const readmePath = "README.md";
if(!exists(readmePath)){
  writeIfChanged(readmePath, `# IMG Lead Intelligence Engine\n\nBootstrap repository.\n`);
}

// Final gate
run("npm run build");
