#!/usr/bin/env node
//
// Deterministic candidate selection over docs/graph.json.
//
// WHY THIS EXISTS. The Lambda hands the model the whole docs root as its working
// directory and lets it explore. That works, but `.dockerignore` had to be taught to
// strip `.verification`, `.curation`, and `superpowers` from the image because, in its
// own words, extra search space is the main cost driver, and a spec must never be cited
// as a source. A skill reading a git checkout has no image to trim, so the exclusion has
// to come from somewhere else. It comes from here: `graph.json` indexes only the 56
// documents under `docs/sources/`, so selecting from the graph excludes everything else
// by data structure rather than by an instruction a model may drift from.
//
// SAFETY PROPERTY. This selector cannot cause a wrong answer. It only decides what the
// model reads; verify-answer.mjs independently checks every quote against the same graph.
// A selector that misses the right document costs recall (a refusal), never soundness (an
// ungrounded answer). That asymmetry is why a plain lexical scorer is acceptable here.
//
// Scoring is lexical over title, tags, source, and id, then one hop of graph expansion
// along `related-to` and friends, because a question often names one document while the
// answer lives in its neighbour.
//
// Usage:
//   node select-candidates.mjs --docs-root <path> [--limit N] [--json] "<question>"

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// Deliberately short. A long stop list is a tuning exercise, and this selector is
// evidence for a spike rather than a retrieval system anyone has to love.
const STOPWORDS = new Set(
  ("a an and are as at be by can do does for from has have how i in is it its of on or that the this to "
    + "what when where which who why with you your does do did will would should could").split(" "),
);

export function tokenize(text) {
  return [
    ...new Set(
      text
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length >= 3 && !STOPWORDS.has(t)),
    ),
  ];
}

export function loadGraph(docsRoot) {
  const graph = JSON.parse(readFileSync(join(docsRoot, "docs", "graph.json"), "utf8"));
  if (!Array.isArray(graph?.nodes)) throw new Error("malformed graph.json: missing nodes array");
  return { nodes: graph.nodes, edges: Array.isArray(graph.edges) ? graph.edges : [] };
}

// Field weights: a title hit is the strongest signal a lexical scorer has, a tag is
// curated vocabulary, and an id hit is usually a weaker echo of the title.
const WEIGHTS = { title: 3, tags: 2, source: 2, id: 1 };

export function scoreNode(node, terms) {
  const fields = {
    title: tokenize(node.title ?? ""),
    tags: (node.tags ?? []).flatMap((t) => tokenize(t)),
    source: tokenize(node.source ?? ""),
    id: tokenize(node.id ?? ""),
  };
  let score = 0;
  for (const [field, weight] of Object.entries(WEIGHTS)) {
    const bag = new Set(fields[field]);
    for (const term of terms) if (bag.has(term)) score += weight;
  }
  return score;
}

export function selectCandidates(graph, question, limit = 8) {
  const terms = tokenize(question);
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));

  const scored = graph.nodes
    .filter((n) => typeof n.path === "string")
    .map((n) => ({ node: n, score: scoreNode(n, terms), via: "lexical" }))
    .filter((s) => s.score > 0)
    // Ties broken by path so the output is stable across runs and machines.
    .sort((a, b) => b.score - a.score || a.node.path.localeCompare(b.node.path));

  const chosen = new Map(scored.slice(0, limit).map((s) => [s.node.id, s]));

  // One hop out from the seeds. A neighbour inherits a fraction of the seed's score so
  // it ranks below any directly-matching document but above nothing.
  if (chosen.size < limit) {
    const neighbours = [];
    for (const seed of [...chosen.values()]) {
      for (const e of graph.edges) {
        const otherId = e.from === seed.node.id ? e.to : e.to === seed.node.id ? e.from : null;
        if (!otherId || chosen.has(otherId)) continue;
        const node = byId.get(otherId);
        if (!node || typeof node.path !== "string") continue;
        neighbours.push({ node, score: seed.score / 2, via: `hop:${e.rel}` });
      }
    }
    neighbours.sort((a, b) => b.score - a.score || a.node.path.localeCompare(b.node.path));
    for (const n of neighbours) {
      if (chosen.size >= limit) break;
      if (!chosen.has(n.node.id)) chosen.set(n.node.id, n);
    }
  }

  return [...chosen.values()].map((s) => ({
    path: s.node.path,
    title: s.node.title,
    score: Number(s.score.toFixed(2)),
    via: s.via,
  }));
}

function parseArgs(argv) {
  let docsRoot = ".";
  let limit = 8;
  let json = false;
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--docs-root") docsRoot = argv[++i];
    else if (argv[i] === "--limit") limit = Number(argv[++i]);
    else if (argv[i] === "--json") json = true;
    else rest.push(argv[i]);
  }
  return { docsRoot, limit, json, question: rest.join(" ") };
}

export function main(argv = process.argv.slice(2)) {
  const { docsRoot, limit, json, question } = parseArgs(argv);
  if (!question.trim()) {
    process.stderr.write('select-candidates: no question given\nusage: select-candidates.mjs [--docs-root p] "<question>"\n');
    return 1;
  }

  let graph;
  try {
    graph = loadGraph(docsRoot);
  } catch (err) {
    process.stderr.write(`select-candidates: cannot load graph.json under ${docsRoot}: ${err.message}\n`);
    return 4;
  }

  const candidates = selectCandidates(graph, question, limit);
  const indexed = graph.nodes.filter((n) => typeof n.path === "string").length;

  if (json) {
    process.stdout.write(JSON.stringify({ question, indexed, candidates }, null, 2) + "\n");
  } else if (candidates.length === 0) {
    process.stdout.write(`No candidate documents matched. The graph indexes ${indexed} documents.\n`);
  } else {
    process.stdout.write(`${candidates.length} of ${indexed} indexed documents:\n`);
    for (const c of candidates) process.stdout.write(`  ${c.path}  (${c.title}) [${c.via} ${c.score}]\n`);
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}
