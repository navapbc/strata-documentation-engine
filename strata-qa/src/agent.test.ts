import { afterEach, describe, expect, test, vi } from "vitest";
import { createPreflightCache, TimeoutError, toRun, withTimeout } from "./agent.js";

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

describe("createPreflightCache", () => {
  const TTL = 300_000;
  // Injected clock: the TTL behavior is testable without waiting five minutes.
  function fixture() {
    let clock = 1_000;
    const cache = createPreflightCache(TTL, () => clock);
    return { cache, advance: (ms: number) => (clock += ms) };
  }

  test("a second auth check for the same key does not re-probe", async () => {
    const { cache } = fixture();
    let probes = 0;
    const probe = async () => (probes++, true);
    await expect(cache.auth("k1", probe)).resolves.toBe(true);
    await expect(cache.auth("k1", probe)).resolves.toBe(true);
    expect(probes).toBe(1);
  });

  test("a failed auth check is never cached, so the rotate-and-retry path still re-probes", async () => {
    const { cache } = fixture();
    let probes = 0;
    // The regression this guards: caching `false` would make handleEvent's
    // invalidate-then-retry a no-op and turn a rotation into a hard EXIT.AUTH.
    await expect(cache.auth("k1", async () => (probes++, false))).resolves.toBe(false);
    await expect(cache.auth("k1", async () => (probes++, false))).resolves.toBe(false);
    await expect(cache.auth("k1", async () => (probes++, true))).resolves.toBe(true);
    expect(probes).toBe(3);
  });

  test("a different key is a cache miss for both auth and models", async () => {
    const { cache } = fixture();
    let auths = 0;
    let lists = 0;
    await cache.auth("old", async () => (auths++, true));
    await cache.models("old", async () => (lists++, ["a"]));
    await cache.auth("new", async () => (auths++, true));
    await expect(cache.models("new", async () => (lists++, ["b"]))).resolves.toEqual(["b"]);
    expect([auths, lists]).toEqual([2, 2]);
  });

  test("entries expire once the TTL elapses", async () => {
    const { cache, advance } = fixture();
    let auths = 0;
    let lists = 0;
    await cache.auth("k1", async () => (auths++, true));
    await cache.models("k1", async () => (lists++, ["a"]));

    advance(TTL - 1);
    await cache.auth("k1", async () => (auths++, true));
    await cache.models("k1", async () => (lists++, ["a"]));
    expect([auths, lists]).toEqual([1, 1]); // still fresh

    advance(2);
    await cache.auth("k1", async () => (auths++, true));
    await cache.models("k1", async () => (lists++, ["a"]));
    expect([auths, lists]).toEqual([2, 2]);
  });

  test("a model list is reused, and a throwing probe is not cached", async () => {
    const { cache } = fixture();
    let lists = 0;
    await expect(cache.models("k1", async () => (lists++, ["gpt-5.6-luna"]))).resolves.toEqual([
      "gpt-5.6-luna",
    ]);
    await cache.models("k1", async () => (lists++, ["gpt-5.6-luna"]));
    expect(lists).toBe(1);

    const { cache: c2 } = fixture();
    // A models.list 503 must stay uncached so the next call can still reach
    // EXIT.TRANSPORT honestly rather than serving a stale empty list.
    await expect(c2.models("k1", async () => Promise.reject(new Error("503")))).rejects.toThrow("503");
    await expect(c2.models("k1", async () => ["gpt-5.6-luna"])).resolves.toEqual(["gpt-5.6-luna"]);
  });

  test("reset() clears everything", async () => {
    const { cache } = fixture();
    let probes = 0;
    await cache.auth("k1", async () => (probes++, true));
    cache.reset();
    await cache.auth("k1", async () => (probes++, true));
    expect(probes).toBe(2);
  });
});
