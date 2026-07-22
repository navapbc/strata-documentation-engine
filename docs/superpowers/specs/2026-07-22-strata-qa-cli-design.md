# Design: `strata-qa` — a Lambda-callable documentation Q&A CLI

- **Date:** 2026-07-22
- **Issue:** [#30](https://github.com/navapbc/strata-documentation-engine/issues/30)
- **Status:** Design — awaiting review before implementation plan

## Summary

A standalone command-line tool that answers a natural-language question about the Strata project
family from this repo's documentation graph, using `gpt-5.6-luna` (or any Cursor model, passed as an
argument) driven through the Cursor TypeScript SDK. It emits a machine-readable JSON result to
stdout, never fabricates an answer — every citation must both resolve to a graph node **and** carry a
verbatim quote found in the cited doc — and refuses honestly when the docs do not support one.

This is a **local validation slice**, not the production feature described in issue #30. It exists to
answer one question from the terminal: *can a cheap Cursor model, driven over our graph, produce
trustworthy sourced answers — and honestly refuse when it can't?* No GitHub Action, callback,
correlation ID, auth handshake, Slack relay, or hosting is built here. The retrieval and grounding
logic is the reusable core that any future wrapper (an AWS Lambda, a GitHub Action) invokes.

## Goals

- Take a question and an optional model id; return an answer, a grounding report (citations
  resolved, quotes verified, distinct docs), and the source doc path(s) it was drawn from — or an
  explicit refusal.
- Never fabricate. A cited path that does not resolve to a node in `docs/graph.json`, **or** a
  citation whose quote does not appear in the cited doc, forces a refusal, deterministically,
  regardless of what the model reports. The gate verifies not just that cited docs exist but that
  they verifiably contain what the answer leans on.
- Be callable by a future AWS Lambda with no rework: stdout is a stable JSON contract, exit codes
  distinguish "completed" from "operational failure," and the orchestration logic is importable as a
  library as well as runnable as a binary.
- Record per-query cost (token usage) and end-to-end latency from the first run, so a real baseline
  exists before anyone sets a performance or cost target.
- Parameterize the model so comparing models on the same question is a flag change, not a code
  change.

## Non-goals (deferred to a follow-up infra story)

- Any trigger transport: `repository_dispatch` / `workflow_dispatch`, HTTP endpoints, callbacks.
- Bearer-token / shared-secret callback auth, correlation IDs, concurrency or queueing guarantees.
- A p50/p95 latency harness or an enforced performance/cost target (this slice *measures*; it does
  not gate on the numbers).
- A multi-model comparison harness (the model argument makes ad-hoc comparison possible; automated
  comparison is out of scope).
- The Slack bot or any external caller, and any hosting or deployment.

## The core unknown this validates

Issue #30's open questions include "does `gpt-5.6-luna` exist under that name, and does the Cursor
SDK run headless?" Both are retired by running this on a developer terminal: the CLI's preflight
calls `Cursor.models.list()` to confirm the model id, and the whole tool *is* a headless SDK
invocation. What remains genuinely unproven — and is the point of the slice — is retrieval quality
and refusal discipline against real questions.

## Approach

Approach 3 from brainstorming: **agentic answering plus a deterministic grounding gate.** The model
does all three retrieval stages itself (so we test its real capability); a thin deterministic
post-check enforces the no-fabrication guarantee (so "never fabricate" is a property of the code, not
a hope about the model). The gate makes two independent checks per citation: the path resolves to a
graph node, and the citation's verbatim quote appears in the cited file. Path resolution alone would
only catch fabricated *paths* — a model could hallucinate an answer and attach real paths skimmed
from `INDEX.md`; the quote check is what catches fabricated *content attributed to real docs*.

## Runtime and dependencies

- Node.js 22 (verified present: v22.19.0), npm 11.
- `@cursor/sdk` v1.0.24 — "TypeScript SDK for Cursor agents." Verified on npm; local `cursor-agent`
  CLI (v2025.09.17) confirms the toolchain is installed and the headless path exists.
