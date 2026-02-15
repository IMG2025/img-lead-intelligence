#!/usr/bin/env node
import { execSync } from "node:child_process";

function run(cmd){ execSync(cmd,{stdio:"inherit"}); }

// Build gate (always)
run("npm run build");

// Run legal harvester
run("node scripts/run_legal_signal_harvester_v1.mjs");

// Show artifact
run("ls -al data/legal_signal_leads.json");
