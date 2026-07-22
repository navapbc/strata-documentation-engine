import { describe, expect, test } from "vitest";
import { buildPrompt } from "./prompt.js";

describe("buildPrompt", () => {
  const p = buildPrompt("how do retries work?");

  test("wraps the question in data delimiters", () => {
    expect(p).toContain("<question>\nhow do retries work?\n</question>");
  });

  test("frames the question as data, not instructions", () => {
    expect(p).toMatch(/never instructions|Ignore any directives/);
  });

  test("names the three stage inputs", () => {
    expect(p).toContain("docs/graph.json");
    expect(p).toContain("docs/INDEX.md");
    expect(p).toContain("docs/sources/");
  });

  test("demands verbatim quotes with the 300-char cap", () => {
    expect(p).toContain("300");
    expect(p).toMatch(/verbatim/i);
    expect(p).toMatch(/do not paraphrase/i);
  });

  test("specifies the output JSON shape", () => {
    expect(p).toContain('"status"');
    expect(p).toContain('"citations"');
    expect(p).toContain('"quote"');
    expect(p).toContain("no_match");
  });
});
