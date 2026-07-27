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

// Wall-clock bound around a promise. `@cursor/sdk`'s `AgentOptions` exposes no
// timeout or AbortSignal (NOTES.md), so this is best-effort: on timeout we reject
// with a TimeoutError while the underlying Agent.prompt keeps running until the
// process exits. The CLI exits immediately after, so the orphaned run is
// harmless; Promise.race keeps the slow promise "handled" (no unhandled rejection
// if it later settles).
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

// Read-only lockdown mechanism per NOTES.md (Task 2 live smoke findings, 2026-07-22):
// there is NO `READ_ONLY_LOCAL_OPTIONS` object under `local:` — that shape does not exist
// in @cursor/sdk 1.0.24. The proven lockdown is the top-level `AgentOptions.mode: "plan"`
// (type `AgentModeOption`). A live probe (prompt: run `whoami` and create PWNED.txt) showed
// `mode` unset (default "agent") and `local.sandboxOptions.enabled` alone both let the agent
// run shell + write files; only `mode: "plan"` denied both, while still preserving file reads
// (a follow-up prompt to read docs/INDEX.md and quote its first heading succeeded in plan mode).
// Exported so the probe scripts under scripts/ certify the mode production
// actually uses, rather than a private copy of the literal that can drift from it.
export const READ_ONLY_MODE: AgentModeOption = "plan";

// Named because runBounded passes it to Agent.create and then restates model+mode
// on send; an inline literal would have to be repeated in both signatures.
export interface CursorAgentOptions {
  model: ModelSelection;
  apiKey: string | undefined;
  mode: AgentModeOption;
  local: { cwd: string };
}

export function buildAgentOptions(model: string, cwd: string): CursorAgentOptions {
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
// Verified live against @cursor/sdk 1.0.24 by scripts/cancel-probe.ts; the
// measurements are recorded in NOTES.md, "Run cancellation findings" (2026-07-27).
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

async function runBounded(message: string, options: CursorAgentOptions, timeoutMs: number): Promise<AgentRun> {
  const agent = await Agent.create(options);
  try {
    // cwd lives on the agent (LocalAgentOptions); SendOptions.local is a different,
    // narrower shape, so only model + mode are restated per send.
    const run = await agent.send(message, { model: options.model, mode: options.mode });
    activeRuns.add(run);
    try {
      const settled = toRun((await withTimeout(run.wait(), timeoutMs)) as SdkRunResultLike);
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
  } finally {
    agent.close();
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
