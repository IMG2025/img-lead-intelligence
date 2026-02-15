#!/usr/bin/env node
import fs from "fs";
import { execSync } from "child_process";

function ensure(p){ if(!fs.existsSync(p)) fs.mkdirSync(p,{recursive:true}); }

const dirs = [
  "infra/dns",
  "infra/mailboxes",
  "infra/auth",
  "infra/warmup",
  "data/acquisition",
  "data/parsers",
  "data/storage",
  "enrichment/agents",
  "enrichment/prompts",
  "scoring/models",
  "scoring/classifiers",
  "outreach/sequencing",
  "outreach/senders",
  "outreach/reply-handlers",
  "crm/sync",
  "automation/schedulers",
  "automation/workflows",
  "scripts/infra",
  "scripts/build"
];

dirs.forEach(ensure);

execSync("npm init -y",{stdio:"inherit"});
console.log("Repo structure initialized.");
