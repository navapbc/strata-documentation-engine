import { afterEach, describe, expect, test, vi } from "vitest";
import { TimeoutError, toRun, withTimeout } from "./agent.js";

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

describe("withTimeout", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test("resolves with the work value when it finishes in time", async () => {
    await expect(withTimeout(Promise.resolve("done"), 1000)).resolves.toBe("done");
  });

  test("rejects with a TimeoutError carrying the budget when work is too slow", async () => {
    vi.useFakeTimers();
    const slow = new Promise<string>((resolve) => setTimeout(() => resolve("late"), 100_000));
    const bounded = withTimeout(slow, 60_000);
    const assertion = expect(bounded).rejects.toMatchObject({
      name: "TimeoutError",
      timeoutMs: 60_000,
    });
    await vi.advanceTimersByTimeAsync(60_000);
    await assertion;
  });

  test("TimeoutError is an Error", () => {
    const e = new TimeoutError(60_000);
    expect(e).toBeInstanceOf(Error);
    expect(e.timeoutMs).toBe(60_000);
  });
});
