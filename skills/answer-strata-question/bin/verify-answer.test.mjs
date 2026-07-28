// Unit tests for the ported grounding gate.
//
// The `ground` cases are a direct port of strata-qa/src/grounding.test.ts, kept in the
// same order and with the same names so the two files can be diffed against each other
// when either changes. Cases below the "port ends" marker are new: they cover the CLI
// surface this script adds on top of the library (answer extraction, message shaping,
// and the withholding rule), which has no equivalent in the Lambda.
//
// Runner is Node's built-in `node --test`. No package.json, no node_modules, no
// dependency under skills/.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  EXIT,
  extractAnswer,
  extractVerifiedStatus,
  formatMessage,
  ground,
  main,
  normalizeForMatch,
  normalizeWhitespace,
} from "./verify-answer.mjs";

const DOC_A = `---
id: strata-sdk-overview
verified: ok
---
# Overview

The nava-platform CLI wraps Copier to install templates
at their latest git tag.
`;

const DOC_B = `---
id: oscer-tasks
verified: needs-review
---
OSCER subclasses Strata::Task for staff steps.
`;

const DOC_C = `---
id: strata-sdk-business-process
verified: ok
---
# Business processes

| Method | Adds |
| --- | --- |
| \`applicant_task(name)\` | a step that creates a \`Strata::ApplicantTask\` |

Naming: \`case_class\` derives the case class by substituting \`"BusinessProcess"\` → \`"Case"\`
in the class name — an event-driven workflow of **steps** and **transitions**.
`;

const NODES = new Set([
  "sources/strata-sdk/overview.md",
  "sources/oscer/tasks.md",
  "sources/strata-sdk/business-process.md",
]);
const DOCS = {
  "sources/strata-sdk/overview.md": DOC_A,
  "sources/oscer/tasks.md": DOC_B,
  "sources/strata-sdk/business-process.md": DOC_C,
};
const reader = (p) => DOCS[p] ?? null;

function answered(citations) {
  return { status: "answered", answer: "It wraps Copier.", citations };
}

describe("normalizeWhitespace", () => {
  test("collapses runs and trims", () => {
    assert.equal(normalizeWhitespace("  a\n  b\t c  "), "a b c");
  });
});

describe("normalizeForMatch", () => {
  test("strips markdown formatting characters", () => {
    assert.equal(
      normalizeForMatch("| `applicant_task(name)` | a **step** that creates a `Strata::ApplicantTask` |"),
      normalizeForMatch("applicant_task(name) a step that creates a Strata::ApplicantTask"),
    );
  });
  test("maps unicode punctuation to ascii equivalents", () => {
    assert.equal(
      normalizeForMatch("substituting “BusinessProcess” → “Case” — the ‘end’ step…"),
      normalizeForMatch('substituting "BusinessProcess" -> "Case" - the \'end\' step...'),
    );
  });
  test("collapses whitespace left behind by stripped markup", () => {
    assert.equal(
      normalizeForMatch("an event-driven workflow of **steps** and **transitions**"),
      "an event-driven workflow of steps and transitions",
    );
  });
});

describe("extractVerifiedStatus", () => {
  test("reads verified from frontmatter", () => {
    assert.equal(extractVerifiedStatus(DOC_A), "ok");
    assert.equal(extractVerifiedStatus(DOC_B), "needs-review");
  });
  test("unknown when absent or no frontmatter", () => {
    assert.equal(extractVerifiedStatus("# no frontmatter"), "unknown");
    assert.equal(extractVerifiedStatus("---\nid: x\n---\nverified: ok\n"), "unknown");
  });
});

