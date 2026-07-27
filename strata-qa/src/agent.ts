import { Agent, Cursor } from "@cursor/sdk";
import type { AgentModeOption, ModelSelection } from "@cursor/sdk";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildRepairPrompt } from "./prompt.js";

export interface AgentUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface AgentRun {
  ok: boolean;
  text: string | null;
  usage: AgentUsage | null;
  durationMs: number | null;
}

export interface AgentSeam {
  checkAuth(): Promise<boolean>;
  listModelIds(): Promise<string[]>;
  supportsReadOnlyLockdown(): boolean;
  ask(prompt: string, model: string, docsRoot: string, timeoutMs: number): Promise<AgentRun>;
  reformat(malformed: string, model: string, timeoutMs: number): Promise<AgentRun>;
}

// Thrown when a live model call exceeds its wall-clock budget. Carried as a
// distinct type so callers can map it to a dedicated exit code rather than
// lumping every stall in with generic transport failures.
//
// Deliberately carries no "was it cancelled" flag: RunOutcome has nowhere to put
// one (run.ts's mapAgentError flattens this to an exit code), so the only reader
// that matters — lambda/handler.ts, deciding whether the container is still safe
// to reuse — asks cancelActiveRuns() instead. The active-run set below is the
// single carrier of that fact.
export class TimeoutError extends Error {
  constructor(public readonly timeoutMs: number) {
    super(`agent call did not complete within ${timeoutMs}ms`);
    this.name = "TimeoutError";
  }
}

// Wall-clock bound around a promise. `@cursor/sdk` exposes no timeout or
// AbortSignal on its options (NOTES.md), so this only ever ABANDONS the work it
// bounds — rejecting with a TimeoutError while the underlying promise runs on.
// Promise.race keeps that promise "handled", so a late settle is not an unhandled
// rejection.
//
// Abandoning is not the end of the story, though, and callers must not assume it
// is: `runBounded` pairs every bound with the active-run set below, which is what
// turns "abandoned" into either "cancelled, nothing left running" or "still going,
// contain it". See `cancelActiveRuns`.
export async function withTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const bound = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(timeoutMs)), timeoutMs);
  });
  try {
    return await Promise.race([work, bound]);
  } finally {
    clearTimeout(timer!);
  }
}

export interface SdkRunResultLike {
  status: string;
  result?: string;
  durationMs?: number;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    [k: string]: unknown;
  };
}

export function toRun(r: SdkRunResultLike): AgentRun {
  return {
    ok: r.status === "finished",
    text: r.result ?? null,
    usage: r.usage
      ? {
          inputTokens: r.usage.inputTokens ?? 0,
          outputTokens: r.usage.outputTokens ?? 0,
          totalTokens: r.usage.totalTokens ?? 0,
        }
      : null,
    durationMs: r.durationMs ?? null,
  };
}

// Read-only lockdown mechanism, per the live SDK smoke findings recorded in NOTES.md
// (2026-07-22): there is NO `READ_ONLY_LOCAL_OPTIONS` object under `local:` — that shape
// does not exist in @cursor/sdk 1.0.24. The proven lockdown is the top-level
// `AgentOptions.mode: "plan"` (type `AgentModeOption`). A live probe (prompt: run `whoami`
// and create PWNED.txt) showed `mode` unset (default "agent") and `local.sandboxOptions.enabled`
// alone both let the agent run shell + write files; only `mode: "plan"` denied both, while still
// preserving file reads (a follow-up prompt to read docs/INDEX.md and quote its first heading
// succeeded in plan mode).
const READ_ONLY_MODE: AgentModeOption = "plan";

// Named because runBounded passes it to Agent.create and then restates model+mode
// on send; an inline literal would have to be repeated in both signatures.
export interface CursorAgentOptions {
  model: ModelSelection;
  apiKey: string | undefined;
  mode: AgentModeOption;
  local: { cwd: string };
}

