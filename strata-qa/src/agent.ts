import { Agent, Cursor } from "@cursor/sdk";
import type { AgentModeOption, ModelSelection } from "@cursor/sdk";
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
const READ_ONLY_MODE: AgentModeOption = "plan";

function buildAgentOptions(model: string, cwd: string): {
  model: ModelSelection;
  apiKey: string | undefined;
  mode: AgentModeOption;
  local: { cwd: string };
} {
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

// One cache per container/process, deliberately outside createCursorSeam: handler.ts
// builds a seam per invocation, so per-instance state would never survive a warm start.
const preflightCache = createPreflightCache();

export function resetPreflightCache(): void {
  preflightCache.reset();
}

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

    supportsReadOnlyLockdown(): boolean {
      // No runtime capability query exists on the SDK for this. The honest signal
      // available is that the SDK's exported surface still offers the `mode:"plan"`
      // path we live-verified in NOTES.md (Task 2): `Agent.prompt` is present as a
      // callable, and `READ_ONLY_MODE` is a `"plan"` literal of the SDK's own
      // `AgentModeOption` union (a future SDK that drops the "plan" branch fails to
      // typecheck this file, not silently return true here). This is the CLI's exit-5
      // gate: if this ever needs to become false, wire in a real feature probe.
      return typeof Agent.prompt === "function" && READ_ONLY_MODE === "plan";
    },

    async ask(prompt: string, model: string, docsRoot: string, timeoutMs: number): Promise<AgentRun> {
      const r = await withTimeout(Agent.prompt(prompt, buildAgentOptions(model, docsRoot)), timeoutMs);
      return toRun(r as SdkRunResultLike);
    },

    async reformat(malformed: string, model: string, timeoutMs: number): Promise<AgentRun> {
      // Tool-less repair: no retrieval re-run. The agent gets only the malformed
      // text and must re-emit it as valid JSON; cwd still locked down.
      const prompt = buildRepairPrompt(malformed);
      const r = await withTimeout(Agent.prompt(prompt, buildAgentOptions(model, process.cwd())), timeoutMs);
      return toRun(r as SdkRunResultLike);
    },
  };
}
