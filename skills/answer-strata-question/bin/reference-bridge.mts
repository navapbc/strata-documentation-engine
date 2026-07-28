// Spike scaffolding, not part of the skill.
//
// Runs the ORIGINAL TypeScript `ground()` from strata-qa so differential.test.mjs can
// compare it against the ported JavaScript one. This file is the only thing in the
// skill directory that reaches into `strata-qa/`, and it exists solely to prove the
// port is faithful. If this skill ever ships on its own, delete this file and the
// differential test with it; the skill's runtime has no dependency on either.
//
// Run with strata-qa's tsx (the repo's only TypeScript runner):
//   strata-qa/node_modules/.bin/tsx skills/answer-strata-question/bin/reference-bridge.mts
//
// Protocol: one JSON object on stdin, {docsRoot, cases: ModelAnswer[]}; one JSON array
// of GroundingResult on stdout, in the same order. Both sides read the same files from
// the same docsRoot, so the corpus is a shared constant rather than part of the payload.

import { readFileSync } from "node:fs";
import { docPath, loadNodePaths } from "../../../strata-qa/src/graph.js";
import { ground } from "../../../strata-qa/src/grounding.js";
import type { ModelAnswer } from "../../../strata-qa/src/parse.js";

const input = JSON.parse(readFileSync(0, "utf8")) as { docsRoot: string; cases: ModelAnswer[] };

const nodePaths = loadNodePaths(input.docsRoot);
const readDoc = (nodePath: string): string | null => {
  try {
    return readFileSync(docPath(input.docsRoot, nodePath), "utf8");
  } catch {
    return null;
  }
};

process.stdout.write(JSON.stringify(input.cases.map((c) => ground(c, nodePaths, readDoc))));
