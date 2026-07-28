// The spike's central evidence: does the ported gate agree with the original?
//
// `strata-qa/fixtures/golden.json` cannot serve here. It holds nine {question, expect}
// fixtures and records no model answers, so there is nothing to replay through a gate.
// This harness generates its cases from the real corpus instead, with a fixed seed, and
// runs each one through BOTH implementations:
//
//   ported JS  -> ground() imported from ./verify-answer.mjs
//   original TS -> ground() in strata-qa/src/grounding.ts, via ./reference-bridge.mts
//
// Then it asserts deep equality of the entire GroundingResult: status, sources, all five
// grounding counts, and every per-citation resolved/verified flag.
//
// Note what this design buys. Because it compares two implementations rather than checking
// answers against expectations, EVERY generated input is a valid test case, including
// nonsense ones. Correctness of the verdict is already covered by the ported unit tests;
// what this proves is that the port did not change behaviour anywhere the generator can
// reach. A disagreement is a spike finding, not a bug to quietly fix.
//
// Run:  node --test skills/answer-strata-question/bin/differential.test.mjs
//       CASES=2000 node --test ...        (widen the sweep)

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { docPath, ground, loadNodePaths } from "./verify-answer.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..", "..");
const TSX = join(REPO_ROOT, "strata-qa", "node_modules", ".bin", "tsx");
const BRIDGE = join(HERE, "reference-bridge.mts");
const CASES = Number(process.env.CASES ?? 500);
const SEED = Number(process.env.SEED ?? 20260728);

// mulberry32: small, seeded, and reproducible across machines. The point is that a
// disagreement can be replayed with the same SEED, not statistical quality.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = rng(SEED);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const chance = (p) => rand() < p;

const nodePaths = loadNodePaths(REPO_ROOT);
const PATHS = [...nodePaths];

// Body text per doc, frontmatter stripped, so generated quotes come from prose rather
// than from the `verified:` line the gate itself reads.
const BODIES = new Map();
for (const p of PATHS) {
  let text;
  try {
    text = readFileSync(docPath(REPO_ROOT, p), "utf8");
  } catch {
    continue;
  }
  const end = text.startsWith("---") ? text.indexOf("\n---", 3) : -1;
  const body = end === -1 ? text : text.slice(end + 4);
  if (body.trim().length > 200) BODIES.set(p, body);
}
const BODY_PATHS = [...BODIES.keys()];

// A genuinely verbatim substring, snapped to word boundaries so it reads like something
// a model would actually copy out.
function verbatimQuote(path) {
  const body = BODIES.get(path);
  const start = Math.floor(rand() * Math.max(1, body.length - 250));
  const len = 40 + Math.floor(rand() * 200);
  let slice = body.slice(start, start + len);
  slice = slice.replace(/^\S*\s/, "").replace(/\s\S*$/, "");
  return slice.trim();
}

const QUOTE_MUTATIONS = {
  verbatim: (q) => q,
  // Should still verify: normalizeForMatch collapses whitespace on both sides.
  rewrapped: (q) => q.replace(/ /g, "\n"),
  // Should still verify: the unicode table folds these to the ascii the doc may hold.
  unicodeSwap: (q) => q.replace(/'/g, "’").replace(/"/g, "“").replace(/-/g, "—"),
  // Should still verify: markdown characters are stripped from both sides.
  markdownStripped: (q) => q.replace(/[`*_|~#>]/g, ""),
  // Should fail: one character changed.
  typo: (q) => (q.length > 10 ? q.slice(0, 5) + "X" + q.slice(6) : q + "X"),
  truncated: (q) => q.slice(0, Math.max(0, Math.floor(q.length / 3))),
  blank: () => "   ",
  fabricated: () => "Strata retries every call five times before giving up entirely.",
};

const PATH_MUTATIONS = {
  exact: (p) => p,
  docsPrefixed: (p) => "docs/" + p,
  dotSlash: (p) => "./" + p,
  anchored: (p) => p + "#configuration",
  lineSuffixed: (p) => p + ":12",
  lineRange: (p) => p + ":12:40",
  trailingSpace: (p) => "  " + p + "  ",
  fabricated: () => `sources/${pick(["ghost", "oscer", "strata-sdk"])}/does-not-exist-${Math.floor(rand() * 999)}.md`,
};

const QUOTE_KINDS = Object.keys(QUOTE_MUTATIONS);
const PATH_KINDS = Object.keys(PATH_MUTATIONS);

function makeCitation() {
  const truePath = pick(BODY_PATHS);
  const pathKind = chance(0.2) ? pick(PATH_KINDS) : "exact";
  const quoteKind = chance(0.55) ? "verbatim" : pick(QUOTE_KINDS);
  return {
    path: PATH_MUTATIONS[pathKind](truePath),
    quote: QUOTE_MUTATIONS[quoteKind](verbatimQuote(truePath)),
  };
}

function makeCase() {
  if (chance(0.06)) return { status: "no_match", answer: null, citations: [] };
  if (chance(0.04)) return { status: "answered", answer: "empty citations", citations: [] };
  const n = 1 + Math.floor(rand() * 3);
  const citations = Array.from({ length: n }, makeCitation);
  // Sometimes cite the same doc twice, which is what exercises the per-doc gate:
  // a redundant failing quote must not demote an already-verified doc.
  if (n > 1 && chance(0.25)) citations[1] = { ...citations[0], quote: QUOTE_MUTATIONS.typo(citations[0].quote) };
  return { status: "answered", answer: "generated", citations };
}

describe("differential: ported gate vs original strata-qa gate", () => {
  test(`${CASES} generated cases agree on the full GroundingResult`, () => {
    assert.ok(BODY_PATHS.length > 0, "corpus produced no usable doc bodies");

    const cases = Array.from({ length: CASES }, makeCase);

    const readDoc = (nodePath) => {
      try {
        return readFileSync(docPath(REPO_ROOT, nodePath), "utf8");
      } catch {
        return null;
      }
    };
    const mine = cases.map((c) => ground(c, nodePaths, readDoc));

    const theirs = JSON.parse(
      execFileSync(TSX, [BRIDGE], {
        input: JSON.stringify({ docsRoot: REPO_ROOT, cases }),
        encoding: "utf8",
        maxBuffer: 256 * 1024 * 1024,
      }),
    );

    assert.equal(theirs.length, mine.length, "bridge returned a different number of results");

    const disagreements = [];
    for (let i = 0; i < cases.length; i++) {
      try {
        assert.deepStrictEqual(mine[i], theirs[i]);
      } catch {
        disagreements.push({ index: i, case: cases[i], ported: mine[i], original: theirs[i] });
      }
    }

    // Prove the sweep actually reached all three verdicts. A run that produced 500
    // no_match results would pass trivially while testing almost nothing.
    const dist = mine.reduce((acc, r) => ((acc[r.status] = (acc[r.status] ?? 0) + 1), acc), {});
    console.log(`  seed=${SEED} cases=${CASES} verdicts=${JSON.stringify(dist)}`);
    console.log(`  disagreements=${disagreements.length}`);
    for (const d of disagreements.slice(0, 3)) {
      console.log("  first disagreement:", JSON.stringify(d, null, 2).slice(0, 1200));
    }

    for (const status of ["answered", "no_match", "low_confidence"]) {
      assert.ok((dist[status] ?? 0) > 0, `generator never produced a ${status} verdict; the sweep is too narrow`);
    }
    assert.equal(disagreements.length, 0, `${disagreements.length} of ${CASES} cases disagreed`);
  });
});
