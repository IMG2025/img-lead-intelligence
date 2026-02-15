#!/usr/bin/env node
import { normalizeHiring } from "../dist/signals/legal/hiring_signals.js";
import { detectVendors } from "../dist/signals/legal/ai_vendor_detection.js";
import { classifyRisk } from "../dist/signals/legal/practice_area_classifier.js";
import { resolveDomain } from "../dist/resolution/firm_domain_resolver.js";
import { scoreExposure } from "../dist/scoring/governance_exposure_legal.js";
import { writeLeads } from "../dist/storage/legal_signal_store.js";

const sample = [
  {
    company:"Cooley LLP",
    title:"AI Legal Research Manager",
    practice:"M&A",
    description:"Deploying Harvey AI internally"
  }
];

const normalized = normalizeHiring(sample);

const enriched = normalized.map(n=>{
  const vendor = detectVendors(sample[0].description).length>0;
  const risk = classifyRisk(sample[0].practice);

  return {
    ...n,
    domain: resolveDomain(n.firm),
    exposureScore: scoreExposure({
      hiring:true,
      vendor,
      practiceRisk:risk
    })
  };
});

writeLeads(enriched);

console.log("Legal signals harvested.");
