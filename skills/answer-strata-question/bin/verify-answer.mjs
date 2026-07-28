#!/usr/bin/env node
//
// The deterministic grounding gate, as a standalone Node script.
//
// This is a dependency-free port of the verifier that `strata-qa` runs inside its
// Lambda: `strata-qa/src/grounding.ts` (`ground` and friends), plus the two helpers
// it needs from `strata-qa/src/graph.ts` and `strata-qa/src/parse.ts`. The logic and
// the reasoning comments are carried over deliberately rather than reimplemented,
// because the subtle part (the gate is per doc, not per quote) is exactly what a
// fresh implementation would get wrong.
//
// WHY IT EXISTS SEPARATELY. In the Lambda, `run.ts` calls `ground()` unconditionally
// after the model returns, so trusted code wraps the untrusted model and a model
// cannot claim `answered` — it can only propose it. A skill inverts that: the agent
// decides whether to invoke this script. That inversion cannot be closed by code.
// It is mitigated by making this script the SOLE producer of the final message, so
// an agent that skips the gate has no formatted output to post, and by the verdict
// line this script always emits, which makes a skipped gate visible to a human.
// Prevention becomes detection. See the spike findings for the full argument.
//
// NOT a Workflow file. The `.mjs` files under `skills/*/workflows/` are Workflow-tool
// orchestration scripts using ambient `agent()` / `parallel()` / `phase()` globals and
// are not runnable with `node`. This is a plain CLI. Hence `bin/`, not `workflows/`.
//
// Usage:
//   echo '<model JSON>' | node verify-answer.mjs --docs-root <path> [--json]
//
// Exit codes (0 is the only one that releases an answer):
//   0  answered        every cited doc carried at least one verified quote
//   1  low_confidence  some cited doc had no verifiable quote; the answer is withheld
//   2  no_match        nothing verified, or the model itself declined
//   4  docs            graph.json missing or malformed
//   6  parse           stdin held no valid model answer
// 4 and 6 match the meanings `strata-qa/src/cli.ts` already assigns them.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const EXIT = { ANSWERED: 0, LOW_CONFIDENCE: 1, NO_MATCH: 2, DOCS: 4, PARSE: 6 };

// --- ported from strata-qa/src/parse.ts --------------------------------------

const MARKDOWN_FENCE = /```(?:json)?\s*\n([\s\S]*?)```/g;

function validate(value) {
  if (typeof value !== "object" || value === null) return null;
  const o = value;
  if (o.status !== "answered" && o.status !== "no_match") return null;
  if (o.answer !== null && typeof o.answer !== "string") return null;
  if (!Array.isArray(o.citations)) return null;
  for (const c of o.citations) {
    if (typeof c !== "object" || c === null) return null;
    if (typeof c.path !== "string" || typeof c.quote !== "string") return null;
  }
  return {
    status: o.status,
    answer: o.answer,
    citations: o.citations.map((c) => ({ path: c.path, quote: c.quote })),
  };
}

// Extract the json answer from a markdown block, removing any prose around it.
// Last valid block wins, matching the Lambda: a model that reasons aloud and then
// emits its final block should be read by its final block.
export function extractAnswer(text) {
  let last = null;
  for (const m of text.matchAll(MARKDOWN_FENCE)) {
    try {
      const v = validate(JSON.parse(m[1]));
      if (v) last = v;
    } catch {
      // not JSON — skip this block
    }
  }
  if (!last) {
    try {
      last = validate(JSON.parse(text.trim()));
    } catch {
      // fall through
    }
  }
  return last;
}

// --- ported from strata-qa/src/graph.ts --------------------------------------

export function graphPath(docsRoot) {
  return join(docsRoot, "docs", "graph.json");
}

export function docPath(docsRoot, nodePath) {
  return join(docsRoot, "docs", nodePath);
}

export function loadNodePaths(docsRoot) {
  const raw = readFileSync(graphPath(docsRoot), "utf8");
  const graph = JSON.parse(raw);
  const nodes = graph?.nodes;
  if (!Array.isArray(nodes)) throw new Error("malformed graph.json: missing nodes array");
  const paths = new Set();
  for (const n of nodes) {
    const p = n?.path;
    // build_graph.py emits doc_type:"source" grouping nodes with path:null (never
    // a citation target). Collect only string doc paths; skip null/absent paths.
    if (typeof p === "string") paths.add(p);
  }
  return paths;
}