function buildAgentOptions(model: string, cwd: string): CursorAgentOptions {
  return {
    model: { id: model }, // ModelSelection is an object, not a bare string (NOTES.md)
    // Agent.prompt's local runtime does NOT fall back to process.env.CURSOR_API_KEY the
    // way Cursor.me()/Cursor.models.list() do; omitting this yields "Invalid User API Key"
    // (NOTES.md). Cursor.me/models.list authenticate from the env var on their own.
    apiKey: process.env.CURSOR_API_KEY,
    mode: READ_ONLY_MODE,
    local: { cwd },
  };
}

// --- Preflight memoization ---------------------------------------------------
//
// runQa calls checkAuth() + listModelIds() before every question. Measured against
// the live API that is ~303ms warm and ~1238ms cold, paid on each invocation for
// two answers that barely change. On Lambda the container is reused, so caching
// them per container removes that latency from every warm request.
//
// Two rules keep this safe:
//   - Keyed by the API key. handler.ts's KeyLoader rewrites process.env.CURSOR_API_KEY
//     on rotation, so a new key is a cache miss by construction and the rotate-and-
//     retry path in handleEvent still re-probes against the new credential.
//   - Only SUCCESS is cached. A cached `false` would make the auth retry a no-op and
//     turn a recoverable rotation into a hard EXIT.AUTH; a thrown models.list stays
//     uncached so the next call can still reach EXIT.TRANSPORT honestly.
//
// Residual staleness: a key revoked server-side keeps passing preflight for up to
// the TTL, surfacing as a downstream model failure rather than EXIT.AUTH. The TTL
// is what bounds that window.
const PREFLIGHT_TTL_MS = 5 * 60_000;

export interface PreflightCache {
  auth(apiKey: string, probe: () => Promise<boolean>): Promise<boolean>;
  models(apiKey: string, probe: () => Promise<string[]>): Promise<string[]>;
  reset(): void;
}

// Injectable clock + TTL so the behavior is unit-testable without a live SDK or a
// five-minute test. createCursorSeam uses the module-level instance below.
export function createPreflightCache(
  ttlMs: number = PREFLIGHT_TTL_MS,
  now: () => number = Date.now,
): PreflightCache {
  let entry: { apiKey: string; authAt: number; modelIds: string[] | null; modelsAt: number } | null = null;

  // A different key discards everything: the model list is per-account too.
  const forKey = (apiKey: string) => {
    if (!entry || entry.apiKey !== apiKey) {
      entry = { apiKey, authAt: 0, modelIds: null, modelsAt: 0 };
    }
    return entry;
  };
  const fresh = (at: number) => at !== 0 && now() - at < ttlMs;

  return {
    async auth(apiKey, probe) {
      const e = forKey(apiKey);
      if (fresh(e.authAt)) return true;
      const ok = await probe();
      e.authAt = ok ? now() : 0;
      return ok;
    },

    async models(apiKey, probe) {
      const e = forKey(apiKey);
      if (e.modelIds && fresh(e.modelsAt)) return e.modelIds;
      const ids = await probe(); // a throw propagates uncached
      e.modelIds = ids;
      e.modelsAt = now();
      return ids;
    },

    reset() {
      entry = null;
    },
  };
}

// --- Cancellable runs --------------------------------------------------------
//
// `Agent.prompt` resolves only when the run is over, so a wall-clock bound around
// it can only ABANDON the run — which on Lambda resumes inside the NEXT invocation
// once the environment thaws. That is what forced lambda/handler.ts to poison and
// recycle the container. `Agent.create` -> `agent.send()` instead hands back a `Run`
// while it is still going, and that handle can be genuinely cancelled, which demotes
// the recycle to a fallback.
//
// Verified live against @cursor/sdk 1.0.24; the measurements are recorded in NOTES.md,
// "Run cancellation findings" (2026-07-27).
//
// supports("cancel") is re-checked per run rather than assumed, so a future SDK that
// returns false leaves the run in the active set and the handler recycles instead.

