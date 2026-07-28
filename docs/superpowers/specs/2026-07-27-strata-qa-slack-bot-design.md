# Design: reach strata-qa from Slack

Date: 2026-07-27
Status: approved, not yet implemented

## Problem

`strata-qa` is deployed as a container-image Lambda with a Function URL under `AWS_IAM` auth. Asking
it a question today means signing a SigV4 request by hand. The audience for these answers — developers
with a Strata question — lives in Slack, and issue #30 explicitly deferred "the Slack bot itself, or
any other external caller/integration" to separate work. This is that work.

Two facts constrain every choice below:

- **Slack requires an HTTP 200 within 3 seconds**, or it marks the delivery failed and re-sends the
  event up to three times. A clean answer takes 9–14 s and the invocation wall clock allows 90 s
  (`NOTES.md`). No synchronous design can work.
- **A question costs roughly 190k tokens** (`NOTES.md`). The existing function carries
  `RESERVED_CONCURRENCY=3` precisely as a spend ceiling, and nothing here may weaken it.

## Decisions

| Decision | Choice |
|---|---|
| Invocation style | `@mention`, answered in-thread |
| Architecture | Two Lambdas: a thin public gateway, plus the existing IAM-only QA function |
| Packaging | One container image, two functions, different `CMD` |
| Wait signal | 👀 reaction on the question, swapped for a terminal reaction on completion |
| Guardrails | Channel allowlist; async-invoke retries disabled; Slack retry deliveries deduped |
| Answer format | Answer text plus sources as GitHub permalinks pinned to the deployed sha |

### Why two functions rather than one

`RESERVED_CONCURRENCY=3` is the deciding factor. If ACKs and QA runs share one concurrency pool,
three simultaneous questions occupy every slot for up to 90 s each, every ACK behind them breaches the
3 s deadline, and Slack's retries spawn further paid runs — a feedback loop that converts load into
spend. Separate functions let the gateway scale freely on a workload measured in milliseconds while
the expensive function keeps its hard ceiling.

The split also keeps the existing Function URL on `AWS_IAM`. The function that spends money is never
publicly reachable; only the signature-checking one is.

Rejected: a single self-invoking function (inherits the concurrency collision and would require
raising the ceiling that exists to prevent it), and Socket Mode on Fargate (correct only if a public
endpoint is unacceptable to security — it bills a container 24/7 and discards the Function URL work
already done).

## Architecture

```
Slack (#strata-docs-qa)
  │  app_mention
  ▼
strata-qa-slack ──── Function URL, AuthType: NONE
  │                  CMD: strata-qa/dist/slack/gateway.handler
  │                  verify → parse → guard → 👀 → async invoke → 200
  │  lambda:InvokeFunction (InvocationType: Event)
  ▼
strata-qa       ──── Function URL, AuthType: AWS_IAM (unchanged)
                     CMD: strata-qa/dist/lambda/handler.handler
                     dispatches on event shape:
                       HTTP request   → existing synchronous path, unchanged
                       slack.qa.v1    → answer, then post to the thread
```

### New modules, under `strata-qa/src/slack/`

| Module | Responsibility | Depends on |
|---|---|---|
| `verify.ts` | HMAC-SHA256 over `v0:{ts}:{rawBody}`, timing-safe compare, reject timestamps older than 5 minutes | `node:crypto` |
| `events.ts` | Parse the envelope: `url_verification` vs `event_callback`/`app_mention`. Strip `<@U…>` tokens; extract `channel`, `thread_ts ?? ts`, `user`, `team` | none |
| `guard.ts` | Channel allowlist, retry-delivery handling, question length | none |
| `delivery.ts` | `fetch` wrappers for `reactions.add`, `reactions.remove`, `chat.postMessage` | `fetch` |
| `format.ts` | `QaResult` → Slack blocks, including refusals and errors | types only |
| `gateway.ts` | The gateway handler; wires the above and invokes the QA function | `@aws-sdk/client-lambda` |

