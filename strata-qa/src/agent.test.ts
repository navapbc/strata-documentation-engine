import { describe, expect, test } from "vitest";
import { toRun } from "./agent.js";

describe("toRun", () => {
  test("maps a finished result", () => {
    expect(
      toRun({
        status: "finished",
        result: "hello",
        durationMs: 1234,
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, cacheReadTokens: 0 },
      }),
    ).toEqual({
      ok: true,
      text: "hello",
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      durationMs: 1234,
    });
  });

  test("maps an error result with missing fields", () => {
    expect(toRun({ status: "error" })).toEqual({ ok: false, text: null, usage: null, durationMs: null });
  });
});
