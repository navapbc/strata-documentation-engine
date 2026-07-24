# Design: `strata-qa` on Lambda (thin HTTP slice)

Status: approved for planning
Date: 2026-07-24
Branch: `baonguyen/strata-qa-lambda-integration`

## Goal

Deploy the existing `strata-qa` docs Q&A CLI as a container-image AWS Lambda, fronted by a
Lambda Function URL, that accepts a question over HTTPS and returns the existing `strata-qa`
JSON answer. Build it so a Slack bot can plug in later with minimal rework.

This is a deliberately thin first slice: prove that packaging, auth, latency bounding, and the
`@cursor/sdk` local runtime all work end to end in Lambda. Full Slack integration (signature
verification, async ACK, `chat.postMessage` callback) is a later pass.

**What "Slack-ready" does and does not mean here.** Slack requires a slash command to be acknowledged
within **3 seconds**; the eval baseline puts even *fast* questions at 9–14s. So no synchronous
request/response endpoint can ever serve Slack directly — the Slack pass will necessarily add an
ACK-now/deliver-later dispatcher. This slice therefore does not claim its *HTTP shape* is the Slack
seam. It claims two narrower things: the request body is a **job envelope** (`requestId`, reserved
`replyTo`) rather than a bare question, and the answering logic lives behind
`handleQuestion(job) → RunOutcome` in `core.ts`, which the future dispatcher calls unchanged.

## Decisions locked in brainstorming

| Decision | Choice | Why |
|---|---|---|
| MVP scope | Thin HTTP slice, Slack-ready | De-risk packaging + latency before adding Slack's async layer |
| Doc + CLI delivery | Baked into the container image at build time | Fast, reliable cold starts; no runtime git/npm fragility; docs regenerate infrequently |
| Image source | `COPY` from the build context, git SHA as a build arg | Buildable from local doc changes; avoids shallow-clone-at-a-SHA; provenance preserved |
| HTTP front | Lambda Function URL, `AWS_IAM` auth | Simplest thing that works; no API Gateway resource; later flips to public + Slack-signature verify |
| Deploy tooling | Scripted AWS CLI (Dockerfile + `deploy.sh`) | Fastest path to a working slice on a local AWS environment; promotable to IaC later |
| Handler execution model | Import and call `runQa()` directly, with post-timeout container recycle | Clean existing seam; no per-invoke subprocess; the recycle covers the uncancellable-agent problem |
| Handler factoring | `handler.ts` (Function URL adapter) over `core.ts` (`handleQuestion(job)`) | The async Slack dispatcher wraps `handleQuestion` later without touching it |
| Logging | Structured `console.log` to CloudWatch; file writes made non-fatal | Lambda's filesystem is read-only outside `/tmp`; a log write must never destroy an answer |
| Secrets | AWS Secrets Manager, fetched at cold-start init, invalidated on `AUTH` | `CURSOR_API_KEY` is a real credential; a rotated key must not brick warm containers |

## Architecture

```
curl (SigV4)  ──HTTPS POST {question}──►  Lambda Function URL (AWS_IAM)
                                                │
                                                ▼
                                     handler.ts (Node 22, container)
                                                │  parses/validates the event
                                                ▼
                                     core.ts  handleQuestion(job)
                                                │  imports runQa() directly
                                                ▼
                                     runQa(opts, cursorSeam)  ──►  @cursor/sdk
                                                │                  (linux-arm64 binary,
                                                │                   plan-mode, reads
                                                ▼                   baked docs/)
                                     RunOutcome {result, exitCode, errorMessage}
                                                │
                                                ▼
                                     HTTP response (status ← exitCode map,
                                                    body = {…QaResult, error?, requestId})
```

`handler.ts` owns only the Function URL envelope: method check, `isBase64Encoded` decode, JSON
parse, field validation, and the exit-code → HTTP mapping. `core.ts` exposes
`handleQuestion(job): Promise<RunOutcome>` and knows nothing about HTTP. The later Slack pass adds a
dispatcher that ACKs Slack within 3s and calls `handleQuestion` on the async side — no change to
`core.ts`.