Every module except `gateway.ts` is a pure function over plain data.

### Changed modules

- **`src/lambda/handler.ts`** — the exported `handler` gains a discriminator check: a `slack.qa.v1`
  envelope routes to `runSlackJob`; anything else falls through to the existing `handleEvent`
  unchanged.
- **`src/slack/job.ts`** *(new)* — `runSlackJob` calls the existing `handleQuestion` from
  `lambda/core.ts`, then formats and delivers. It sits under `src/slack/` rather than `src/lambda/`
  because it belongs to the Slack feature, alongside the `format.ts` and `delivery.ts` it uses;
  `gateway.ts` sets that precedent. `core.ts` itself needs no change — its own comment anticipated
  this seam ("it will ACK, then call this on the async side").
- **`src/lambda/secrets.ts`** *(new)* — a memoized `getSecret(id)`. Deliberately *not* a
  generalization of `createKeyLoader`, whose semantics are Cursor-specific: it populates
  `process.env.CURSOR_API_KEY` because `createCursorSeam` reads it from there, and its `invalidate()`
  solves a rotation-versus-auth-failure ambiguity that has no Slack analogue.
- **`Dockerfile`** — adds `ENV DOCS_REPO_URL`, following the file's existing rule that fixed runtime
  values live in the image.
- **`.dockerignore`** — no rule changes; `strata-qa/src/**/*.test.ts` already covers the new tests.
  Its closing comment asserts "nothing ships that the handler cannot reach", which a second
  entrypoint makes stale; the comment is updated to name both entrypoints.
- **`deploy.sh`** — see Deployment below.
- **`README.md`**, **`AGENTS.md`** — new env vars, the removed `replyTo`, the bootstrap sequence.

### New non-code artifact

`strata-qa/slack/manifest.yaml`, so the Slack app's configuration is version-controlled rather than
defined by clicks made once in a browser.

```yaml
display_information:
  name: Strata Docs Q&A
features:
  bot_user: { display_name: strata-qa, always_online: false }
oauth_config:
  scopes:
    bot: [app_mentions:read, chat:write, reactions:write]
settings:
  event_subscriptions:
    request_url: https://<generated>.lambda-url.us-east-1.on.aws/
    bot_events: [app_mention]
  interactivity: { is_enabled: false }
  socket_mode_enabled: false
```

Three scopes, no more. Notably no `channels:history`: the mention event carries its own text, so the
bot never reads the channel.

### Cold-start discipline

`gateway.ts` must not transitively import `agent.ts`, `run.ts`, `graph.ts`, or `@cursor/sdk`. Module
load, not image size, is what would threaten the 3 s budget. This is enforced by a test, not a
convention (see Testing).

## Data flow

### Happy path

1. Someone posts `@strata-qa <question>` in `#strata-docs-qa`.
2. Slack POSTs the `app_mention` event to the gateway Function URL with `X-Slack-Signature` and
   `X-Slack-Request-Timestamp`.
3. The gateway reads the **raw** body. Function URLs may base64-encode it, so the order is: decode
   base64 → HMAC over the resulting string → *then* `JSON.parse`. Verifying a re-serialized body
   produces an integration that works until a question contains a non-ASCII character.
4. Signature verified and timestamp within 5 minutes, else `401`.
5. Guards: channel in the allowlist; a genuine `app_mention` (no `bot_id`, no `subtype` — this is the
   self-reply loop guard); question non-empty after stripping `<@U…>` tokens.
6. `reactions.add` 👀 on the user's message.
7. `lambda:InvokeFunction` with `InvocationType: "Event"`.
8. Return `200`. One HMAC and two network calls, comfortably inside 3 seconds.
9. The QA function runs `handleQuestion`, formats the result, posts into `thread_ts`, then swaps 👀
   for ✅ (`answered`), 🤷 (`no_match`, `low_confidence`), or ⚠️ (`error`).

### The job envelope

The contract between the two functions:

```json
{
  "type": "slack.qa.v1",
  "question": "How does OSCER authenticate inbound API requests?",
  "requestId": "9f3c…",
  "slack": {
    "channel": "C0123ABCD",
    "threadTs": "1753632000.123456",
    "messageTs": "1753632000.123456",
    "user": "U0456EFGH",
    "teamId": "T0789IJKL"
  }
}
```

`type` is an explicit discriminator, not shape-sniffing.

**This supersedes the reserved `replyTo?: string` field in `handler.ts`.** A bare URL cannot carry
channel plus thread plus message timestamp, and the `@mention` path has no `response_url` to put in
it. That placeholder guessed wrong and no code path reads it, so it is deleted rather than left as a
dead field. `README.md` documents it and is updated in the same change. No caller consumes it, so
nothing breaks.

### Retry dedup

A blunt drop of every `X-Slack-Retry-Num` delivery protects against triple spend but silently
discards the legitimate case where our *first* delivery failed, losing the question with no visible
trace.

The 👀 reaction is already the state. On a retry delivery, call `reactions.add` first: Slack returns
`already_reacted` if the previous attempt got that far, so drop it; any other outcome means the first
attempt died before dispatching, so continue normally. Stateless dedup with Slack as the store, no
new AWS resource.

### Failure paths

| What fails | Behavior |
|---|---|
| Bad signature or stale timestamp | `401`. It is not Slack; retries are irrelevant. |
| Mention from a non-allowlisted channel | One threaded reply saying the bot is not enabled there, then stop. No model call, so no spend. Silence would read as a broken bot. |
| QA function throttled | Lambda queues the async event and retries for `MaximumEventAgeInSeconds=180`, then drops it. A dropped event leaves 👀 in place — a visible "nothing came back". Accepted v1 limitation; the later fix is an `OnFailure` destination. |
| QA run errors or hits the wall clock | `runSlackJob` catches everything and still posts a message plus ⚠️. The Slack post must complete **before** any container recycle, since `process.exit(1)` would otherwise take the delivery with it. |
| `chat.postMessage` fails | Log to CloudWatch and give up. Nothing else is available. |
| Answer exceeds Slack's 3000-char section limit | Truncate with an explicit "answer truncated — see sources" note rather than letting the API reject the message. |
| `STRATA_QA_GIT_SHA` ends in `-dirty` | Permalinks would 404, so fall back to plain code-formatted paths. |

### Source permalinks

`graph.json` node paths are `docs/`-relative (`sources/app-template/using-the-rails-template.md`), so
a permalink is `${DOCS_REPO_URL}/blob/${STRATA_QA_GIT_SHA}/docs/${path}`. Pinning to the deployed sha
means a link always resolves to the exact doc revision that produced the answer.

## Configuration, secrets, and IAM

### Secrets

| Secret | Read by | Not readable by |
|---|---|---|
| `strata-qa/cursor-api-key` *(exists)* | `strata-qa` | the gateway |
| `strata-qa/slack-signing-secret` *(new)* | gateway | `strata-qa` |
| `strata-qa/slack-bot-token` *(new)* | both | — |

The first row is the security claim the two-function split exists to make: the function exposed to
the public internet cannot read the credential that spends money.

### IAM

- `strata-qa-lambda-role` *(exists)* gains `GetSecretValue` on the bot-token secret.
- `strata-qa-slack-lambda-role` *(new)*: `AWSLambdaBasicExecutionRole`, `GetSecretValue` on the two
  Slack secrets, and `lambda:InvokeFunction` scoped to the `strata-qa` function ARN alone.

### Environment

Fixed per image, set in the `Dockerfile`:

- `DOCS_REPO_URL=https://github.com/navapbc/strata-documentation-engine`

Per deploy, set on the function configuration by `deploy.sh`:

- Gateway: `SLACK_SIGNING_SECRET_ID`, `SLACK_BOT_TOKEN_SECRET_ID`, `SLACK_ALLOWED_CHANNELS`,
  `QA_FUNCTION_NAME`