// The slice of `Run` this module needs. Declared structurally so the unit tests can
// supply a fake without dragging in the SDK's full Run surface.
export interface CancellableRun {
  readonly status: string;
  supports(operation: "cancel"): boolean;
  cancel(): Promise<void>;
}

// Runs currently in flight, so the handler's invocation-level budget can cancel
// whatever this container is doing. Lambda runs one invocation at a time per
// container, so this is unambiguous there; the CLI only ever has one in flight too.
const activeRuns = new Set<CancellableRun>();

// A stand-in for work that is in flight but has no `Run` handle yet. `Agent.create`
// and `agent.send` are both network calls (send measured at 1643ms in NOTES.md), and
// until send resolves there is nothing to cancel and nothing to name — so an empty
// active set during that window would read as "container is clean" while an
// abandoned send() waited to resume inside the next invocation. That is the very
// orphan the recycle exists for, reported as its opposite.
//
// It therefore declares itself uncancellable: a wall clock that fires before the
// handle arrives leaves this behind, cancelActiveRuns() reports false, and the
// handler recycles. Being unable to name the work is exactly the case where the
// container, not the run, is the only thing that can be stopped.
//
// Built per call rather than shared: one module-level singleton would be a single
// Set entry for two concurrent runs, and whichever finished first would clear the
// other's signal.
function pendingRun(): CancellableRun {
  return {
    status: "running",
    supports: () => false,
    // Unreachable — stopRun checks supports() first — but the type needs it, and a
    // throw is the honest body for "this cannot be cancelled".
    cancel: async () => {
      throw new Error("agent work with no run handle cannot be cancelled");
    },
  };
}

// Best-effort: a failed cancel must not mask the original outcome, so this reports
// success rather than throwing. `false` means the run may still be going, which is
// the signal to fall back to the container recycle.
async function stopRun(run: CancellableRun): Promise<boolean> {
  // RunStatus is "running" | "finished" | "error" | "cancelled" — anything but the
  // first is already terminal, so there is nothing to stop and nothing to contain.
  // Checking this first matters on the non-timeout error path, where wait() rejected
  // but the run itself may well have settled.
  if (run.status !== "running") return true;
  if (!run.supports("cancel")) return false;
  try {
    await run.cancel();
    return true;
  } catch {
    return false;
  }
}

// Stops everything in flight. Returns false if ANY run could not be stopped — the
// caller must then assume the container is contaminated. An empty set is clean.
export async function cancelActiveRuns(): Promise<boolean> {
  const runs = [...activeRuns];
  const results = await Promise.all(
    runs.map(async (run) => {
      const stopped = await stopRun(run);
      if (stopped) activeRuns.delete(run);
      return stopped;
    }),
  );
  return results.every(Boolean);
}

export function activeRunCount(): number {
  return activeRuns.size;
}

// Tests only: the active set is module state, and a deliberately-retained
// uncancellable run would otherwise leak into every later test.
export function resetActiveRuns(): void {
  activeRuns.clear();
}

