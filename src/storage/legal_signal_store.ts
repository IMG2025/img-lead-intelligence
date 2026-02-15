import fs from "node:fs";

export function writeLeads(leads:any[]){
  fs.writeFileSync(
    "data/legal_signal_leads.json",
    JSON.stringify(leads,null,2)
  );
}