- `strata-qa`: `SLACK_BOT_TOKEN_SECRET_ID`, added to the existing set

`SLACK_ALLOWED_CHANNELS` defaults to empty, and **empty denies everything** at request time. A
misconfigured allowlist fails closed.

That default creates a deploy-time hazard of exactly the kind `deploy.sh` already learned about with
`ROTATE_SECRET`: a routine code redeploy from a shell that does not export `SLACK_ALLOWED_CHANNELS`
would overwrite a working allowlist with an empty one and take the bot down. So `deploy.sh` reads the
existing function's current value when the variable is unset and preserves it, and only writes a new
allowlist when one is explicitly supplied. Empty means deny at runtime; unset means unchanged at
deploy time. The two are deliberately not the same thing.

## Deployment

`deploy.sh` extends rather than forks. Its inline secret block becomes an
`ensure_secret <name> <env-var> <rotate-flag>` function called three times; the existing
`stage_secret` / trap / `file://` discipline is correct and must not be copy-pasted. New rotation
flags follow the existing `ROTATE_SECRET` pattern: `ROTATE_SLACK_SIGNING_SECRET`,
`ROTATE_SLACK_BOT_TOKEN`.

```bash
# same IMAGE_URI, different entrypoint
aws lambda create-function --function-name strata-qa-slack \
  --package-type Image --code "ImageUri=${IMAGE_URI}" \
  --image-config 'Command=["strata-qa/dist/slack/gateway.handler"]' \
  --role "$SLACK_ROLE_ARN" --architectures arm64 \
  --timeout 10 --memory-size 512 --environment "$SLACK_ENV_VARS"

aws lambda create-function-url-config --function-name strata-qa-slack --auth-type NONE

aws lambda put-function-concurrency --function-name strata-qa-slack \
  --reserved-concurrent-executions 10

aws lambda put-function-event-invoke-config --function-name strata-qa \
  --maximum-retry-attempts 0 --maximum-event-age-in-seconds 180
```

The gateway gets `--timeout 10` (it must never approach 3 s, and 10 leaves room for a slow Secrets
Manager call to fail visibly) and reserved concurrency 10 — enough that ACKs never queue behind each
other, bounded so unsigned traffic cannot scale out indefinitely.

`put-function-event-invoke-config` is the guardrail that matters most: Lambda retries failed async
invocations twice by default, which is up to three times the token spend on a question that was
already failing.

Both functions deploy from the same `IMAGE_URI`, so they can never drift to different commits.

### Bootstrap sequence

Slack needs a URL that does not exist yet, and the bot token does not exist until the app is
installed. The order that resolves it:

1. Create the Slack app from `strata-qa/slack/manifest.yaml`, event subscriptions off.
2. Copy the **signing secret** from Basic Information (available pre-install).
3. `SLACK_SIGNING_SECRET=… ./strata-qa/deploy.sh` — creates the secrets and both functions, prints
   the gateway URL. The bot-token secret is created with a placeholder.
4. Paste that URL as the Event Subscriptions Request URL. Slack sends `url_verification` and the
   gateway echoes the challenge. **The challenge path must not touch the bot token**, which does not
   exist yet.
5. Subscribe to `app_mention`, install to the workspace, copy the **bot token**.
6. `ROTATE_SLACK_BOT_TOKEN=1 SLACK_BOT_TOKEN=xoxb-… ./strata-qa/deploy.sh`
7. Create `#strata-docs-qa`, `/invite @strata-qa`, copy the channel ID.
8. `SLACK_ALLOWED_CHANNELS=C0123ABCD ./strata-qa/deploy.sh`

Steps 1 and 5 require workspace-admin approval at Nava. That is the long pole and should start before
any code is written.

## Testing

No new test infrastructure; vitest is already wired.

### Unit

**`verify.ts`** is the security boundary and gets the most adversarial coverage: a known-good vector
from a fixed secret/timestamp/body; a body tampered by one byte; a correct signature under the wrong
secret; a timestamp 6 minutes old; a base64-encoded body; and a non-ASCII question, which is the case
that catches an implementation HMACing a re-serialized body.