## Key design choice: handler calls `runQa` directly

`strata-qa/src/run.ts` already exposes a clean seam — `runQa(opts, seam)` returns a structured
`RunOutcome { result, exitCode, errorMessage }`. The handler imports and calls it directly rather
than spawning `node dist/cli.js`.

Rationale:

- No per-invocation subprocess spawn.
- Cancellation — the one thing a subprocess would buy — is handled instead by recycling the container
  after a timeout (see "The timeout does not cancel the run" below). If the spike shows that recycle is
  unreliable, this decision flips to fork-a-worker.
- The CLI's stdout-silencing logic (`cli.ts`) exists only to protect the single-JSON-line stdout
  contract. In Lambda the SDK's progress chatter simply lands in CloudWatch logs, which is desirable,
  so that machinery is not needed.
- The handler maps `exitCode` → HTTP status and returns `result` as the body.

Alternative considered — subprocess the CLI (`node dist/cli.js "question" --docs-root ...`, parse
stdout JSON). Reuses the exact CLI boundary but buys nothing here and costs a spawn per invoke.
Rejected.

## Components

1. **`strata-qa/Dockerfile`** — `FROM` the AWS Lambda Node.js 22 base image (Amazon Linux),
   **`linux/arm64`** (verified: `@cursor/sdk-linux-arm64@1.0.24` publishes, so Graviton is available
   and cheaper). `COPY` the repo from the build context, then `cd strata-qa && npm ci && npm run build`.
   `npm ci` on Linux resolves the correct `@cursor/sdk-linux-<arch>` optional dependency automatically
   (the SDK ships per-platform binaries — `cursorsandbox`, ripgrep). Docs (`docs/graph.json`,
   `docs/INDEX.md`, `docs/sources` — ~900 KB total) are baked in from the same context. Takes the git
   SHA as a build arg and bakes it in as an env var for provenance. Sets `HOME=/tmp` and points
   `docsRoot` at the repo root. A `.dockerignore` excludes `node_modules/`, `.sources/`, `.logs/`, and
   `.git/` so the context stays small and the host's darwin-arm64 SDK binary can't leak into the image.
2. **`strata-qa/lambda/handler.ts`** — the Function URL adapter. Rejects non-`POST`; decodes
   `isBase64Encoded` bodies; parses and validates `{ question, model?, requestId?, replyTo? }`; maps the
   resulting exit code to an HTTP status; returns `{ statusCode, body }`. Owns the poison-flag recycle
   (below). Fetches `CURSOR_API_KEY` once at cold-start init, caches it across warm invocations, and
   invalidates on `AUTH`.
3. **`strata-qa/lambda/core.ts`** — `handleQuestion(job): Promise<RunOutcome>`. Builds `RunOptions`
   (including `logDir`), calls `runQa` with the live Cursor seam, emits the structured log line, and
   returns the outcome. No HTTP knowledge; this is the seam the Slack dispatcher will call.
4. **`strata-qa/deploy.sh`** — scripted AWS CLI: build image (arm64) → push to ECR → create/update the
   Lambda from image → ensure the Function URL with `AWS_IAM` auth → set config (timeout, memory,
   architecture, `HOME`, reserved concurrency, secret reference).

### Request validation

`handler.ts` rejects with **400** and a JSON error body — never a stack — for: non-`POST` method,
unparseable JSON, missing or non-string `question`, `question` longer than **2000 characters** (token
spend is the cost driver, and a long question buys nothing), and any `model` outside a small
allowlist. `EXIT.USAGE` (1) never surfaces from `runQa` here because the handler validates first.

## Data flow / HTTP contract

- **Request:** `POST` with JSON body `{ "question": "...", "model"?, "requestId"?, "replyTo"? }`. This
  is a *job envelope*, not a bare question: `requestId` (echoed back, caller-supplied or generated) and
  the reserved `replyTo` are what the async Slack path needs, so the shape does not change when the
  dispatcher lands. `replyTo` is accepted and ignored in this slice.
