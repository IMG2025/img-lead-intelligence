export const ROLE_KEYWORDS = [
  // Legal Ops / Operations
  "legal operations",
  "law firm operations",
  "director of operations",
  "operations director",

  // IT / Tech leadership
  "cio",
  "chief information officer",
  "cto",
  "chief technology officer",
  "it director",
  "director of it",
  "head of it",
  "technology director",
  "director of technology",
  "vp of technology",

  // Innovation
  "innovation",
  "legal innovation",
  "innovation officer",
  "director of innovation",

  // Knowledge / KM
  "knowledge management",
  "km",
  "director of knowledge",
  "knowledge director",
  "knowledge officer",
  "director of knowledge management",

  // Litigation support / eDiscovery
  "litigation support",
  "ediscovery",
  "e-discovery",
  "director of litigation support",
  "litigation technology",
  "litigation technologist",
  "director of ediscovery",
  "ediscovery manager"
] as const;

export function isTargetRole(roleText: string): boolean {
  const t = (roleText || "").toLowerCase();
  return ROLE_KEYWORDS.some(k => t.includes(k));
}
