import { normalizeCitationPath } from "./graph.js";
import type { ModelAnswer } from "./parse.js";

export type FinalStatus = "answered" | "no_match" | "low_confidence";

export interface GroundingCounts {
  citationsTotal: number;
  citationsResolved: number;
  quotesVerified: number;
  distinctDocs: number; // cited docs with at least one verified quote
  docsCited: number; // distinct cited paths, whether or not they resolved
}

export interface GroundedSource {
  path: string;
  verified: string;
}

export interface CitationCheck {
  path: string; // normalized
  quote: string; // as the model emitted it
  resolved: boolean;
  verified: boolean;
}

export interface GroundingResult {
  status: FinalStatus;
  sources: GroundedSource[];
  grounding: GroundingCounts;
  citations: CitationCheck[];
}

export type DocReader = (nodePath: string) => string | null;

export function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

// Unicode punctuation the docs use that models routinely emit as ASCII.
const UNICODE_TO_ASCII: Array<[RegExp, string]> = [
  [/[‘’‚]/g, "'"],
  [/[“”„]/g, '"'],
  [/[–—]/g, "-"],
  [/→/g, "->"],
  [/…/g, "..."],
];

// Canonical form for quote matching: markdown formatting characters and unicode
// punctuation must not decide grounding. Applied identically to doc and quote,
// so it can never turn a faithful quote into a miss.
export function normalizeForMatch(s: string): string {
  let out = s;
  for (const [re, ascii] of UNICODE_TO_ASCII) out = out.replace(re, ascii);
  return normalizeWhitespace(out.replace(/[`*_|~#>]/g, " "));
}

export function extractVerifiedStatus(doc: string): string {
  if (!doc.startsWith("---")) return "unknown";
  const end = doc.indexOf("\n---", 3);
  if (end === -1) return "unknown";
  const frontmatter = doc.slice(0, end);
  const m = frontmatter.match(/^verified:\s*(\S+)\s*$/m);
  return m ? m[1] : "unknown";
}

export function ground(answer: ModelAnswer, nodePaths: ReadonlySet<string>, readDoc: DocReader): GroundingResult {
  if (answer.status === "no_match" || answer.citations.length === 0) {
    const empty: GroundingCounts = {
      citationsTotal: answer.citations.length,
      citationsResolved: 0,
      quotesVerified: 0,
      distinctDocs: 0,
      docsCited: 0,
    };
    return { status: "no_match", sources: [], grounding: empty, citations: [] };
  }

  const verifiedPaths = new Set<string>(); // cited docs with at least one verified quote
  // Each cited doc is read + normalized once, even when a model cites the same
  // path in multiple citations. undefined = not yet read; null = unreadable.
  const docCache = new Map<string, { normalized: string; verified: string } | null>();
  const citations: CitationCheck[] = [];

  for (const citation of answer.citations) {
    const path = normalizeCitationPath(citation.path);
    const check: CitationCheck = { path, quote: citation.quote, resolved: false, verified: false };
    citations.push(check);
    if (!nodePaths.has(path)) continue;
    check.resolved = true;

    let entry = docCache.get(path);
    if (entry === undefined) {
      const doc = readDoc(path);
      entry = doc === null ? null : { normalized: normalizeForMatch(doc), verified: extractVerifiedStatus(doc) };
      docCache.set(path, entry);
    }
    if (entry === null) continue;

    const quote = normalizeForMatch(citation.quote);
    if (quote.length === 0) continue;
    if (!entry.normalized.includes(quote)) continue;

    check.verified = true;
    verifiedPaths.add(path);
  }

  // Derived from the per-citation verdicts rather than tallied alongside them, so
  // there is one place a count can be wrong instead of four.
  const counts: GroundingCounts = {
    citationsTotal: citations.length,
    citationsResolved: citations.filter((c) => c.resolved).length,
    quotesVerified: citations.filter((c) => c.verified).length,
    distinctDocs: verifiedPaths.size,
    docsCited: new Set(citations.map((c) => c.path)).size,
  };
  const sources = [...verifiedPaths].map((path) => ({ path, verified: docCache.get(path)!.verified }));

  // The gate is per doc, not per quote: every distinct cited doc must carry at
  // least one verified quote. A redundant quote that fails in an already-verified
  // doc doesn't demote the answer; a cited doc with no verified quote does.
  let status: FinalStatus;
  if (counts.quotesVerified === 0) status = "no_match";
  else if (counts.distinctDocs < counts.docsCited) status = "low_confidence";
  else status = "answered";

  return { status, sources, grounding: counts, citations };
}
