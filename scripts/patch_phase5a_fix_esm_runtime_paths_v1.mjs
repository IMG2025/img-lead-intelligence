#!/usr/bin/env node
import fs from "node:fs";
import { execSync } from "node:child_process";

function run(cmd){
  execSync(cmd,{stdio:"inherit"});
}

const target = "scripts/run_legal_signal_harvester_v1.mjs";

if(!fs.existsSync(target)){
  console.log("Harvester script not found — skipping.");
  process.exit(0);
}

let content = fs.readFileSync(target,"utf8");

content = content
.replaceAll("../src/","../dist/")
.replaceAll(".ts",".js");

fs.writeFileSync(target,content);

console.log("Patched runtime imports → dist layer.");

run("npm run build");