export function normalizeCitationPath(raw) {
  return raw
    .trim()
    .replace(/^\.\//, "")
    .replace(/^docs\//, "")
    .replace(/#.*$/, "")
    .replace(/(:\d+)+$/, "");
}

// --- ported from strata-qa/src/grounding.ts ----------------------------------

export function normalizeWhitespace(s) {
  return s.replace(/\s+/g, " ").trim();
}

// Unicode punctuation the docs use that models routinely emit as ASCII.
const UNICODE_TO_ASCII = [
  [/[‘’‚]/g, "'"],
  [/[“”„]/g, '"'],
  [/[–—]/g, "-"],
  [/→/g, "->"],
  [/…/g, "..."],
];

// Canonical form for quote matching: markdown formatting characters and unicode
// punctuation must not decide grounding. Applied identically to doc and quote,
// so it can never turn a faithful quote into a miss.
export function normalizeForMatch(s) {
  let out = s;
  for (const [re, ascii] of UNICODE_TO_ASCII) out = out.replace(re, ascii);
  return normalizeWhitespace(out.replace(/[`*_|~#>]/g, " "));
}

export function extractVerifiedStatus(doc) {
  if (!doc.startsWith("---")) return "unknown";
  const end = doc.indexOf("\n---", 3);
  if (end === -1) return "unknown";
  const frontmatter = doc.slice(0, end);
  const m = frontmatter.match(/^verified:\s*(\S+)\s*$/m);
  return m ? m[1] : "unknown";
}

export function ground(answer, nodePaths, readDoc) {
  if (answer.status === "no_match" || answer.citations.length === 0) {
    const empty = {
      citationsTotal: answer.citations.length,
      citationsResolved: 0,
      quotesVerified: 0,
      distinctDocs: 0,
      docsCited: 0,
    };
    return { status: "no_match", sources: [], grounding: empty, citations: [] };
  }

  const verifiedPaths = new Set(); // cited docs with at least one verified quote
  // Each cited doc is read + normalized once, even when a model cites the same
  // path in multiple citations. undefined = not yet read; null = unreadable.
  const docCache = new Map();
  const citations = [];

  for (const citation of answer.citations) {
    const path = normalizeCitationPath(citation.path);
    const check = { path, quote: citation.quote, resolved: false, verified: false };
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
  const counts = {
    citationsTotal: citations.length,
    citationsResolved: citations.filter((c) => c.resolved).length,
    quotesVerified: citations.filter((c) => c.verified).length,
    distinctDocs: verifiedPaths.size,
    docsCited: new Set(citations.map((c) => c.path)).size,
  };
  const sources = [...verifiedPaths].map((path) => ({ path, verified: docCache.get(path).verified }));

  // The gate is per doc, not per quote: every distinct cited doc must carry at
  // least one verified quote. A redundant quote that fails in an already-verified
  // doc doesn't demote the answer; a cited doc with no verified quote does.
  let status;
  if (counts.quotesVerified === 0) status = "no_match";
  else if (counts.distinctDocs < counts.docsCited) status = "low_confidence";
  else status = "answered";

  return { status, sources, grounding: counts, citations };
}

// --- ported from strata-qa/src/run.ts ----------------------------------------

export function refusalReason(g) {
  if (g.grounding.citationsTotal === 0) return "model found no candidate docs";
  if (g.grounding.quotesVerified === 0)
    return "no citation verified (paths unresolved or quotes not found in cited docs)";
  return (
    `partial verification: ${g.grounding.distinctDocs} of ${g.grounding.docsCited} cited docs verified ` +
    `(${g.grounding.quotesVerified} of ${g.grounding.citationsTotal} quotes)`
  );
}

// --- the message ------------------------------------------------------------

// The verdict line is not decoration. It is the detection half of the mitigation:
// a human reading the channel can see at a glance whether the gate ran, so a message
// posted without one is legibly off-script.
function verdictLine(gate) {
  const g = gate.grounding;
  const mark = { answered: "✅", low_confidence: "⚠️", no_match: "❌" }[gate.status];
  const docs =
    gate.status === "answered"
      ? `${g.distinctDocs} doc${g.distinctDocs === 1 ? "" : "s"}`
      : `${g.distinctDocs} of ${g.docsCited} cited docs`;
  return `${mark} ${g.quotesVerified}/${g.citationsTotal} quotes verified · ${docs}`;
}

// The answer text is released ONLY on `answered`. This mirrors run.ts, which sets
// `answer: gate.status === "answered" ? parsed.answer : null` — a low-confidence
// answer is withheld, not posted with a caveat.
export function formatMessage(answer, gate) {
  const lines = [];
  if (gate.status === "answered") {
    lines.push(answer.answer ?? "");
    lines.push("");
    lines.push("*Sources*");
    for (const s of gate.sources) lines.push(`• \`${s.path}\` (verified: ${s.verified})`);
  } else if (gate.status === "low_confidence") {
    lines.push("I found a possible answer but could not verify all of its sources, so I am not posting it.");
    lines.push("");
    lines.push(`Reason: ${refusalReason(gate)}`);
  } else {
    lines.push("I could not find a grounded answer in the Strata docs.");
    lines.push("");
    lines.push(`Reason: ${refusalReason(gate)}`);
  }
  lines.push("");
  lines.push(verdictLine(gate));
  return lines.join("\n");
}

// --- CLI --------------------------------------------------------------------

function parseArgs(argv) {
  let docsRoot = ".";
  let json = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--docs-root") docsRoot = argv[++i];
    else if (argv[i] === "--json") json = true;
  }
  return { docsRoot, json };
}

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

export function main(argv = process.argv.slice(2), stdin = readStdin()) {
  const { docsRoot, json } = parseArgs(argv);

  const answer = extractAnswer(stdin);
  if (!answer) {
    process.stderr.write("verify-answer: stdin held no valid model answer\n");
    return EXIT.PARSE;
  }

  let nodePaths;
  try {
    nodePaths = loadNodePaths(docsRoot);
  } catch (err) {
    process.stderr.write(`verify-answer: cannot load graph.json under ${docsRoot}: ${err.message}\n`);
    return EXIT.DOCS;
  }

  const readDoc = (nodePath) => {
    try {
      return readFileSync(docPath(docsRoot, nodePath), "utf8");
    } catch {
      return null;
    }
  };
  const gate = ground(answer, nodePaths, readDoc);

  process.stdout.write(json ? JSON.stringify(gate, null, 2) + "\n" : formatMessage(answer, gate) + "\n");

  if (gate.status === "answered") return EXIT.ANSWERED;
  if (gate.status === "low_confidence") return EXIT.LOW_CONFIDENCE;
  return EXIT.NO_MATCH;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}
