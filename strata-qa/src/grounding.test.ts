import { describe, expect, test } from "vitest";
import type { ModelAnswer } from "./parse.js";
import { extractVerifiedStatus, ground, normalizeWhitespace } from "./grounding.js";

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

const NODES = new Set(["sources/strata-sdk/overview.md", "sources/oscer/tasks.md"]);
const reader = (p: string) =>
  p === "sources/strata-sdk/overview.md" ? DOC_A : p === "sources/oscer/tasks.md" ? DOC_B : null;

function answered(citations: ModelAnswer["citations"]): ModelAnswer {
  return { status: "answered", answer: "It wraps Copier.", citations };
}

describe("normalizeWhitespace", () => {
  test("collapses runs and trims", () => {
    expect(normalizeWhitespace("  a\n  b\t c  ")).toBe("a b c");
  });
});

describe("extractVerifiedStatus", () => {
  test("reads verified from frontmatter", () => {
    expect(extractVerifiedStatus(DOC_A)).toBe("ok");
    expect(extractVerifiedStatus(DOC_B)).toBe("needs-review");
  });
  test("unknown when absent or no frontmatter", () => {
    expect(extractVerifiedStatus("# no frontmatter")).toBe("unknown");
    expect(extractVerifiedStatus("---\nid: x\n---\nverified: ok\n")).toBe("unknown");
  });
});

describe("ground", () => {
  test("fully verified single citation -> answered", () => {
    const r = ground(
      answered([{ path: "sources/strata-sdk/overview.md", quote: "wraps Copier to install templates" }]),
      NODES,
      reader,
    );
    expect(r.status).toBe("answered");
    expect(r.sources).toEqual([{ path: "sources/strata-sdk/overview.md", verified: "ok" }]);
    expect(r.grounding).toEqual({ citationsTotal: 1, citationsResolved: 1, quotesVerified: 1, distinctDocs: 1 });
  });

  test("quote matches across line breaks via whitespace normalization", () => {
    const r = ground(
      answered([
        { path: "sources/strata-sdk/overview.md", quote: "wraps Copier to install templates at their latest git tag" },
      ]),
      NODES,
      reader,
    );
    expect(r.status).toBe("answered");
  });

  test("fabricated path -> no_match, nothing resolved", () => {
    const r = ground(answered([{ path: "sources/strata-sdk/retries.md", quote: "anything" }]), NODES, reader);
    expect(r.status).toBe("no_match");
    expect(r.sources).toEqual([]);
    expect(r.grounding).toEqual({ citationsTotal: 1, citationsResolved: 0, quotesVerified: 0, distinctDocs: 0 });
  });

  test("real path with fabricated quote -> no_match", () => {
    const r = ground(
      answered([{ path: "sources/strata-sdk/overview.md", quote: "Strata retries every call five times" }]),
      NODES,
      reader,
    );
    expect(r.status).toBe("no_match");
    expect(r.grounding).toEqual({ citationsTotal: 1, citationsResolved: 1, quotesVerified: 0, distinctDocs: 0 });
  });

  test("partial verification -> low_confidence", () => {
    const r = ground(
      answered([
        { path: "sources/strata-sdk/overview.md", quote: "wraps Copier" },
        { path: "sources/strata-sdk/ghost.md", quote: "does not exist" },
      ]),
      NODES,
      reader,
    );
    expect(r.status).toBe("low_confidence");
    expect(r.grounding).toEqual({ citationsTotal: 2, citationsResolved: 1, quotesVerified: 1, distinctDocs: 1 });
  });

  test("docs/-prefixed citation path still resolves", () => {
    const r = ground(
      answered([{ path: "docs/sources/strata-sdk/overview.md", quote: "wraps Copier" }]),
      NODES,
      reader,
    );
    expect(r.status).toBe("answered");
    expect(r.sources[0].path).toBe("sources/strata-sdk/overview.md");
  });

  test("empty quote never verifies", () => {
    const r = ground(answered([{ path: "sources/strata-sdk/overview.md", quote: "   " }]), NODES, reader);
    expect(r.status).toBe("no_match");
    expect(r.grounding.quotesVerified).toBe(0);
  });

  test("model no_match passes through with empty grounding", () => {
    const r = ground({ status: "no_match", answer: null, citations: [] }, NODES, reader);
    expect(r.status).toBe("no_match");
    expect(r.grounding).toEqual({ citationsTotal: 0, citationsResolved: 0, quotesVerified: 0, distinctDocs: 0 });
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
    expect(r.status).toBe("answered");
    expect(r.grounding).toEqual({ citationsTotal: 3, citationsResolved: 3, quotesVerified: 3, distinctDocs: 2 });
    expect(r.sources).toContainEqual({ path: "sources/oscer/tasks.md", verified: "needs-review" });
  });
});