- **Response body:** the `QaResult` JSON — `schema_version`, `status`, `answer`, `sources`, `grounding`,
  `model`, `docsVersion`, `usage`, `durationMs` — plus two envelope fields:
  - `requestId`, echoed on every response including errors, so a caller can correlate with CloudWatch.
  - `error`, present only on non-200: `runQa`'s `errorMessage`. **This is load-bearing.** `errorMessage`
    lives on `RunOutcome`, not on `QaResult` (`run.ts:44-48`), so returning `QaResult` alone would make
    every failure an opaque `{"status":"error","answer":null}` — a 502 that cannot distinguish an
    unreachable model from unparseable output. Never include a stack.
- **Status mapping** (from the existing `EXIT` codes in `run.ts`):

  | Outcome | Exit code | HTTP status |
  |---|---|---|
  | Bad request (validation, pre-`runQa`) | — | 400 |
  | Answered / refusal (`no_match`, `low_confidence`) | `OK` (0) | 200 (body carries `status`) |
  | Auth failure | `AUTH` (2) | 500 |
  | Model unavailable | `MODEL` (3) | 502 |
  | Docs missing/malformed | `DOCS` (4) | 500 |
  | Read-only lockdown unsupported | `LOCKDOWN` (5) | 500 |
  | Parse failure | `PARSE` (6) | 502 |
  | Transport failure | `TRANSPORT` (7) | 502 |
  | Timeout | `TIMEOUT` (8) | 504 |
  | Unexpected throw | (backstop `catch`) | 500 (JSON error body, never a stack) |

  Refusals are a valid answer, not an error — they return 200 with the refusal `status` in the body,
  matching the CLI's "refusals exit 0" contract.

## Latency bounding (load-bearing)

The live eval baseline (`strata-qa/NOTES.md`) shows fast questions at 9–14s but pathological
ambiguous questions triggering 16-minute and 33-minute agentic loops — well past API Gateway's ~30s
and even Lambda's 15-minute ceiling.

- Bound the agent call with `runQa`'s existing `timeoutMs` (`RunOptions`), set to **~90s**.
- Set the Lambda function timeout higher (**~120s**) so the agent's own timeout fires first and the
  handler returns a clean **504 + JSON** rather than Lambda hard-killing the invocation mid-flight.
- Net effect: fast questions return normally; the runaway loops are cut off at ~90s with a structured
  "timed out, try rephrasing" response. The slow path becomes bounded and diagnosable instead of fatal.
- Memory ~2GB (more memory = more CPU on Lambda), ephemeral `/tmp` ~1GB.

### The timeout does not cancel the run — container recycle covers it

`withTimeout` (`agent.ts:42-52`) is a `Promise.race`. Its own comment states the premise: *"the
underlying `Agent.prompt` keeps running until the process exits. The CLI exits immediately after, so
the orphaned run is harmless."* **That premise is false in Lambda.** The execution environment
*freezes* when the handler returns and *thaws* for the next invocation, so an orphaned agent run —
plus the `cursorsandbox` child process it spawned — resumes inside the *next* request: competing for
CPU and memory, writing stdout into the wrong CloudWatch stream, and still burning tokens (~190k per
question, `NOTES.md`) on an answer nobody will read. Two timeouts on one warm container stack two
orphans.

Mitigation: **poison the container and recycle it.** On any `TIMEOUT` outcome the handler sets a
module-level `poisoned` flag, returns the 504, and schedules `process.exit(1)` so Lambda discards the
environment. Timeouts are rare per the eval baseline, so the cost is an occasional cold start.

**This is a race, and the plan must treat it as unproven.** The Node runtime POSTs the handler's
result to the runtime API *after* the returned promise resolves, and the container may freeze
immediately after. Exit too eagerly and the response is lost; schedule the exit on a timer and it may
instead fire on the next thaw, killing an unrelated invocation. The design therefore pairs the delayed
exit with the `poisoned` flag checked at the top of every invocation, so a container that survived the
exit still refuses to serve degraded work. **The spike (below) is the gate.** If the recycle cannot be
made reliable, fall back to the documented alternative: fork a worker process per invocation and
`SIGKILL` it on timeout, which yields true cancellation (and reaps `cursorsandbox`) at the cost of a
~100ms spawn per invoke. That fallback reverses the "call `runQa` directly" decision above — recorded
here so the tradeoff is visible rather than rediscovered.