- `tsx` (dev) to run TypeScript directly without a separate build step during development.
- `vitest` (dev) as the test runner.
- Auth: `CURSOR_API_KEY` environment variable (the SDK's default credential source; a Lambda supplies
  it as a secret).

## Cursor SDK surface used (from `@cursor/sdk` v1.0.24 type definitions)

- `Agent.prompt(message: string, options?: AgentOptions): Promise<RunResult>` — "create an agent, run
  one prompt, and close." The one-shot call this tool is built around.
- `AgentOptions` carries `model?: ModelSelection` and `local?: LocalAgentOptions`, where
  `LocalAgentOptions.cwd` sets the working directory the local agent's file-read/bash tools operate
  over. Setting `cwd` to the docs root is what lets the model read `docs/graph.json`, `docs/INDEX.md`,
  and `docs/sources/`.
- `RunResult` returns `status: "finished" | "error" | "cancelled"`, `result?: string` (the model's
  text output), `durationMs?: number` (latency), and `usage?: TokenUsage`
  (`inputTokens`/`outputTokens`/`cacheReadTokens`/`cacheWriteTokens`/`totalTokens` — the cost signal).
- `Cursor.models.list(): Promise<SDKModel[]>` — used in preflight to confirm the requested model id
  exists. `Cursor.me()` — used to confirm authentication.

> Note: the exact spelling of `ModelSelection` (bare id string vs. `{ id, params }`) and the precise
> `LocalAgentOptions` field for tool permissions are confirmed during a short SDK smoke test as the
> first implementation step, since the published type aliases do not fully expand in the `.d.ts`.

### Tool lockdown is a hard requirement, not a hardening option

`LocalAgentOptions.cwd` sets the agent's working directory; it does **not** sandbox it. An
unrestricted local agent holds bash and file tools that can read anything on the machine, and the
question string — arbitrary user input in the future Slack path — is interpolated into that agent's
prompt. The docs themselves are a second injection surface (model-generated from third-party repos).
So the SDK smoke test must confirm the agent can be restricted to **read-only file tools: no bash,
no writes, no network**. If the SDK cannot enforce that, preflight fails loud (its own exit code)
and the design is revisited — the slice must validate a configuration a Lambda could actually ship,
not one it never could.

## Invocation

```bash
strata-qa "how does the SDK handle retries?"                 # defaults to gpt-5.6-luna
strata-qa --model gpt-5.6-luna "..." --docs-root .           # explicit model + docs root
strata-qa --model sonnet-4 "..." --pretty                    # compare a model, human-readable output
strata-qa eval                                               # score fixtures/golden.json, print table
```

- **Positional argument:** the question (required), or the `eval` subcommand (see Testing).
- **`--model <id>`:** the Cursor model to use. Default `gpt-5.6-luna`.
- **`--docs-root <path>`:** directory containing `graph.json`, `INDEX.md`, and `sources/` under a
  `docs/` subtree. Default: current working directory. This is the seam that lets a Lambda point at a
  bundled docs copy rather than a git checkout.
- **`--pretty`:** emit human-readable output to stderr in addition to the JSON on stdout. Off by
  default so machine callers get clean JSON.

## stdout contract (what a caller parses)

Exactly one JSON object is written to stdout per invocation. Anything else the SDK's local runtime
prints (progress, warnings) is captured and redirected to stderr — stdout purity is enforced by the
implementation and covered by a test, not assumed:

```json
{
  "schema_version": 1,
  "status": "answered | no_match | low_confidence | error",
  "answer": "string or null",
  "sources": [{ "path": "sources/strata-sdk/overview.md", "verified": "ok" }],
  "grounding": { "citationsTotal": 2, "citationsResolved": 2, "quotesVerified": 2, "distinctDocs": 2 },
  "model": "gpt-5.6-luna",
  "docsVersion": "<git HEAD sha, or sha256 of graph.json when not a checkout>",
  "usage": { "inputTokens": 0, "outputTokens": 0, "totalTokens": 0 },
  "durationMs": 0
}
```