**`events.ts`** — `url_verification`; a normal `app_mention`; a message carrying `bot_id` (ignored —
the self-reply loop guard); a `subtype`d message; a top-level mention (`thread_ts` absent, falls back
to `ts`) versus one already in a thread; text with several `<@U…>` tokens; text empty after stripping.

**`guard.ts`** — empty allowlist denies everything (the fail-closed claim, asserted rather than
assumed); hit and miss; retry-header presence.

**`format.ts`** — each of the four `status` values; sources as permalinks against a clean sha; a
`-dirty` sha degrading to plain paths; an over-long answer truncating with the explicit note.

### Seam level

`gateway.ts` and `runSlackJob` take injected dependencies, following the existing `AgentSeam` /
`HandleEventDeps` pattern rather than inventing a second style.

- **Gateway** — `401` on a bad signature *and no invoke*; non-allowlisted channel → `200`, one reply,
  no invoke; happy path → reaction, invoke, `200`; a retry where `reactions.add` returns
  `already_reacted` → no invoke; a retry where it does not → invoke.
- **`runSlackJob`** — posts to the right `thread_ts`; swaps the reaction per status; a thrown error
  still produces a message and ⚠️; the Slack post completes before any recycle.
- **`handler.ts` dispatch** — a `slack.qa.v1` envelope routes to `runSlackJob`; an HTTP event behaves
  exactly as before. The strongest regression signal is that the existing `handler.test.ts` passes
  **unmodified**; if the dispatch forces edits there, the change was more invasive than intended.

### Cold-start guard

A test that statically walks relative imports from `src/slack/gateway.ts` and asserts the closure
excludes `agent.ts`, `run.ts`, `graph.ts`, and `@cursor/sdk`. Around thirty lines, deterministic, and
it turns a comment someone will eventually violate into a failing build.

### Live verification

Four things unit tests cannot reach:

1. **The `url_verification` challenge** tests itself — Slack accepting the Request URL at bootstrap
   step 4 is the passing assertion.
2. **End to end**, using questions from the existing golden fixtures so the expected outcome is known:
   one answerable question → answer, ✅, and permalinks that resolve; one refusal fixture → 🤷.
3. **The privilege split**, once: assume `strata-qa-slack-lambda-role` and attempt `GetSecretValue` on
   `strata-qa/cursor-api-key`, expecting `AccessDenied`. The whole architecture rests on that claim
   being true rather than intended.
4. **Cold-start ACK latency**: `Init Duration` plus `Duration` from a cold gateway invoke in
   CloudWatch, confirming the margin against 3 seconds. Recorded in `NOTES.md`, matching that file's
   role as the record of live-observed facts.

Out of scope: answer quality, which remains `npm run qa -- eval`.

## New dependency

`@aws-sdk/client-lambda`, for the async invoke. One addition, on the gateway path only.

## Accepted limitations

- A question dropped after 180 s of async-invoke queueing leaves 👀 in place with no message. Visible,
  but not explained. The fix is an `OnFailure` destination, deferred.
- No per-user rate limiting. The channel allowlist is the only spend control on who can ask; one
  person looping the bot is not prevented. Adding it means DynamoDB and per-user state, which v1 does
  not carry.
- The bot answers anyone in an allowlisted channel. There is no per-user authorization.
- Concurrency remains 3. A fourth simultaneous question queues and may be dropped at 180 s.

## Out of scope

Slash commands, interactivity (buttons, modals), Home tab, DMs, multi-workspace distribution, answer
quality changes, and any change to the retrieval pipeline itself.

## Follow-up work this creates

- A GitHub issue for this work. Issue #30 explicitly deferred the Slack bot, and the current branch
  `baonguyen/strata-qa-with-slack` carries no issue number, which is off-convention per `AGENTS.md`.
- `README.md` and the Commands block in `AGENTS.md`, updated in the implementing PR.
