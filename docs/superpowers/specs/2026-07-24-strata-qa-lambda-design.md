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
verification, async ACK, `chat.postMessage` callback) is a later pass, but the HTTP contract here
is chosen to be the seam Slack targets.

## Decisions locked in brainstorming

| Decision | Choice | Why |
|---|---|---|
| MVP scope | Thin HTTP slice, Slack-ready | De-risk packaging + latency before adding Slack's async layer |
| Doc + CLI delivery | Baked into the container image at build time | Fast, reliable cold starts; no runtime git/npm fragility; docs regenerate infrequently |
| HTTP front | Lambda Function URL, `AWS_IAM` auth | Simplest thing that works; no API Gateway resource; later flips to public + Slack-signature verify |
| Deploy tooling | Scripted AWS CLI (Dockerfile + `deploy.sh`) | Fastest path to a working slice on a local AWS environment; promotable to IaC later |
| Handler execution model | Import and call `runQa()` directly | Clean existing seam; no per-invoke subprocess; SDK stdout chatter goes to CloudWatch |
| Secrets | AWS Secrets Manager, fetched at cold-start init | `CURSOR_API_KEY` is a real credential; env-var fallback available if preferred |

## Architecture

```
curl (SigV4)  ──HTTPS POST {question}──►  Lambda Function URL (AWS_IAM)
                                                │
                                                ▼
                                     handler.ts (Node 22, container)
                                                │  imports runQa() directly
                                                ▼
                                     runQa(opts, cursorSeam)  ──►  @cursor/sdk
                                                │                  (linux binary,
                                                │                   plan-mode, reads
                                                ▼                   baked docs/)
                                     RunOutcome {result, exitCode}
                                                │
                                                ▼
                                     HTTP response (status ← exitCode map,
                                                    body = QaResult JSON)
```

## Key design choice: handler calls `runQa` directly

`strata-qa/src/run.ts` already exposes a clean seam — `runQa(opts, seam)` returns a structured
`RunOutcome { result, exitCode, errorMessage }`. The handler imports and calls it directly rather
than spawning `node dist/cli.js`.

Rationale:

- No per-invocation subprocess spawn.
- The CLI's stdout-silencing logic (`cli.ts`) exists only to protect the single-JSON-line stdout
  contract. In Lambda the SDK's progress chatter simply lands in CloudWatch logs, which is desirable,
  so that machinery is not needed.
- The handler maps `exitCode` → HTTP status and returns `result` as the body.

Alternative considered — subprocess the CLI (`node dist/cli.js "question" --docs-root ...`, parse
stdout JSON). Reuses the exact CLI boundary but buys nothing here and costs a spawn per invoke.
Rejected.

## Components

1. **`strata-qa/Dockerfile`** — `FROM` the AWS Lambda Node.js 22 base image (Amazon Linux). At build:
   `git clone --depth 1` the public repo at a pinned ref, then `cd strata-qa && npm ci && npm run build`.
   `npm ci` on Linux resolves the correct `@cursor/sdk-linux-<arch>` optional dependency automatically
   (the SDK ships per-platform binaries — `cursorsandbox`, ripgrep). Docs (`docs/graph.json`,
   `docs/INDEX.md`, `docs/sources`) are baked in from the same clone. Sets `HOME=/tmp` and points
   `docsRoot` at the repo root.
2. **`strata-qa/lambda/handler.ts`** — the Lambda entry point. Parses the Function URL event body into
   `{ question }` (optional `model`), calls `runQa`, maps the exit code to an HTTP status, and returns
   `{ statusCode, body }`. Fetches `CURSOR_API_KEY` once at cold-start init and caches it across warm
   invocations.
3. **`strata-qa/deploy.sh`** — scripted AWS CLI: build image → push to ECR → create/update the Lambda
   from image → ensure the Function URL with `AWS_IAM` auth → set config (timeout, memory, `HOME`,
   secret reference).

## Data flow / HTTP contract

- **Request:** `POST` with JSON body `{ "question": "..." }` (optional `model`). This shape is the seam
  a future Slack receiver targets — it translates the slash-command/event payload into this same body.
- **Response body:** the unchanged `QaResult` JSON — `schema_version`, `status`, `answer`, `sources`,
  `grounding`, `model`, `docsVersion`, `usage`, `durationMs`.
- **Status mapping** (from the existing `EXIT` codes in `run.ts`):

  | Outcome | Exit code | HTTP status |
  |---|---|---|
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

## Secrets

`CURSOR_API_KEY` (personal or service-account key — a Team/Admin key 401s every call per `NOTES.md`)
stored in **AWS Secrets Manager**, fetched at cold-start init and cached across warm invocations.
Lower-effort fallback available: an encrypted Lambda environment variable.

## Error handling

Reuse `runQa`'s structured `RunOutcome` — no new error taxonomy. The handler wraps the call in a
try/catch as a last-resort 500 with a JSON error body. Operational failures are already distinct exit
codes; the handler only maps them to HTTP.

## Testing

- **Unit:** the handler's event → `runQa` → HTTP mapping, using the existing `AgentSeam` fakes (no live
  model). Covers each exit-code → status branch and the backstop.
- **Local container:** `docker run` with the AWS Runtime Interface Emulator (bundled in the base image)
  plus `curl` to `localhost:9000` — exercises the real baked image and real docs, with a fake or live
  seam.
- **Deployed smoke:** SigV4 `curl` to the Function URL with one answerable and one refusal question.

## Residual risk → spike first

The `@cursor/sdk` local runtime ships a `cursorsandbox` binary and may want to write state relative to
`cwd` or `$HOME`. Lambda's filesystem is read-only except `/tmp`.

**Spike (plan task #1):** run the built container locally via the Runtime Interface Emulator and
confirm plan-mode retrieval completes with a read-only filesystem and `HOME=/tmp`. Mitigations if it
balks: `sandboxOptions:{enabled:false}`, redirect any writable paths to `/tmp`. This is the gate — if
the runtime cannot execute under Lambda constraints, revisit the approach before building the rest.

## Repo layout

Colocated with the CLI it wraps:

- `strata-qa/lambda/handler.ts`
- `strata-qa/lambda/handler.test.ts`
- `strata-qa/Dockerfile`
- `strata-qa/deploy.sh`

Docs updated per `AGENTS.md` (README + the Commands section) in the same PR.

## Out of scope (this slice)

- Slack signature verification, async ACK, and `chat.postMessage` callback.
- API Gateway, custom domains, throttling, WAF.
- Infrastructure-as-code (Terraform/SAM) — scripted deploy now, promotable later.
- Runtime doc refresh (docs are as-fresh-as-last-image-build; redeploy or scheduled rebuild refreshes).
