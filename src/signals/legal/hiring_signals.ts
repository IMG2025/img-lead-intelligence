export interface HiringSignal {
  firm: string;
  role: string;
  location: string;
  source: string;
}

export function normalizeHiring(raw:any[]):HiringSignal[]{
  return raw.map(r=>({
    firm: r.company || "",
    role: r.title || "",
    location: r.location || "",
    source: r.source || "unknown"
  }));
}
