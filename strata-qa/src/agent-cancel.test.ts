// Cancellation behavior of the Cursor seam, against a faked @cursor/sdk.
//
// The invariant under test is the one that decides whether lambda/handler.ts
// recycles the container: a run leaves the active set ONLY when it is known to have
// stopped. Getting that backwards in either direction is expensive — reporting a
// live run as stopped leaves an orphan inside the next invocation, and reporting a
// stopped run as live throws away a warm container for nothing.
import { beforeEach, describe, expect, test, vi } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SdkRunResultLike } from "./agent.js";

const sdk = vi.hoisted(() => ({
  run: null as FakeRunLike | null,
  closes: 0,
  createdWith: [] as unknown[],
  sentWith: [] as unknown[],
}));

interface FakeRunLike {
  status: string;
  cancelCalls: number;
  supports(op: "cancel"): boolean;
  cancel(): Promise<void>;
  wait(): Promise<SdkRunResultLike>;
}

vi.mock("@cursor/sdk", () => ({
  Agent: {
    create: async (options: unknown) => {
      sdk.createdWith.push(options);
      return {
        agentId: "agent-test",
        send: async (_message: string, options: unknown) => {
          sdk.sentWith.push(options);
          return sdk.run;
        },
        close: () => {
          sdk.closes += 1;
        },
      };
    },
    // The whole point of the refactor: Agent.prompt gives back no handle, so
    // reaching for it again would silently reintroduce the abandonment bug.
    prompt: async () => {
      throw new Error("Agent.prompt must not be used — it cannot be cancelled");
    },
  },
  Cursor: {
    me: async () => ({ apiKeyName: "test" }),
    models: { list: async () => [{ id: "gpt-5.6-luna" }] },
  },
}));

const { activeRunCount, cancelActiveRuns, createCursorSeam, resetActiveRuns, TimeoutError } =
  await import("./agent.js");

function makeRun(opts: { supportsCancel?: boolean; cancelThrows?: boolean; settle?: SdkRunResultLike } = {}): FakeRunLike {
  const run: FakeRunLike = {
    status: "running",
    cancelCalls: 0,
    supports: () => opts.supportsCancel !== false,
    async cancel() {
      run.cancelCalls += 1;
      if (opts.cancelThrows) throw new Error("cancel failed");
      run.status = "cancelled";
    },
    wait: () =>
      opts.settle ? Promise.resolve(opts.settle) : new Promise<SdkRunResultLike>(() => {}), // never settles
  };
  return run;
}

const FINISHED: SdkRunResultLike = {
  status: "finished",
  result: "ok",
  durationMs: 42,
  usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
};

describe("cancellable agent runs", () => {
  beforeEach(() => {
    resetActiveRuns();
    sdk.closes = 0;
    sdk.createdWith = [];
    sdk.sentWith = [];
  });

  test("a completed run is mapped, forgotten, and its agent closed", async () => {
    sdk.run = makeRun({ settle: FINISHED });
    const out = await createCursorSeam().ask("q", "gpt-5.6-luna", "/docs", 5_000);
    expect(out).toEqual({
      ok: true,
      text: "ok",
      usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
      durationMs: 42,
    });
    expect(activeRunCount()).toBe(0);
    expect(sdk.closes).toBe(1);
    expect(sdk.run.cancelCalls).toBe(0);
  });

  test("a timed-out run is cancelled and forgotten", async () => {
    sdk.run = makeRun();
    await expect(createCursorSeam().ask("q", "gpt-5.6-luna", "/docs", 20)).rejects.toMatchObject({
      name: "TimeoutError",
    });
    expect(sdk.run.cancelCalls).toBe(1);
    expect(activeRunCount()).toBe(0); // nothing left to contain
    expect(sdk.closes).toBe(1);
  });

  test("a run that cannot be cancelled is RETAINED so the container gets recycled", async () => {
    sdk.run = makeRun({ supportsCancel: false });
    const err = await createCursorSeam()
      .ask("q", "gpt-5.6-luna", "/docs", 20)
      .catch((e) => e);
    expect(err).toBeInstanceOf(TimeoutError);
    expect(sdk.run.cancelCalls).toBe(0); // never attempted: supports() said no
    // Retention IS the contamination signal the handler reads.
    expect(activeRunCount()).toBe(1);
    await expect(cancelActiveRuns()).resolves.toBe(false);
  });

  test("a cancel() that throws is also treated as still-running", async () => {
    sdk.run = makeRun({ cancelThrows: true });
    const err = await createCursorSeam()
      .ask("q", "gpt-5.6-luna", "/docs", 20)
      .catch((e) => e);
    expect(err).toBeInstanceOf(TimeoutError);
    expect(sdk.run.cancelCalls).toBe(1);
    expect(activeRunCount()).toBe(1);
  });

  test("a run that already reached a terminal status needs no cancelling", async () => {
    // wait() rejects for a non-timeout reason while the run itself has settled.
    const run = makeRun({ cancelThrows: true });
    run.status = "error";
    run.wait = () => Promise.reject(new Error("socket hang up"));
    sdk.run = run;
    await expect(createCursorSeam().ask("q", "gpt-5.6-luna", "/docs", 5_000)).rejects.toThrow("socket hang up");
    expect(run.cancelCalls).toBe(0);
    expect(activeRunCount()).toBe(0);
  });

  test("cancelActiveRuns is clean and a no-op when nothing is in flight", async () => {
    await expect(cancelActiveRuns()).resolves.toBe(true);
    expect(activeRunCount()).toBe(0);
  });

  test("the read-only lockdown is carried on both create and send", async () => {
    sdk.run = makeRun({ settle: FINISHED });
    await createCursorSeam().ask("q", "gpt-5.6-luna", "/docs", 5_000);
    expect(sdk.createdWith[0]).toMatchObject({ mode: "plan", local: { cwd: "/docs" } });
    expect(sdk.sentWith[0]).toMatchObject({ mode: "plan", model: { id: "gpt-5.6-luna" } });
  });

  test("the repair call is cancellable too, and runs outside the task root", async () => {
    sdk.run = makeRun();
    await expect(createCursorSeam().reformat("prose", "gpt-5.6-luna", 20)).rejects.toMatchObject({
      name: "TimeoutError",
    });
    expect(sdk.run.cancelCalls).toBe(1);
    expect(activeRunCount()).toBe(0);
    // The repair reads nothing, so it must not be handed the process cwd.
    expect(sdk.createdWith[0]).toMatchObject({ local: { cwd: join(tmpdir(), "qa-repair") } });
  });
});
