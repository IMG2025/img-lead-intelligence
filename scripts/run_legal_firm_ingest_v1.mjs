#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function exists(p){return fs.existsSync(p);}
function read(p){return fs.readFileSync(p,"utf8");}
function mkdirp(p){fs.mkdirSync(p,{recursive:true});}
function write(p,d){mkdirp(path.dirname(p));fs.writeFileSync(p,JSON.stringify(d,null,2)+"\n");}

const seedPath="data/legal_firms_seed.json";
if(!exists(seedPath)){
  write(seedPath,[{name:"Cooley LLP",domain:"cooley.com"}]);
}

const seed=JSON.parse(read(seedPath));
const {normalizeFirm}=await import("../dist/pipeline/legal/normalize.js");

const out=[];
for(const s of seed){
  const n=normalizeFirm(s,new Date().toISOString());
  if(n) out.push(n);
}

write("data/legal_firms_ingested.json",out);
console.log("Ingested:",out.length);
