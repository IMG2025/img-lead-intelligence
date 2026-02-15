import * as cheerio from "cheerio";
import { isTargetRole } from "./legal_role_taxonomy.js";

export type Contact = {
  name: string;
  role: string;
  profileUrl?: string;
  sourceUrl: string;
  evidenceText: string;
  confidence: number; // 0-1
};

function clean(s: string): string {
  return (s || "").replace(/\s+/g, " ").trim();
}

/**
 * Heuristic extraction:
 * - Look for elements that resemble a person card (name + role in proximity)
 * - Filter to target roles only (Option A)
 */
export function extractContactsFromHtml(html: string, sourceUrl: string): Contact[] {
  const $ = cheerio.load(html);
  const results: Contact[] = [];

  // Candidate containers
  const containers = [
    "[class*='person']",
    "[class*='profile']",
    "[class*='bio']",
    "[class*='team']",
    "[class*='card']",
    "article",
    "li",
    "div"
  ];

  const seen = new Set<string>();

  for (const sel of containers) {
    $(sel).each((_i, el) => {
      const text = clean($(el).text());
      if (text.length < 20) return;

      // Find a likely name: prefer headings
      const name =
        clean($(el).find("h1,h2,h3,h4,strong").first().text()) ||
        clean($(el).find("a").first().text());

      if (!name || name.length < 3) return;

      // Find role-ish text: look for common role containers
      const role =
        clean($(el).find("[class*='title'],[class*='role'],[class*='position']").first().text()) ||
        // fallback: second line heuristic
        clean(text.split(" ").slice(0, 30).join(" "));

      if (!isTargetRole(role) && !isTargetRole(text)) return;

      // Profile URL (best-effort)
      const href = $(el).find("a[href]").first().attr("href") || "";
      const profileUrl = href ? href : undefined;

      const key = (name + "|" + (role || "")).toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);

      // confidence heuristic
      let confidence = 0.45;
      if (isTargetRole(role)) confidence += 0.35;
      if ($(el).find("[class*='title'],[class*='role'],[class*='position']").length > 0) confidence += 0.1;
      if (profileUrl) confidence += 0.1;
      confidence = Math.min(0.98, confidence);

      results.push({
        name: clean(name),
        role: clean(role),
        profileUrl,
        sourceUrl,
        evidenceText: text.slice(0, 240),
        confidence
      });
    });

    if (results.length >= 25) break; // cap per page
  }

  return results;
}
