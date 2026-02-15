const HIGH_RISK = [
  "M&A",
  "Securities",
  "Healthcare",
  "Employment",
  "Class Action"
];

export function classifyRisk(practice:string){
  return HIGH_RISK.includes(practice) ? "HIGH" : "STANDARD";
}
