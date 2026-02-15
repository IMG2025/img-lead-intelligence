#!/usr/bin/env node
/**
 * Phase 04 fix: TS18003 "No inputs were found"
 * - Create minimal src/index.ts so tsc always has at least one input.
 * - Harden tsconfig.json to compile src/(all ts files) into dist/.
 * - Idempotent. Gates: node --check + npm run build. Ends with npm run build.
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

function run(cmd) { execSync(cmd, { stdio: "inherit" }); }
function sh(cmd) { return execSync(cmd, { encoding: "utf8" }).trim(); }

function exists(p) { return fs.existsSync(p); }
function read(p) { return fs.readFileSync(p, "utf8"); }
function writeIfChanged(p, next) {
  const prev = exists(p) ? read(p) : "";
  if (prev !== next) {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, next);
  }
}

const ROOT = sh("git rev-parse --show-toplevel");
process.chdir(ROOT);

// 1) Ensure src/index.ts exists (minimal placeholder)
const entry = path.join("src", "index.ts");
const entryBody = `/**
 * IMG Lead Intelligence Engine
 * Bootstrap entrypoint (placeholder).
 */
export const IMG_LIE_VERSION = "0.0.0";
`;
writeIfChanged(entry, entryBody);

// 2) Write hardened tsconfig.json (src-only inputs)
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
  include: ["src/(all ts files)"],
  exclude: ["dist", "node_modules"]
};
writeIfChanged(tsconfigPath, JSON.stringify(tsconfig, null, 2) + "\n");

// 3) Gate: syntax check this script
run(`node --check ${path.join("scripts","patch_phase04_fix_tsc_no_inputs_v1.mjs")}`);

// 4) Final required gate
run("npm run build");
