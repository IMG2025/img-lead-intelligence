/**
 * Precision-first legal contact mapper (v2)
 * Goals:
 * - Discover profile URLs using sitemap.xml and common index endpoints
 * - Extract PERSON entities only (reject nav/marketing headings)
 * - Produce stable, low-noise contacts payload
 */

type FirmSeed = {
  firm: string;
  domain: string;
  source?: string;
  exposureScore?: number;
};

export type MappedContact = {
  name: string;
  role: string;
  sourceUrl: string;
  evidenceText: string;
  confidence: number;
};

export type FirmContacts = {
  firm: string;
  domain: string;
  source: string;
  exposureScore: number;
  contacts: MappedContact[];
};

const ROLE_KEYWORDS = [
  "Partner",
  "Associate",
  "Counsel",
  "Attorney",
  "Lawyer",
  "Of Counsel",
  "Shareholder",
  "Principal",
  "Managing Partner",
  "Chair",
];

const REJECT_TOKENS = new Set([
  "People",
  "Our People",
  "Professionals",
  "Attorneys",
  "Lawyers",
  "Team",
  "Leadership",
  "Overview",
  "About",
  "Where Innovation Meets the Law",
  "Careers",
  "Services",
  "Industries",
]);

function toAbs(base: string, href: string): string | null {
  try {
    const u = new URL(href, base);
    // keep same host only
    const b = new URL(base);
    if (u.host !== b.host) return null;
    return u.toString();
  } catch {
    return null;
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function pickH1(html: string): string | null {
  const m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (!m) return null;
  return stripHtml(m[1]).slice(0, 120) || null;
}

function pickTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return null;
  return stripHtml(m[1]).slice(0, 120) || null;
}

function looksLikePersonName(name: string): boolean {
  const n = name.trim();
  if (!n) return false;
  if (REJECT_TOKENS.has(n)) return false;
  // Must have at least 2 tokens, mostly alpha, allow apostrophes/hyphens
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return false;
  if (parts.length > 5) return false;
  // reject if contains obvious nav words
  const bad = ["overview", "about", "innovation", "people", "team", "leadership"];
  const lower = n.toLowerCase();
  if (bad.some(w => lower === w || lower.includes(w + " "))) return false;
  // basic alpha check
  const alphaRatio = (n.replace(/[^A-Za-z]/g, "").length) / Math.max(1, n.length);
  return alphaRatio > 0.55;
}

function detectRole(text: string): string | null {
  for (const kw of ROLE_KEYWORDS) {
    const re = new RegExp("\\b" + kw.replace(/\s+/g, "\\s+") + "\\b", "i");
    if (re.test(text)) return kw;
  }
  return null;
}

function humanSchemaPass(name: string, pageText: string): { ok: boolean; role: string; confidence: number } {
  if (!looksLikePersonName(name)) return { ok: false, role: "", confidence: 0 };

  const role = detectRole(pageText) || "";
  // Require role keyword OR strong name + bio-ish signals
  const bioSignals = ["practice", "experience", "clients", "education", "bar admissions", "represent", "matters"];
  const bioScore = bioSignals.reduce((acc, s) => acc + (pageText.toLowerCase().includes(s) ? 1 : 0), 0);

  const ok = Boolean(role) || bioScore >= 2;
  let confidence = 0.55;
  if (role) confidence += 0.25;
  confidence += Math.min(0.2, bioScore * 0.05);

  return { ok, role: role || "Attorney", confidence: Math.max(0.55, Math.min(0.98, confidence)) };
}

async function fetchText(url: string): Promise<{ ok: boolean; status: number; text: string }> {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: {
        "user-agent": "img-lead-intelligence/1.0 (contact-mapper)",
        "accept": "text/html,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text };
  } catch {
    return { ok: false, status: 0, text: "" };
  }
}

function extractLinks(base: string, html: string): string[] {
  const links = new Set<string>();
  const re = /href=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const abs = toAbs(base, m[1]);
    if (abs) links.add(abs);
  }
  return [...links];
}