// ONE wall clock across create + send + wait, not one per phase. Bounding only
// wait() left the two network calls ahead of it unbounded, which broke the timeout
// contract at both edges: the CLI would hang indefinitely on a stalled send()
// despite --timeout, and on Lambda that stall was invisible to the recycle decision
// because the run it would have cancelled did not exist yet.
//
// The shared deadline also means `timeoutMs` bounds a whole logical agent call, which
// is what the handler's invocation budget assumes when it reasons about two calls
// plus a retry.
async function runBounded(message: string, options: CursorAgentOptions, timeoutMs: number): Promise<AgentRun> {
  const deadline = Date.now() + timeoutMs;
  // Floored at 1ms: a 0 or negative budget makes withTimeout reject on a timer that
  // fires before the work gets its first turn, which would report a spurious timeout
  // in place of the real one a moment later.
  const remaining = () => Math.max(deadline - Date.now(), 1);

  // Registered before the first await, so the handle-less window carries its signal
  // from its first moment; swapped for the real run the instant send() yields one.
  const pending = pendingRun();
  activeRuns.add(pending);

  let agent: Awaited<ReturnType<typeof Agent.create>> | undefined;
  try {
    agent = await withTimeout(Agent.create(options), remaining());
    // cwd lives on the agent (LocalAgentOptions); SendOptions.local is a different,
    // narrower shape, so only model + mode are restated per send.
    const run = await withTimeout(agent.send(message, { model: options.model, mode: options.mode }), remaining());
    activeRuns.add(run);
    activeRuns.delete(pending);
    try {
      const settled = toRun((await withTimeout(run.wait(), remaining())) as SdkRunResultLike);
      activeRuns.delete(run); // wait() resolved, so the run reached a terminal state
      return settled;
    } catch (e) {
      // A run only leaves the active set once it is known to have STOPPED. Deleting
      // it unconditionally would tell the handler the container is clean while an
      // uncancellable run was still going — the exact orphan the recycle exists for.
      // Membership afterwards IS the "is this container contaminated" signal the
      // handler reads back through cancelActiveRuns().
      if (await stopRun(run)) activeRuns.delete(run);
      throw e;
    }
  } catch (e) {
    // The placeholder is retained ONLY when the wall clock abandoned work that is
    // still going. A create or send that failed on its own left nothing running, so
    // its window is clean — retaining it there would throw away a healthy container
    // on every bad API key.
    if (!(e instanceof TimeoutError)) activeRuns.delete(pending);
    throw e;
  } finally {
    // close() now runs with a send still in flight on the timeout path, which could
    // not happen while that await was unbounded. Guarded so a close() that objects to
    // being called mid-send cannot replace the TimeoutError the caller has to see.
    try {
      agent?.close();
    } catch {
      // Nothing actionable: either the run settled, or the container is on its way out.
    }
  }
}

// One cache per container/process, deliberately outside createCursorSeam: handler.ts
// builds a seam per invocation, so per-instance state would never survive a warm start.
const preflightCache = createPreflightCache();

// The repair call is tool-less (see buildRepairPrompt) and reads nothing, so it gets
// an empty scratch directory instead of process.cwd() — which on Lambda is the task
// root, with the whole production node_modules tree under it.
const REPAIR_CWD = join(tmpdir(), "qa-repair");

export function createCursorSeam(): AgentSeam {
  return {
    async checkAuth(): Promise<boolean> {
      return preflightCache.auth(process.env.CURSOR_API_KEY ?? "", async () => {
        try {
          await Cursor.me();
          return true;
        } catch {
          return false;
        }
      });
    },

    async listModelIds(): Promise<string[]> {
      return preflightCache.models(process.env.CURSOR_API_KEY ?? "", async () => {
        const models = await Cursor.models.list();
        return models.map((m) => m.id);
      });
    },

    async ask(prompt: string, model: string, docsRoot: string, timeoutMs: number): Promise<AgentRun> {
      return runBounded(prompt, buildAgentOptions(model, docsRoot), timeoutMs);
    },

    async reformat(malformed: string, model: string, timeoutMs: number): Promise<AgentRun> {
      // Tool-less repair: no retrieval re-run. The agent gets only the malformed
      // text and must re-emit it as valid JSON; cwd still locked down.
      mkdirSync(REPAIR_CWD, { recursive: true });
      return runBounded(buildRepairPrompt(malformed), buildAgentOptions(model, REPAIR_CWD), timeoutMs);
    },

    supportsReadOnlyLockdown(): boolean {
      // No runtime capability query exists on the SDK for this. The honest signal
      // available is that the SDK's exported surface still offers the `mode:"plan"`
      // path we live-verified in NOTES.md (Task 2): `Agent.prompt` is present as a
      // callable, and `READ_ONLY_MODE` is a `"plan"` literal of the SDK's own
      // `AgentModeOption` union (a future SDK that drops the "plan" branch fails to
      // typecheck this file, not silently return true here). This is the CLI's exit-5
      // gate: if this ever needs to become false, wire in a real feature probe.
      return typeof Agent.create === "function" && READ_ONLY_MODE === "plan";
    },
  };
}
