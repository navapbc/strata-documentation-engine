import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import type { QaResult } from "./run.js";
import { DEFAULT_MODEL, errorResult } from "./run.js";
import { BLOCK, fakeSeam, finished, makeDocsRoot } from "./fixtures.js";
import { formatSummary, runEval, scoreFixture } from "./eval.js";

// Built from run.ts's own errorResult so a new QaResult field is one edit there
// rather than a silent divergence here.
function result(status: QaResult["status"], quotesVerified = 1, citationsResolved = 1): QaResult {
  return {
    ...errorResult("m", "v", { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, 100),
    status,
    answer: status === "answered" ? "yes" : null,
    grounding: { citationsTotal: citationsResolved, citationsResolved, quotesVerified, distinctDocs: 1, docsCited: 1 },
  };
}

describe("scoreFixture", () => {
  test("answerable passes only on answered", () => {
    const f = { question: "q", expect: "answerable" as const };
    expect(scoreFixture(f, result("answered")).pass).toBe(true);
    expect(scoreFixture(f, result("no_match")).pass).toBe(false);
    expect(scoreFixture(f, result("low_confidence")).pass).toBe(false);
    expect(scoreFixture(f, result("error")).pass).toBe(false);
  });

  test("refuse passes on either refusal status, never on error", () => {
    const f = { question: "q", expect: "refuse" as const };
    expect(scoreFixture(f, result("no_match")).pass).toBe(true);
    expect(scoreFixture(f, result("low_confidence")).pass).toBe(true);
    expect(scoreFixture(f, result("answered")).pass).toBe(false);
    expect(scoreFixture(f, result("error")).pass).toBe(false);
  });

  test("flags a quote downgrade when quotes verified < citations resolved", () => {
    const f = { question: "q", expect: "answerable" as const };
    expect(scoreFixture(f, result("low_confidence", 1, 2)).quoteDowngrade).toBe(true);
    expect(scoreFixture(f, result("answered", 2, 2)).quoteDowngrade).toBe(false);
  });
});

describe("runEval", () => {
  // Nine fixtures share one process, so an orphan from fixture 3 is still spending
  // (~190k tokens a question, NOTES.md) while 4 through 9 run. The Lambda answers
  // this by recycling the container; the loop's equivalent is to stop scheduling.
  function fixtures(count: number): string {
    const path = join(mkdtempSync(join(tmpdir(), "strata-qa-eval-")), "golden.json");
    writeFileSync(
      path,
      JSON.stringify(Array.from({ length: count }, (_, i) => ({ question: `q${i}`, expect: "answerable" }))),
    );
    return path;
  }

  const opts = (fixturesPath: string, root: string) => ({
    fixturesPath,
    model: DEFAULT_MODEL,
    docsRoot: root,
    timeoutMs: 60_000,
    logDir: join(root, "logs"),
  });

  test("scores every fixture when nothing is left in flight", async () => {
    const root = makeDocsRoot();
    let written = "";
    const code = await runEval(opts(fixtures(3), root), fakeSeam(), (s) => (written += s), {
      activeRuns: () => 0,
    });
    expect(code).toBe(0);
    expect(written.match(/^PASS/gm)).toHaveLength(3);
    expect(written).toContain("3/3 passed");
  });

  test("aborts the loop when a run could not be cancelled, keeping the partial table", async () => {
    const root = makeDocsRoot();
    let written = "";
    let asked = 0;
    const seam = fakeSeam({ ask: async () => (asked += 1, finished(BLOCK)) });
    const code = await runEval(opts(fixtures(9), root), seam, (s) => (written += s), {
      activeRuns: () => 1,
      cancelRuns: async () => false,
    });
    // Fixture 1 is scored and reported; nothing after it is even attempted.
    expect(asked).toBe(1);
    expect(written.match(/^PASS/gm)).toHaveLength(1);
    expect(written).toMatch(/ABORTED after 1\/9/);
    expect(written).toContain("1/1 passed");
    // Non-zero: the loop did not do what it was asked to do, whatever the rows say.
    expect(code).not.toBe(0);
  });

  test("keeps going when the leftover run was successfully cancelled", async () => {
    const root = makeDocsRoot();
    let written = "";
    let inFlight = 1;
    const code = await runEval(opts(fixtures(3), root), fakeSeam(), (s) => (written += s), {
      activeRuns: () => inFlight,
      cancelRuns: async () => ((inFlight = 0), true),
    });
    expect(code).toBe(0);
    expect(written.match(/^PASS/gm)).toHaveLength(3);
    expect(written).not.toMatch(/ABORTED/);
  });

  test("bounds each fixture with maxTotalMs", async () => {
    const root = makeDocsRoot();
    let written = "";
    const seam = fakeSeam({ ask: () => new Promise(() => {}) }); // never settles
    const code = await runEval({ ...opts(fixtures(2), root), maxTotalMs: 50 }, seam, (s) => (written += s), {
      activeRuns: () => 0,
    });
    // Both fixtures ran and both were cut off, rather than the loop hanging forever.
    expect(written.match(/^FAIL/gm)).toHaveLength(2);
    expect(code).not.toBe(0);
  });

  test("each fixture's log row gets its own runId", async () => {
    const root = makeDocsRoot();
    const logDir = join(root, "logs");
    await runEval({ ...opts(fixtures(2), root), gitSha: "abc1234" }, fakeSeam(), () => {}, {
      activeRuns: () => 0,
    });
    const rows = readFileSync(join(logDir, "queries.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(rows).toHaveLength(2);
    expect(rows[0].runId).toBeDefined();
    expect(rows[0].runId).not.toBe(rows[1].runId);
    expect(rows[0].gitSha).toBe("abc1234");
  });
});

describe("formatSummary", () => {
  test("reports pass count, latency, tokens, downgrades", () => {
    const rows = [
      scoreFixture({ question: "a", expect: "answerable" }, result("answered")),
      scoreFixture({ question: "b", expect: "refuse" }, result("answered", 1, 2)),
    ];
    const s = formatSummary(rows);
    expect(s).toContain("1/2 passed");
    expect(s).toContain("mean latency: 100 ms");
    expect(s).toContain("total tokens: 4");
    expect(s).toContain("quote-downgrades: 1");
  });
});