function isLikelyProfileUrl(u: string): boolean {
  try {
    const url = new URL(u);
    const p = url.pathname.toLowerCase();
    // Reject obvious non-profile assets and index roots
    if (p === "/" || p === "/about" || p === "/people" || p === "/lawyers" || p === "/attorneys") return false;
    if (p.endsWith(".pdf") || p.endsWith(".jpg") || p.endsWith(".png") || p.endsWith(".svg")) return false;

    const signals = [
      "/people/",
      "/lawyers/",
      "/attorneys/",
      "/professionals/",
      "/professional/",
      "/bio/",
      "/team/",
      "/person/",
    ];
    return signals.some(s => p.includes(s));
  } catch {
    return false;
  }
}

async function discoverIndexPages(base: string): Promise<string[]> {
  const out: string[] = [];
  const probes = [
    "/sitemap.xml",
    "/people",
    "/people/",
    "/lawyers",
    "/lawyers/",
    "/attorneys",
    "/attorneys/",
    "/professionals",
    "/professionals/",
    "/team",
    "/team/",
    "/our-people",
    "/our-people/",
    "/who-we-are",
    "/who-we-are/",
  ];

  // 1) sitemap.xml first (highest signal density)
  const sm = await fetchText(base + "/sitemap.xml");
  if (sm.ok && sm.text.includes("<loc>")) {
    out.push(base + "/sitemap.xml");
    return out;
  }

  // 2) fallback probes
  for (const p of probes.slice(1)) {
    const r = await fetchText(base + p);
    if (r.ok) out.push(base + p);
  }

  return out;
}

async function urlsFromSitemap(base: string, xml: string): Promise<string[]> {
  const urls = new Set<string>();
  const re = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const u = m[1].trim();
    if (!u.startsWith(base)) continue;
    if (isLikelyProfileUrl(u)) urls.add(u);
  }
  return [...urls];
}

export async function mapFirmContacts(seed: FirmSeed): Promise<FirmContacts> {
  const domain = seed.domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const base = "https://" + domain;

  const source = seed.source || "unknown";
  const exposureScore = typeof seed.exposureScore === "number" ? seed.exposureScore : 100;

  const indexPages = await discoverIndexPages(base);

  const profileUrls = new Set<string>();

  for (const page of indexPages) {
    const r = await fetchText(page);
    if (!r.ok) continue;

    if (page.endsWith("/sitemap.xml")) {
      const smUrls = await urlsFromSitemap(base, r.text);
      smUrls.forEach(u => profileUrls.add(u));
      continue;
    }

    extractLinks(base, r.text)
      .filter(isLikelyProfileUrl)
      .forEach(u => profileUrls.add(u));
  }

  // Hard cap to keep runtime bounded in Termux
  const candidates = [...profileUrls].slice(0, 25);

  const contacts: MappedContact[] = [];
  for (const url of candidates) {
    const r = await fetchText(url);
    if (!r.ok) continue;

    const h1 = pickH1(r.text);
    const title = pickTitle(r.text);
    const name = (h1 && looksLikePersonName(h1)) ? h1 : (title || "").split("|")[0].trim();

    const text = stripHtml(r.text).slice(0, 9000);
    const schema = humanSchemaPass(name, text);
    if (!schema.ok) continue;

    const evidenceText = text.slice(0, 380);
    contacts.push({
      name,
      role: schema.role,
      sourceUrl: url,
      evidenceText,
      confidence: schema.confidence,
    });
  }

  // De-dup by name+url
  const dedup = new Map<string, MappedContact>();
  for (const c of contacts) {
    const key = (c.name + "|" + c.sourceUrl).toLowerCase();
    if (!dedup.has(key) || (dedup.get(key)!.confidence < c.confidence)) dedup.set(key, c);
  }

  return {
    firm: seed.firm,
    domain,
    source,
    exposureScore,
    contacts: [...dedup.values()].sort((a, b) => b.confidence - a.confidence),
  };
}
