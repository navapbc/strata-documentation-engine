import { describe, expect, test } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendJsonl } from "./log.js";

describe("appendJsonl", () => {
  test("creates directories and appends one line per record", () => {
    const dir = mkdtempSync(join(tmpdir(), "strata-qa-log-"));
    const file = join(dir, "qa", "queries.jsonl");
    appendJsonl(file, { a: 1 });
    appendJsonl(file, { b: "two" });
    const lines = readFileSync(file, "utf8").trim().split("\n");
    expect(lines.map((l) => JSON.parse(l))).toEqual([{ a: 1 }, { b: "two" }]);
  });
});
