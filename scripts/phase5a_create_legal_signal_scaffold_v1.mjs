#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

function run(cmd){ execSync(cmd,{stdio:"inherit"}); }

const dirs = [
  "src/signals/legal",
  "src/resolution",
  "src/scoring",
  "src/storage",
  "data"
];

dirs.forEach(d=>{
  fs.mkdirSync(d,{recursive:true});
  console.log("Ensured:",d);
});

run("npm run build");
