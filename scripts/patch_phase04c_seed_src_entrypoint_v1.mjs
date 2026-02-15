#!/usr/bin/env node
/**
 * Phase 04C:
 * Seed src entrypoint so TypeScript always has inputs.
 * Harden tsconfig include path.
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

// 1) Create src/index.ts
const entryPath = "src/index.ts";

const entryBody = `
/**
 * IMG Lead Intelligence Engine
 * Bootstrap entrypoint
 */

export const SYSTEM_NAME = "IMG Lead Intelligence Engine";

console.log("IMG-LIE bootstrap initialized");
`;

writeIfChanged(entryPath,entryBody);

// 2) Harden tsconfig.json
const tsconfigPath = "tsconfig.json";

const tsconfig = {
  compilerOptions: {
    target: "ES2022",
    module: "NodeNext",
    moduleResolution: "NodeNext",
    outDir: "dist",
    rootDir: "src",
    strict: true,
    esModuleInterop: true,
    resolveJsonModule: true,
    skipLibCheck: true
  },
  include: ["src/**/*.ts"],
  exclude: ["dist","node_modules"]
};

writeIfChanged(tsconfigPath,JSON.stringify(tsconfig,null,2)+"\n");

// 3) Final build gate
run("npm run build");
