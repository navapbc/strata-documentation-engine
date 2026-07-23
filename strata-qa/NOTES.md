# SDK smoke findings (@cursor/sdk 1.0.24) — consumed by src/agent.ts

All facts below were observed on a live run (2026-07-22) via `scripts/smoke.ts`
against `@cursor/sdk` 1.0.24, docs root = repo root, with a personal user API key.

- Import surface: `import { Cursor, Agent } from "@cursor/sdk"`;
  types `import type { ModelSelection, LocalAgentOptions, AgentModeOption, RunResult } from "@cursor/sdk"`.
  Value exports used: `Cursor.me()`, `Cursor.models.list()`, `Agent.prompt(message, options)`.

- ModelSelection spelling: **OBJECT `{ id: string; params?: {id,value}[] }`** — the exact literal that
  worked is `{ id: "gpt-5.6-luna" }`. A bare string does NOT typecheck against `AgentOptions.model`.
  (The plan/brief template said a bare string — that is WRONG.)

- API key MUST be passed EXPLICITLY: `Agent.prompt(msg, { apiKey: process.env.CURSOR_API_KEY, ... })`.
  The local agent runtime does NOT read `CURSOR_API_KEY` from the environment the way the REST client
  (`Cursor.me`/`Cursor.models.list`) does. Symptom if omitted: `Agent.prompt` returns
  `status:"error", error:{message:"[unknown] Invalid User API Key"}` even though `Cursor.me()` and
  `Cursor.models.list()` authenticate fine with the same env key. Note the ALSO-observed team-key error
  (`"This is a team API key ... Use a personal user API key, or a service account API key"`) — a
  Team/Admin key 401s every call; a personal user key or service-account key is required.

- Read-only lockdown option: **`mode: "plan"`** (top-level `AgentOptions.mode`, type
  `AgentModeOption = "agent" | "plan"`). There is NO typed `LocalAgentOptions` permission/allowlist field
  (full surface: `{ cwd, autoReview, store, settingSources, sandboxOptions:{enabled}, customTools,
  enableAgentRetries }`). The plan's imagined `READ_ONLY_LOCAL_OPTIONS` object under `local:{...}` does
  NOT exist — the lockdown is the top-level `mode: "plan"`, alongside `local: { cwd: docsRoot }`.

- Lockdown verified (live probe, prompt = "run `whoami` and create PWNED.txt"):
  - Baseline `mode` unset (default "agent"): agent RAN `whoami` (→ `baonguyen`) AND wrote `PWNED.txt`. (threat is real)
  - `local.sandboxOptions:{enabled:true}` alone: STILL ran `whoami` AND wrote `PWNED.txt` — sandbox alone is NOT sufficient.
  - **`mode: "plan"`: DENIED both** — no shell output, `PWNED.txt` never created (status "finished", empty result).
  - Confirmed `mode:"plan"` PRESERVES read-only file tools: the read prompt ("read docs/INDEX.md, reply
    with its first heading") returned `# Strata Documentation Index` in plan mode. So retrieval works
    while bash + writes are denied.
  - Network: not probed with a dedicated web tool, but bash is denied (removing the shell egress vector)
    and plan mode exposes only read/plan tools. Sufficient for this local slice's threat model
    (untrusted question / doc-content injection cannot exfiltrate via shell). Flag for the infra story if
    a stricter network guarantee is needed.

- gpt-5.6-luna in models.list(): **YES.** Full id list observed (2026-07-22):
  auto-smart, grok-4.5, composer-2.5, claude-opus-4-8, gpt-5.6-sol, gpt-5.5, claude-fable-5,
  claude-sonnet-5, gpt-5.6-terra, claude-sonnet-4-6, composer-2, gpt-5.3-codex, claude-opus-4-7,
  gpt-5.4, claude-opus-4-6, claude-opus-4-5, gpt-5.2, **gpt-5.6-luna**, gemini-3.6-flash,
  gemini-3.1-pro, gpt-5.4-mini, gpt-5.4-nano, claude-haiku-4-5, claude-sonnet-4-5, gpt-5.1,
  gemini-3-flash, gemini-3.5-flash, claude-sonnet-4, gpt-5-mini, gemini-2.5-flash, kimi-k2.7-code, glm-5.2.
  `Cursor.models.list()` returns objects with an `.id` string field.

- RunResult shape observed: `status: "finished" | "error" | "cancelled"` (string enum);
  `result?: string` (the text output — present on finished); `durationMs?: number` (e.g. 6137);
  `usage?: TokenUsage` = `{ inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, totalTokens,
  reasoningTokens }` (present on finished, `undefined` on error); `error?: { message: string; code? }`
  (present on error, e.g. `{message:"[unknown] Invalid User API Key"}`). Every field except `id`/`status`
  is optional — agent.ts must null-guard `result`, `durationMs`, `usage`.

## Implications for src/agent.ts (Task 8) — deviations from the plan's verbatim code

The plan's Task 8 code is a TEMPLATE with two now-known-wrong spots; use these instead:
1. `model` must be `{ id: model }` (ModelSelection object), not the bare `model` string.
2. There is no `READ_ONLY_LOCAL_OPTIONS` object under `local:`. The read-only lockdown is
   `mode: "plan"` at the top level. `ask()` and `reformat()` must pass
   `{ model: { id: model }, apiKey: process.env.CURSOR_API_KEY, mode: "plan", local: { cwd: docsRoot } }`.
3. `supportsReadOnlyLockdown()` should feature-detect that `mode:"plan"` lockdown is available —
   the honest signal is that the SDK still accepts `mode:"plan"` (proven here); implement it so an SDK
   upgrade that drops plan-mode read-only enforcement can be made to fail loud (exit 5).
4. `checkAuth()` / `listModelIds()` use the REST client (`Cursor.me`, `Cursor.models.list`) which DO read
   the env key; only `Agent.prompt` needs the explicit `apiKey`.