describe("ground", () => {
  test("fully verified single citation -> answered", () => {
    const r = ground(
      answered([{ path: "sources/strata-sdk/overview.md", quote: "wraps Copier to install templates" }]),
      NODES,
      reader,
    );
    assert.equal(r.status, "answered");
    assert.deepEqual(r.sources, [{ path: "sources/strata-sdk/overview.md", verified: "ok" }]);
    assert.deepEqual(r.grounding, {
      citationsTotal: 1,
      citationsResolved: 1,
      quotesVerified: 1,
      distinctDocs: 1,
      docsCited: 1,
    });
  });

  test("quote matches across line breaks via whitespace normalization", () => {
    const r = ground(
      answered([
        { path: "sources/strata-sdk/overview.md", quote: "wraps Copier to install templates at their latest git tag" },
      ]),
      NODES,
      reader,
    );
    assert.equal(r.status, "answered");
  });

  test("fabricated path -> no_match, nothing resolved", () => {
    const r = ground(answered([{ path: "sources/strata-sdk/retries.md", quote: "anything" }]), NODES, reader);
    assert.equal(r.status, "no_match");
    assert.deepEqual(r.sources, []);
    assert.deepEqual(r.grounding, {
      citationsTotal: 1,
      citationsResolved: 0,
      quotesVerified: 0,
      distinctDocs: 0,
      docsCited: 1,
    });
  });

  test("real path with fabricated quote -> no_match", () => {
    const r = ground(
      answered([{ path: "sources/strata-sdk/overview.md", quote: "Strata retries every call five times" }]),
      NODES,
      reader,
    );
    assert.equal(r.status, "no_match");
    assert.deepEqual(r.grounding, {
      citationsTotal: 1,
      citationsResolved: 1,
      quotesVerified: 0,
      distinctDocs: 0,
      docsCited: 1,
    });
  });

  test("citation to a fabricated path alongside a verified doc -> low_confidence", () => {
    const r = ground(
      answered([
        { path: "sources/strata-sdk/overview.md", quote: "wraps Copier" },
        { path: "sources/strata-sdk/ghost.md", quote: "does not exist" },
      ]),
      NODES,
      reader,
    );
    assert.equal(r.status, "low_confidence");
    assert.deepEqual(r.grounding, {
      citationsTotal: 2,
      citationsResolved: 1,
      quotesVerified: 1,
      distinctDocs: 1,
      docsCited: 2,
    });
  });

  test("unverified redundant quote in an otherwise-grounded doc -> answered", () => {
    const r = ground(
      answered([
        { path: "sources/strata-sdk/overview.md", quote: "wraps Copier to install templates" },
        { path: "sources/strata-sdk/overview.md", quote: "a paraphrase that appears nowhere" },
      ]),
      NODES,
      reader,
    );
    assert.equal(r.status, "answered");
    assert.deepEqual(r.grounding, {
      citationsTotal: 2,
      citationsResolved: 2,
      quotesVerified: 1,
      distinctDocs: 1,
      docsCited: 1,
    });
  });

  test("cited doc with zero verified quotes -> low_confidence even when another doc verifies", () => {
    const r = ground(
      answered([
        { path: "sources/strata-sdk/overview.md", quote: "wraps Copier" },
        { path: "sources/oscer/tasks.md", quote: "not actually in the tasks doc" },
      ]),
      NODES,
      reader,
    );
    assert.equal(r.status, "low_confidence");
    assert.equal(r.grounding.docsCited, 2);
    assert.equal(r.grounding.distinctDocs, 1);
    assert.deepEqual(r.sources, [{ path: "sources/strata-sdk/overview.md", verified: "ok" }]);
  });

  test("quote from a markdown table verifies without pipes and backticks", () => {
    const r = ground(
      answered([
        {
          path: "sources/strata-sdk/business-process.md",
          quote: "applicant_task(name) a step that creates a Strata::ApplicantTask",
        },
      ]),
      NODES,
      reader,
    );
    assert.equal(r.status, "answered");
  });

  test("quote with ascii arrow and no bold markers verifies against unicode/markdown doc text", () => {
    const r = ground(
      answered([
        {
          path: "sources/strata-sdk/business-process.md",
          quote:
            'substituting "BusinessProcess" -> "Case" in the class name - an event-driven workflow of steps and transitions',
        },
      ]),
      NODES,
      reader,
    );
    assert.equal(r.status, "answered");
  });

  test("returns per-citation detail with resolved and verified flags", () => {
    const r = ground(
      answered([
        { path: "docs/sources/strata-sdk/overview.md", quote: "wraps Copier" },
        { path: "sources/strata-sdk/ghost.md", quote: "nope" },
        { path: "sources/oscer/tasks.md", quote: "fabricated words" },
      ]),
      NODES,
      reader,
    );
    assert.deepEqual(r.citations, [
      { path: "sources/strata-sdk/overview.md", quote: "wraps Copier", resolved: true, verified: true },
      { path: "sources/strata-sdk/ghost.md", quote: "nope", resolved: false, verified: false },
      { path: "sources/oscer/tasks.md", quote: "fabricated words", resolved: true, verified: false },
    ]);
  });

  test("docs/-prefixed citation path still resolves", () => {
    const r = ground(answered([{ path: "docs/sources/strata-sdk/overview.md", quote: "wraps Copier" }]), NODES, reader);
    assert.equal(r.status, "answered");
    assert.equal(r.sources[0].path, "sources/strata-sdk/overview.md");
  });

  test("empty quote never verifies", () => {
    const r = ground(answered([{ path: "sources/strata-sdk/overview.md", quote: "   " }]), NODES, reader);
    assert.equal(r.status, "no_match");
    assert.equal(r.grounding.quotesVerified, 0);
  });

  test("model no_match passes through with empty grounding", () => {
    const r = ground({ status: "no_match", answer: null, citations: [] }, NODES, reader);
    assert.equal(r.status, "no_match");
    assert.deepEqual(r.grounding, {
      citationsTotal: 0,
      citationsResolved: 0,
      quotesVerified: 0,
      distinctDocs: 0,
      docsCited: 0,
    });
  });

  test("two verified docs counted distinctly, needs-review surfaced", () => {
    const r = ground(
      answered([
        { path: "sources/strata-sdk/overview.md", quote: "wraps Copier" },
        { path: "sources/oscer/tasks.md", quote: "subclasses Strata::Task" },
        { path: "sources/oscer/tasks.md", quote: "staff steps" },
      ]),
      NODES,
      reader,
    );
    assert.equal(r.status, "answered");
    assert.deepEqual(r.grounding, {
      citationsTotal: 3,
      citationsResolved: 3,
      quotesVerified: 3,
      distinctDocs: 2,
      docsCited: 2,
    });
    assert.ok(r.sources.some((s) => s.path === "sources/oscer/tasks.md" && s.verified === "needs-review"));
  });
});

