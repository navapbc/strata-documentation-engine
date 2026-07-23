import { normalizeCitationPath } from "./graph.js";
import type { ModelAnswer } from "./parse.js";

export type FinalStatus = "answered" | "no_match" | "low_confidence";

export interface GroundingCounts {
  citationsTotal: number;
  citationsResolved: number;
  quotesVerified: number;
  distinctDocs: number;
}

export interface GroundedSource {
  path: string;
  verified: string;
}

export interface GroundingResult {
  status: FinalStatus;
  sources: GroundedSource[];
  grounding: GroundingCounts;
}

export type DocReader = (nodePath: string) => string | null;

export function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export function extractVerifiedStatus(doc: string): string {
  if (!doc.startsWith("---")) return "unknown";
  const end = doc.indexOf("\n---", 3);
  if (end === -1) return "unknown";
  const frontmatter = doc.slice(0, end);
  const m = frontmatter.match(/^verified:\s*(\S+)\s*$/m);
  return m ? m[1] : "unknown";
}

export function ground(answer: ModelAnswer, nodePaths: Set<string>, readDoc: DocReader): GroundingResult {
  const counts: GroundingCounts = {
    citationsTotal: answer.citations.length,
    citationsResolved: 0,
    quotesVerified: 0,
    distinctDocs: 0,
  };
  if (answer.status === "no_match" || answer.citations.length === 0) {
    return { status: "no_match", sources: [], grounding: counts };
  }

  const verifiedDocs = new Map<string, string>(); // nodePath -> frontmatter verified value
  // Each cited doc is read + whitespace-normalized once, even when a model cites
  // the same path in multiple citations. undefined = not yet read; null = unreadable.
  const docCache = new Map<string, { normalized: string; verified: string } | null>();

  for (const citation of answer.citations) {
    const path = normalizeCitationPath(citation.path);
    if (!nodePaths.has(path)) continue;
    counts.citationsResolved++;

    let entry = docCache.get(path);
    if (entry === undefined) {
      const doc = readDoc(path);
      entry = doc === null ? null : { normalized: normalizeWhitespace(doc), verified: extractVerifiedStatus(doc) };
      docCache.set(path, entry);
    }
    if (entry === null) continue;

    const quote = normalizeWhitespace(citation.quote);
    if (quote.length === 0) continue;
    if (!entry.normalized.includes(quote)) continue;

    counts.quotesVerified++;
    if (!verifiedDocs.has(path)) verifiedDocs.set(path, entry.verified);
  }

  counts.distinctDocs = verifiedDocs.size;
  const sources = [...verifiedDocs.entries()].map(([path, verified]) => ({ path, verified }));

  let status: FinalStatus;
  if (counts.quotesVerified === 0) status = "no_match";
  else if (counts.quotesVerified < counts.citationsTotal) status = "low_confidence";
  else status = "answered";

  return { status, sources, grounding: counts };
}
