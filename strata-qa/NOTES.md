# SDK smoke findings (@cursor/sdk 1.0.24) — consumed by src/agent.ts

All facts below were observed on a live run (2026-07-22) against `@cursor/sdk` 1.0.24,
docs root = repo root, with a personal user API key. The throwaway probe script that
produced them has served its purpose and been removed; this file is the surviving record.

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

## Golden eval baseline — 2026-07-22, model gpt-5.6-luna, docsVersion 8e87a72

Command: `cd strata-qa && npm run qa -- eval --docs-root ..` (live, 9 fixtures). Preceded by a graph
loader fix (commit c2601b6) needed to run against the real 65-node corpus (9 source-container nodes
have `path:null`; the loader now skips them).

```
PASS  expect=answerable  got=answered  What tool does the nava-platform CLI wrap to install templates?
PASS  expect=answerable  got=answered  How does OSCER authenticate inbound API requests?
PASS  expect=answerable  got=answered  What attribute types does the Strata SDK provide?
PASS  expect=answerable  got=answered  How do I set up a new Rails project from the application template?
PASS  expect=answerable  got=answered  How does OSCER model the Medicaid certification lifecycle?
PASS  expect=refuse      got=no_match  What is the production database password for OSCER?
FAIL  expect=refuse      got=answered  How does the Strata SDK integrate with Salesforce?
PASS  expect=refuse      got=no_match  What did the Strata team decide in their last sprint retrospective?
PASS  expect=refuse      got=no_match  What is the best pizza topping?
---
8/9 passed  |  mean latency: 338771 ms  |  total tokens: 1717611  |  quote-downgrades: 0
```

Observations:
- **1 FAIL — Salesforce (expected refuse, got answered).** The model cited two REAL docs
  (`sources/strata-sdk/strata-sdk-api-authentication.md`, `sources/strata-sdk/strata-sdk-tasks.md`),
  and BOTH quotes verified (grounding 2/2). This is the spec's acknowledged limit: the gate guarantees
  grounding, not intent — the model stitched genuine quotes into an answer to a question the corpus does
  not actually address (SDK↔Salesforce). Not a code bug; the quote-verified gate did its job (no
  fabrication — the quotes are real). Refusal-discipline gap to close later via prompt hardening
  (stronger "answer only if the docs directly address the question" instruction) or fixture review.
- **quote-downgrades: 0** — whitespace-normalized substring matching produced NO false downgrades on the
  real corpus. The quote-matching rules are not too strict; good signal.
- **Latency has extreme outliers (Lambda-relevant).** Answerable questions: 9–14 s each. But two questions
  triggered very long agentic loops: the Salesforce over-answer took **971 s (~16 min)** and the
  sprint-retro refusal **2003 s (~33 min)**; the pizza refusal was fast (5 s). The 338771 ms mean is
  dominated by these two. **This directly threatens the future Lambda's 15-minute execution limit** (spec
  "Lambda portability notes"). The infra story MUST bound agent runtime (max-turns / wall-clock timeout).
  Ambiguous or barely-related questions are the slow path, not clear answers or clear refusals.
- **Cost:** ~1.72M total tokens over 9 fixtures (~190k/question), consistent per-question.
- Minor (log location) — **CLOSED 2026-07-27.** The CLI's default log dir was `.logs/qa` relative to
  CWD, so invoking from `strata-qa/` wrote `strata-qa/.logs/qa/` rather than the repo-root `.logs/qa/`
  the spec describes, and `cli.test.ts` — which calls `main()`, and so could not override it — left
  stray fake-seam entries there (131 rows by the time this was fixed). Both fixes named here were
  taken: the default is now `<docs-root>/.logs/qa` (`defaultLogDir` in cli.ts), which is the
  spec-described path under the documented `--docs-root ..` invocation and makes the tests write into
  their own temp corpus, and `--log-dir` overrides it — useful for giving one tuning experiment its
  own rows. (`runQa` itself no longer defaults `logDir`: each edge states its own writable path.)

## Run cancellation findings — 2026-07-27, @cursor/sdk 1.0.24

Measured by a live throwaway probe, since removed; these are the surviving results.

Answers the question the original handler comment assumed away ("there is nothing to cancel — the
SDK exposes no AbortSignal"). True of `AbortSignal`; false of the SDK as a whole.

- **`Agent.prompt` is a dead end for this.** Documented as "create an agent, run one prompt, and
  close", and it resolves only when the run is over — there is never a handle to cancel. The
  cancellable path is `Agent.create(options)` → `agent.send(msg, sendOptions)` → `Run`.
- **`send()` returns while the run is live: 1643ms, `status: "running"`.** So there is a real window
  in which to act.
- **`run.supports("cancel") === true` for a LOCAL run.** `cancelRun` is not cloud-only, despite
  `Agent.cancelRun`'s neighbours (`get`/`archive`/`delete`) being documented as cloud-only.
  `supports("stream")` and `supports("wait")` are also true.
- **`cancel()` resolved in 4ms**, `status` → `"cancelled"`, and a subsequent **`wait()` RESOLVES**
  with that terminal status rather than rejecting. `usage` is `undefined` on a cancelled run, so a
  partial token count is not recoverable.
- **Work genuinely stops: 13 agent events before `cancel()`, 0 in the 4s after.** Measured via
  `onStep`/`onDelta`, which is the honest signal here.
- **No child process is spawned in plan mode.** Grepping for `cursor-agent`/`cursorsandbox` found
  nothing even mid-run, and walking descendants by ppid confirmed the local runtime spawns nothing
  at all under `mode: "plan"`. So "orphaned run" means in-process async work, not a stray pid —
  there is nothing to `SIGKILL`, which also rules out the fork-and-kill fallback the handler comment
  used to propose. (This is why the event count above, not the process tree, is the signal.)
- **`SendOptions.local` is `LocalSendOptions`, a different and narrower type than
  `LocalAgentOptions`.** `cwd` belongs on `Agent.create`, not on `send`; only `model` and `mode` are
  worth restating per send.
- Consequence for `lambda/handler.ts`: the container poison-and-recycle is now the FALLBACK, reached
  when `supports("cancel")` is false, when `cancel()` throws, or when the wall clock fires before
  `send()` has handed back a `Run` at all — the last case has nothing to cancel, so `runBounded`
  keeps an uncancellable placeholder in the active set for that window. Which happened is reported by
  `cancelActiveRuns()` — a run stays in `agent.ts`'s active set until it is known to have stopped,
  so a non-empty set is what tells the handler the container is contaminated.
- Corollary, since `send()` takes ~1.6s and `Agent.create` is a network call too: the per-call bound
  has to span create + send + wait on ONE deadline. Bounding only `wait()` left both of those
  unbounded, which is a CLI that hangs forever despite `--timeout` and a Lambda stall the recycle
  decision cannot see.
- Consequence for the CLI, taken up 2026-07-27: the cancellation itself was already shared (both
  edges go through `runBounded`), but the decision layer on top of it was Lambda-only. The CLI now
  makes the same call at the layer that can act — `cancelActiveRuns()` on a leftover run, and an
  explicit warning when it fails, since a run that survives is still spending. The `ask` path then
  exits, so the warning is all it owes; `eval` shares one process across nine fixtures, so it stops
  scheduling instead, which is the loop's only available analogue of the container recycle. The
  whole-question bound (`withInvocationBudget`) moved to `run.ts` for the same reason — per-call
  bounds do not sum, at either edge.