// --- port ends; cases below cover the CLI surface the Lambda has no equivalent for ---

describe("extractAnswer", () => {
  test("reads a fenced json block surrounded by prose", () => {
    const a = extractAnswer('Here is my answer.\n\n```json\n{"status":"answered","answer":"x","citations":[]}\n```\n');
    assert.equal(a.status, "answered");
    assert.equal(a.answer, "x");
  });
  test("reads bare json with no fence", () => {
    const a = extractAnswer('{"status":"no_match","answer":null,"citations":[]}');
    assert.equal(a.status, "no_match");
  });
  test("last valid block wins when the model reasons aloud in earlier blocks", () => {
    const a = extractAnswer(
      '```json\n{"status":"no_match","answer":null,"citations":[]}\n```\n' +
        'then reconsidered\n```json\n{"status":"answered","answer":"final","citations":[]}\n```',
    );
    assert.equal(a.answer, "final");
  });
  test("rejects a schema-invalid object", () => {
    assert.equal(extractAnswer('{"status":"maybe","answer":"x","citations":[]}'), null);
    assert.equal(extractAnswer('{"status":"answered","answer":"x"}'), null);
    assert.equal(extractAnswer('{"status":"answered","answer":"x","citations":[{"path":1,"quote":"q"}]}'), null);
  });
  test("returns null for prose with no json at all", () => {
    assert.equal(extractAnswer("I am just prose."), null);
  });
});

describe("formatMessage", () => {
  const withheld = "It wraps Copier.";

  test("answered releases the answer and lists verified sources", () => {
    const answer = answered([{ path: "sources/strata-sdk/overview.md", quote: "wraps Copier" }]);
    const msg = formatMessage(answer, ground(answer, NODES, reader));
    assert.ok(msg.includes(withheld));
    assert.ok(msg.includes("sources/strata-sdk/overview.md"));
    assert.ok(msg.includes("✅ 1/1 quotes verified · 1 doc"));
  });

  // The property that makes the gate worth having: a partially verified answer is
  // withheld, not posted with a caveat. Mirrors run.ts setting answer to null unless
  // the status is exactly "answered".
  test("low_confidence never leaks the answer text", () => {
    const answer = answered([
      { path: "sources/strata-sdk/overview.md", quote: "wraps Copier" },
      { path: "sources/oscer/tasks.md", quote: "not actually in the tasks doc" },
    ]);
    const gate = ground(answer, NODES, reader);
    assert.equal(gate.status, "low_confidence");
    const msg = formatMessage(answer, gate);
    assert.ok(!msg.includes(withheld));
    assert.ok(msg.includes("could not verify all of its sources"));
    assert.ok(msg.includes("⚠️ 1/2 quotes verified · 1 of 2 cited docs"));
  });

  test("no_match never leaks the answer text", () => {
    const answer = answered([{ path: "sources/strata-sdk/overview.md", quote: "fabricated entirely" }]);
    const msg = formatMessage(answer, ground(answer, NODES, reader));
    assert.ok(!msg.includes(withheld));
    assert.ok(msg.includes("❌ 0/1 quotes verified"));
  });

  test("every message carries a verdict line", () => {
    for (const citations of [
      [{ path: "sources/strata-sdk/overview.md", quote: "wraps Copier" }],
      [{ path: "sources/strata-sdk/overview.md", quote: "nope" }],
      [],
    ]) {
      const answer = answered(citations);
      const msg = formatMessage(answer, ground(answer, NODES, reader));
      assert.match(msg, /[✅⚠️❌] \d+\/\d+ quotes verified/);
    }
  });
});

describe("main exit codes", () => {
  const root = new URL("../../../", import.meta.url).pathname;

  test("parse failure exits PARSE without touching the corpus", () => {
    assert.equal(main(["--docs-root", root], "not json at all"), EXIT.PARSE);
  });

  test("missing graph.json exits DOCS", () => {
    const stdin = '{"status":"answered","answer":"x","citations":[{"path":"sources/a.md","quote":"q"}]}';
    assert.equal(main(["--docs-root", "/nonexistent-docs-root"], stdin), EXIT.DOCS);
  });

  test("model no_match exits NO_MATCH", () => {
    assert.equal(main(["--docs-root", root], '{"status":"no_match","answer":null,"citations":[]}'), EXIT.NO_MATCH);
  });
});
