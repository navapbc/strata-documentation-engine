import { describe, expect, test, vi } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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

  test("a filesystem failure never throws and never touches stdout", () => {
    // A path whose parent is a FILE, not a directory: mkdirSync throws ENOTDIR.
    const dir = mkdtempSync(join(tmpdir(), "strata-qa-log-"));
    const blocker = join(dir, "blocker");
    writeFileSync(blocker, "not a directory");
    const errors: string[] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((m) => {
      errors.push(String(m));
    });
    try {
      expect(() => appendJsonl(join(blocker, "queries.jsonl"), { a: 1 })).not.toThrow();
    } finally {
      spy.mockRestore();
    }
    expect(errors.join("\n")).toMatch(/log write failed/i);
  });
});
