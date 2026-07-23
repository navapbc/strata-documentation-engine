import { Agent, Cursor } from "@cursor/sdk";
import type { AgentModeOption, ModelSelection } from "@cursor/sdk";

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

export function createCursorSeam(): AgentSeam {
  return {
    async checkAuth(): Promise<boolean> {
      try {
        await Cursor.me();
        return true;
      } catch {
        return false;
      }
    },

    async listModelIds(): Promise<string[]> {
      const models = await Cursor.models.list();
      return models.map((m) => m.id);
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
      const prompt = `The following text was supposed to contain exactly one fenced JSON block with fields "status", "answer", "citations" (array of { "path", "quote" }). Re-emit ONLY that JSON, valid, in a single \`\`\`json fence. Do not change any values. Do not use any tools.\n\n${malformed}`;
      const r = await withTimeout(Agent.prompt(prompt, buildAgentOptions(model, process.cwd())), timeoutMs);
      return toRun(r as SdkRunResultLike);
    },
  };
}