### Concurrency and cost ceiling

At ~190k tokens per question, an endpoint with default (unreserved) concurrency is an unbounded spend
on the Cursor API — and a 504 at 90s is precisely the response a client library retries. Set
**reserved concurrency to 2–5** on the function for this slice. Retry/idempotency handling (dedupe on
`requestId`) is deferred to the Slack pass, but is named here so it is not forgotten.

## Secrets

`CURSOR_API_KEY` (personal or service-account key — a Team/Admin key 401s every call per `NOTES.md`)
stored in **AWS Secrets Manager**, fetched at cold-start init and cached across warm invocations. The
function's execution role needs `secretsmanager:GetSecretValue` on that one secret ARN.

Two details the CLI does not have to think about:

- **Cache invalidation.** Caching for the life of a warm container means a rotated key bricks every
  warm container until it recycles. On an `AUTH` (exit 2) outcome the handler drops the cached value,
  re-fetches once, and retries; a second `AUTH` returns 500.
- **How the key reaches the SDK.** `agent.ts:101` reads `process.env.CURSOR_API_KEY` at call time, so
  the handler must assign the fetched secret into `process.env` before calling `runQa`. That implicit
  seam works but is worth replacing later by threading `apiKey` through `RunOptions`.

Lower-effort fallback available: an encrypted Lambda environment variable.

## Logging

`runQa` writes JSONL to disk on the **success path** (`run.ts:238`) and again for refusals
(`run.ts:240`), defaulting `logDir` to `.logs/qa` relative to CWD (`run.ts:113`). `appendJsonl`
(`log.ts`) calls `mkdirSync` + `appendFileSync` with no error handling. On Lambda everything outside
`/tmp` is read-only, so **as written, every successful answer would throw `EROFS`** and be converted by
the backstop into a 500. Two changes:

1. `log.ts` wraps its filesystem work in a try/catch. A log write must never be able to destroy an
   answer — true for the CLI too, so this is a fix at the right layer rather than a Lambda workaround.
2. `core.ts` emits the same record as a single-line `console.log(JSON.stringify(...))`, making
   CloudWatch Logs Insights the queryable log. `logDir` points at `/tmp/qa` for local-container parity.

## Error handling

Reuse `runQa`'s structured `RunOutcome` — no new error taxonomy. The handler wraps the call in a
try/catch as a last-resort 500 with a JSON error body. Operational failures are already distinct exit
codes; the handler only maps them to HTTP.

Note that **`LOCKDOWN` (exit 5) is unreachable at runtime.** `supportsReadOnlyLockdown()` returns
`typeof Agent.prompt === "function" && READ_ONLY_MODE === "plan"` (`agent.ts:131`) — a tautology whose
real value is as a compile-time guard: an SDK that drops the `"plan"` branch of `AgentModeOption` fails
to typecheck. The row stays in the mapping table for completeness, but plan-mode enforcement is the
only thing standing between an attacker-supplied question and shell access, and it is now reachable
over the network. `@cursor/sdk` is therefore **pinned exactly** (1.0.24) in the image, and any bump is
a gated change requiring a re-run of the `PWNED.txt` probe from `NOTES.md`.

## Threat model note (carried forward from `NOTES.md`)

`NOTES.md` closes its lockdown findings with an explicit open question: *"Network: not probed with a
dedicated web tool... Flag for the infra story if a stricter network guarantee is needed."* **This is
that story.** Two things widen the surface relative to the local CLI: the question text becomes
attacker-supplied over HTTPS, and the docs the agent reads are LLM-generated from third-party repos,
so doc content is semi-untrusted. Plan mode denies bash, which removes the shell egress vector and is
judged sufficient for this slice. Recorded as an accepted residual risk, not a solved one; a VPC with
egress restricted to the Cursor API is the lever if a stricter guarantee is later required.

