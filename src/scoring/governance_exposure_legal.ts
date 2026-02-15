export interface LegalSignal {
  hiring:boolean;
  vendor:boolean;
  practiceRisk:"HIGH"|"STANDARD";
}

export function scoreExposure(s:LegalSignal){
  let score = 0;

  if(s.hiring) score += 30;
  if(s.vendor) score += 40;
  if(s.practiceRisk==="HIGH") score += 30;

  return score;
}
