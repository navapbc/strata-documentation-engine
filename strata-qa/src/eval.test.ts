import { describe, expect, test } from "vitest";
import type { QaResult } from "./run.js";
import { errorResult } from "./run.js";
import { formatSummary, scoreFixture } from "./eval.js";

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
