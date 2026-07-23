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
  ask(prompt: string, model: string, docsRoot: string): Promise<AgentRun>;
  reformat(malformed: string, model: string): Promise<AgentRun>;
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

    async ask(prompt: string, model: string, docsRoot: string): Promise<AgentRun> {
      const r = await Agent.prompt(prompt, buildAgentOptions(model, docsRoot));
      return toRun(r as SdkRunResultLike);
    },

    async reformat(malformed: string, model: string): Promise<AgentRun> {
      // Tool-less repair: no retrieval re-run. The agent gets only the malformed
      // text and must re-emit it as valid JSON; cwd still locked down.
      const prompt = `The following text was supposed to contain exactly one fenced JSON block with fields "status", "answer", "citations" (array of { "path", "quote" }). Re-emit ONLY that JSON, valid, in a single \`\`\`json fence. Do not change any values. Do not use any tools.\n\n${malformed}`;
      const r = await Agent.prompt(prompt, buildAgentOptions(model, process.cwd()));
      return toRun(r as SdkRunResultLike);
    },
  };
}