## Testing

- **Unit:** the handler's event → `runQa` → HTTP mapping, using the existing `AgentSeam` fakes (no live
  model). Covers each exit-code → status branch, the 400 validation branches, `isBase64Encoded`
  decoding, `error`/`requestId` envelope propagation, and the backstop.
- **Local container:** `docker run` with the AWS Runtime Interface Emulator (bundled in the base image)
  plus `curl` to `localhost:9000` — exercises the real baked image and real docs, with a fake or live
  seam.
- **Deployed smoke:** SigV4 `curl` to the Function URL with one answerable and one refusal question.

## Residual risk → spike first

The `@cursor/sdk` local runtime ships a `cursorsandbox` binary and may want to write state relative to
`cwd` or `$HOME`. Lambda's filesystem is read-only except `/tmp`.

**Spike (plan task #1):** run the built container locally via the Runtime Interface Emulator. This is
the gate — if the runtime cannot execute under Lambda constraints, revisit the approach before
building the rest. Confirm, in order:

1. Plan-mode retrieval completes with a read-only filesystem and `HOME=/tmp`. Mitigations if it balks:
   `sandboxOptions:{enabled:false}`, redirect any writable paths to `/tmp`.
2. **No `EROFS`** from the logging path on a successful answer (validates the `log.ts` fix).
3. **The orphan test:** two sequential invocations where the first times out. Confirm the second is not
   contaminated by the first's abandoned agent, and that the recycle actually fires without eating the
   504. This decides direct-call vs fork-a-worker.
4. Cold-start latency end to end, and peak RSS at 2GB — to confirm the memory setting and see whether
   arm64 holds up.
5. `/tmp` growth across ~10 warm invocations. `/tmp` persists in a warm container, so per-run state
   written under `HOME=/tmp` accumulates toward `ENOSPC`.

Lower-severity, noted but not gating: `@cursor/sdk` hard-depends on `@statsig/js-client`, a telemetry
client. Harmless behind a Function URL with open egress; expect slow cold starts or hangs if this ever
moves into an egress-restricted VPC.

## Repo layout

Colocated with the CLI it wraps. `tsconfig.json` sets `rootDir: "src"`, so the handler must live
under `src/` to compile at all — hence `src/lambda/`, not a top-level `lambda/`.

- `strata-qa/src/lambda/handler.ts`
- `strata-qa/src/lambda/handler.test.ts`
- `strata-qa/src/lambda/core.ts`
- `strata-qa/src/lambda/core.test.ts`
- `strata-qa/Dockerfile`
- `strata-qa/deploy.sh`
- `.dockerignore` — at the **repo root**, because the build context is the repo root (the image needs
  both `docs/` and `strata-qa/`) and Docker reads `.dockerignore` from the context root.

One consequence of `COPY`ing without `.git`: `computeDocsVersion` (`graph.ts:30`) shells out to
`git rev-parse HEAD` and falls back to `sha256:<hash of graph.json>`, so **`docsVersion` in Lambda is a
`sha256:` string, not a git SHA**. Deterministic and correct, just different from local runs; the git
SHA travels separately as the `STRATA_QA_GIT_SHA` build arg.

Docs updated per `AGENTS.md` (README + the Commands section) in the same PR.

## Out of scope (this slice)

- Slack signature verification, async ACK, and `chat.postMessage` callback.
- The async dispatcher itself — `replyTo` is accepted and ignored in this slice.
- Retry/idempotency handling (dedupe on `requestId`).
- API Gateway, custom domains, throttling, WAF.
- Infrastructure-as-code (Terraform/SAM) — scripted deploy now, promotable later.
- Runtime doc refresh (docs are as-fresh-as-last-image-build; redeploy or scheduled rebuild refreshes).
- VPC placement / egress restriction (see the threat model note — accepted residual risk for now).
- Threading `apiKey` through `RunOptions` instead of `process.env`.
