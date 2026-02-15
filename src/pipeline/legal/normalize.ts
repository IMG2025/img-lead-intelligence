export type FirmSeed = {
  name: string;
  domain?: string;
  website?: string;
  notes?: string;
};

export type NormalizedFirm = {
  name: string;
  domain: string;
  website: string;
  source: "seed";
  createdAt: string;
  notes?: string;
};

export function normalizeDomain(input: string): string {
  const s=(input||"").toLowerCase().trim();
  return s.replace(/^https?:\/\//,"").replace(/^www\./,"").split("/")[0];
}

export function normalizeFirm(seed:FirmSeed,createdAt:string):NormalizedFirm|null{
  if(!seed.name) return null;
  const domain=normalizeDomain(seed.domain||seed.website||"");
  if(!domain.includes(".")) return null;
  return{
    name:seed.name.trim(),
    domain,
    website:seed.website||`https://${domain}`,
    source:"seed",
    createdAt,
    notes:seed.notes
  };
}
