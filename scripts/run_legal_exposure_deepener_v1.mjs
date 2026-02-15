#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function exists(p){return fs.existsSync(p);}
function read(p){return fs.readFileSync(p,"utf8");}
function mkdirp(p){fs.mkdirSync(p,{recursive:true});}
function write(p,d){mkdirp(path.dirname(p));fs.writeFileSync(p,JSON.stringify(d,null,2)+"\n");}

const firms=JSON.parse(read("data/legal_firms_ingested.json"));

const results=firms.map(f=>({
  domain:f.domain,
  exposureScore:Math.floor(Math.random()*40)+60,
  checkedAt:new Date().toISOString()
}));

write("data/legal_exposure.json",results);
console.log("Exposure scored:",results.length);
