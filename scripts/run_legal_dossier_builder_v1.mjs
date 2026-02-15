#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function read(p){return fs.readFileSync(p,"utf8");}
function mkdirp(p){fs.mkdirSync(p,{recursive:true});}
function write(p,d){mkdirp(path.dirname(p));fs.writeFileSync(p,JSON.stringify(d,null,2)+"\n");}

const firms=JSON.parse(read("data/legal_firms_ingested.json"));
const expo=JSON.parse(read("data/legal_exposure.json"));

const dossiers=firms.map(f=>{
  const e=expo.find(x=>x.domain===f.domain)||{exposureScore:0};
  return{
    firm:f.name,
    domain:f.domain,
    exposureScore:e.exposureScore
  };
});

write("data/legal_dossiers.json",dossiers);
console.log("Dossiers built:",dossiers.length);