- `status` is an enum, never a boolean.
- `answer` is `null` for any non-`answered` status.
- `sources` contains only citations that fully verified (path resolved **and** quote matched), in
  the graph's canonical node-path form (`sources/<id>/<file>.md`, relative to `docs/`). Each entry
  carries the doc's frontmatter `verified` status, so a caller can flag answers drawn from
  `needs-review` docs.
- `grounding` replaces the scalar confidence score: raw counts, not a synthetic 0–1 number a Slack
  user would misread as answer correctness. **This diverges from issue #30's "confidence score
  (always returned)" acceptance criterion — deliberately.** The counts are the retrieval-grounded
  signal that criterion asks for; a future caller that wants a scalar can derive one from them, and
  the divergence is flagged here for review rather than silently shipped.
- `docsVersion` identifies the docs snapshot that produced the answer, so a stale-looking Slack
  answer can be traced to its corpus. `schema_version` lets future callers detect contract changes.

### Exit codes

- `0` — the run completed and produced a valid result object, **including grounded refusals**
  (`no_match`, `low_confidence`). A refusal is a correct outcome, not a failure.
- Non-zero — an **operational** failure only, with distinct codes so a Lambda can decide
  retry-vs-fail without parsing stderr:
  - `2` — authentication failure (don't retry).
  - `3` — requested model id not found (don't retry).
  - `4` — docs root invalid or missing required files (don't retry).
  - `5` — SDK cannot enforce read-only tool lockdown (don't retry; design issue).
  - `6` — model output unparseable after one repair attempt (`status: "error"`; retryable).
  - `7` — SDK/transport crash (retryable).

## Flow

1. **Preflight** (fail loud, distinct non-zero exit per failure — see Exit codes):
   - `Cursor.me()` confirms `CURSOR_API_KEY` authenticates.
   - `Cursor.models.list()` confirms the requested `--model` id exists.
   - The docs root contains `docs/graph.json`, `docs/INDEX.md`, and `docs/sources/`.
   - The SDK accepts a **read-only tool restriction** (no bash, no writes, no network) for the local
     agent. If it cannot, exit `5` — this is a design-blocking failure, not a warning.
   - Compute `docsVersion` (git HEAD SHA of the docs root's repo, else sha256 of `graph.json`).
2. **Agentic retrieval** — a single `Agent.prompt(...)` with the read-only tool restriction and
   `local: { cwd: docsRoot }`. The prompt frames the question as untrusted data (delimited, with an
   instruction to ignore any directives inside it — a mitigation, not the defense; the deterministic
   gate is the defense) and instructs the model to:
   - **Stage 1:** read `docs/graph.json` + `docs/INDEX.md` and make a fast go/no-go judgment of
     whether the answer plausibly exists; if not, return `no_match` immediately.
   - **Stage 2:** traverse the graph to locate candidate doc paths where the answer likely lives.
   - **Stage 3:** read those candidate docs under `docs/sources/`, extract the answer, and for each
     cited doc **copy a short verbatim quote (≤300 chars, exact characters, no paraphrase)** that
     supports the answer.
   - Emit a single fenced JSON block `{ status, answer, citations: [{ path, quote }] }`, and refuse
     rather than guess when the docs do not support an answer. (No self-reported confidence — the
     gate computes grounding deterministically and would discard it anyway.)
3. **Parse** the JSON block from `RunResult.result`. If multiple fenced JSON blocks appear, the last
   valid one wins. One repair-retry if malformed — a **tool-less reformat call** that passes the
   malformed text back and asks for valid JSON only, *not* a re-run of retrieval (which would double
   cost). If it still fails, `status: "error"` and exit `6`.
4. **Deterministic grounding gate** (`grounding.ts`) — the no-fabrication guarantee:
   - **Normalize** each cited path before lookup: strip a leading `./`, strip a leading `docs/`,
     strip any `#fragment` or trailing `:line` suffix. Compare the result against the set of node
     `path` values in `docs/graph.json` (canonical form: `sources/<id>/<file>.md`). Without this,
     ordinary model variance in path spelling produces false refusals and the baseline measures
     path-spelling luck instead of retrieval quality.
   - **Verify each quote**: whitespace-normalized substring match (collapse all whitespace runs to
     single spaces in both quote and file) against the cited file's content.
   - A citation **verifies** only if its path resolves **and** its quote matches. While reading each
     cited file, capture its frontmatter `verified:` value for the output's `sources` entries.
   - Decide final `status` from verification alone — no scalar confidence, no threshold:
     - `no_match` — the model returned no candidate, or zero citations verify.
     - `low_confidence` — some but not all citations verify (the answer leaned partly on paths that
       don't resolve or quotes that don't match).
     - `answered` — at least one citation, and every citation verifies.
   - Report the raw counts (`citationsTotal`, `citationsResolved`, `quotesVerified`, `distinctDocs`)
     in the `grounding` object. In this corpus each topic is deliberately owned by roughly one doc
     (the registry axes make cross-doc duplication rare), so distinct-doc corroboration is
     informational, never a gate — gating on it would penalize single-doc truths and reward
     citation-padding.
5. **Log** (see below).
6. **Emit** the JSON result to stdout; if `--pretty`, also write a human-readable summary with a
   cost/latency footer to stderr.

## Logging

Both logs are append-only JSONL under `.logs/qa/` at the repo root (already covered by the
`.logs/` entry in `.gitignore`; local-only, never committed):

- `.logs/qa/queries.jsonl` — one record per invocation: timestamp, question, model, final status,
  the `grounding` counts, resolved sources, `docsVersion`, `durationMs`, `usage`. This is the cost
  and latency baseline and the raw material for judging retrieval quality.
- `.logs/qa/refusals.jsonl` — one record per `no_match` / `low_confidence`: timestamp, question,
  reason. This is the "questions we couldn't answer" list that drives future doc improvements.

The repo is private (settled on issue #30, 2026-07-13), and these logs are gitignored, so storing
raw questions locally is acceptable for this slice.

## Layout

A self-contained TypeScript project at the repo root (**not** under `skills/`), isolating the TS
toolchain from the Python validation spine:

```
strata-qa/
  package.json             # "bin": { "strata-qa": "dist/cli.js" }; deps: @cursor/sdk; dev: tsx, vitest
  tsconfig.json
  src/
    cli.ts                 # entry: arg parsing (incl. `eval` subcommand), stdout JSON / --pretty, exit codes
    run.ts                 # orchestrates preflight -> agent -> parse -> grounding -> log; importable by a Lambda with no CLI
    graph.ts               # load docs/graph.json -> Set<nodePath> (+ adjacency helpers); pure
    prompt.ts              # build the 3-stage retrieval prompt (question framed as data); pure
    agent.ts               # the @cursor/sdk Agent.prompt seam (read-only tools); mocked in tests
    parse.ts               # extract + validate the JSON answer block (last valid fence wins); pure
    grounding.ts           # deterministic gate: normalize paths, resolve citations, verify quotes, decide status; pure
    eval.ts                # run fixtures/golden.json through run.ts, score statuses, print pass/fail table
    log.ts                 # append records to .logs/qa/*.jsonl
  fixtures/golden.json     # [{ question, expect: "answerable" | "refuse" }]
  src/*.test.ts            # vitest units
```

`cli.ts` and `run.ts` are separate so a future Lambda can either shell out to the built binary or
import `run.ts` directly — no rework either way. Each pure module has one clear job, a small
interface, and can be understood and tested in isolation.

## Testing

- **Unit (vitest, no live model):** `graph.ts` (path resolution, malformed graph handling),
  `parse.ts` (valid block, malformed block, multiple fences, repair path), a stdout-purity test on
  the CLI seam, and especially `grounding.ts`:
  - a fabricated citation (path absent from the graph) forces a refusal;
  - a real path with a quote that does not appear in the file forces a downgrade;
  - partial verification (some citations verify, some don't) downgrades out of `answered`;
  - path normalization accepts `docs/`-prefixed, `./`-prefixed, `#fragment`, and `:line` variants.
  `agent.ts` is mocked, so tests never call the model and run in CI cleanly.
- **Golden eval (`strata-qa eval`, live):** `fixtures/golden.json` holds a small set of
  known-answerable and known-unanswerable questions. The eval runner executes every fixture through
  `run.ts`, compares the emitted `status` against `expect`, and prints a pass/fail table plus
  aggregate cost and latency. Refusal discipline — the slice's core question — is thereby a
  reproducible number, not an eyeball judgment; answer *prose* quality is still eyeballed from the
  runner's per-fixture output. The runner also surfaces the rate of quote-verification downgrades,
  the tuning signal for the quote-matching rules.

## Lambda portability notes (flagged, not solved here)

The Cursor SDK's **local** runtime embeds the agent runtime and writes a store (SQLite via
`@cursor/sdk/sqlite`, or JSONL). On a developer machine this is fine. A future Lambda deployment
would need: the writable `/tmp` for the store, the docs corpus bundled into the deployment package
(pointed at via `--docs-root`), `CURSOR_API_KEY` as a secret, and validation that the local runtime
fits Lambda's package-size and 15-minute execution limits. These are real but belong to the infra
story; running the CLI locally proves the headless path works at all, which is what this slice is
for.

## Repo hygiene

- `.gitignore` gains `node_modules/` and `dist/`. `.logs/qa/` is already covered by the existing
  `.logs/` entry.
- This spec lives outside `docs/sources/`, the only tree `scripts/lint_docs.py` scans, so it does not
  enter the doc-lint pipeline.
- No change to the Python pipeline (`scripts/`, `tests/`) or the generated artifacts
  (`docs/INDEX.md`, `docs/graph.json`).

## Open decisions (chosen defaults; easily changed)

- Project directory name: `strata-qa/` (matches the bin name).
- Default model: `gpt-5.6-luna`.
- Structured output via prompt-instructed JSON block + parse, rather than the SDK's `customTools`
  schema enforcement (simpler; `customTools` is a later hardening option).
- Quote matching: whitespace-normalized substring, quotes capped at ~300 chars. Stricter (exact
  bytes) risks false downgrades on markdown wrapping; looser (fuzzy) reopens the fabrication hole.
- Output path form: the graph's canonical node path (`sources/<id>/<file>.md`); callers prefix
  `docs/` if they need a repo-relative link.
- No scalar confidence in the contract; `grounding` counts instead (divergence from issue #30
  flagged in the stdout-contract section).

## Risks and mitigations

- **Model emits prose, not clean JSON.** Mitigation: strict output instruction, extract the fenced
  block (last valid one wins), one tool-less reformat retry, then `status: "error"`.
- **Model cites a real-looking but non-existent path.** Mitigation: the grounding gate resolves every
  citation against `graph.json`; unresolved citations force a downgrade.
- **Model hallucinates an answer and attaches real paths it never read.** Mitigation: the quote
  check — each citation must carry a verbatim quote found in the cited file. Together with path
  resolution this is the central guarantee; path resolution alone would not catch this.
- **Model paraphrases instead of quoting verbatim,** causing false downgrades of good answers.
  Mitigation: whitespace-normalized matching, an explicit copy-exact-characters instruction in the
  prompt, and the eval runner reports the quote-downgrade rate so the matching rules can be tuned on
  real data.
- **Prompt injection via the question or via doc content** (docs are model-generated from
  third-party repos). Mitigation: read-only tool lockdown enforced at preflight, the question framed
  as delimited data, and the grounding gate bounding what an injected instruction can achieve —
  though an attacker steering the model toward *real but misleading* quotes remains possible; the
  gate guarantees grounding, not intent. Full treatment belongs to the infra story.
- **`gpt-5.6-luna` not available under that id.** Mitigation: preflight `Cursor.models.list()` fails
  loud with a clear message; the model is an argument, so trying another is a flag change.

## What comes after (not in scope)

If the slice shows the model answers well and refuses honestly, the follow-up infra story wraps
`run.ts` in a trigger + transport (Lambda behind an HTTP endpoint, or a GitHub Action), adds callback
auth and correlation IDs, and connects the Slack relay. The grounding gate (path resolution + quote
verification) and logging move into that story unchanged; the `schema_version` and `docsVersion`
fields exist so that wrapper can evolve the contract and trace answers to corpora without rework.
