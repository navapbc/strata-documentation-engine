# strata-qa Lambda HTTP Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy the existing `strata-qa` docs Q&A CLI as a container-image AWS Lambda, fronted by a Lambda Function URL, that accepts a question over HTTPS and returns the existing `strata-qa` JSON answer.

**Architecture:** Two thin modules over the already-tested `runQa()` seam — no new QA logic. `src/lambda/core.ts` exposes `handleQuestion(job, seam, config): Promise<RunOutcome>` and knows nothing about HTTP; `src/lambda/handler.ts` is the Function URL adapter (method check, base64 decode, validation, exit-code→HTTP mapping, secret loading, post-timeout container recycle). The split exists so the future Slack dispatcher — which must ACK within 3s and therefore cannot reuse a synchronous HTTP shape — calls `handleQuestion` unchanged. Docs + CLI + `node_modules` are baked into a container image at build time by `COPY`ing the repo from the build context; `@cursor/sdk`'s per-platform Linux binary is resolved by running `npm ci` inside the Lambda base image.

**Tech Stack:** Node 22, TypeScript (strict, ESM/NodeNext), vitest, `@cursor/sdk` 1.0.24 (pinned exactly), `@aws-sdk/client-secrets-manager`, Docker, AWS CLI (Lambda container image + Function URL + ECR + Secrets Manager).

**Source of truth:** `docs/superpowers/specs/2026-07-24-strata-qa-lambda-design.md`. Where this plan and the design disagree, the design wins — report the conflict rather than guessing.

## Global Constraints

- Runtime: **Node 22**, TypeScript **strict**, ESM (`"type": "module"`, `module`/`moduleResolution` = `NodeNext`). Relative imports use the `.js` extension (e.g. `import { runQa } from "../run.js"`).
- Handler source lives under `strata-qa/src/lambda/` — tsconfig `rootDir` is `src`, so nothing outside `src/` compiles. It emits to `strata-qa/dist/lambda/`.
- Tests use **vitest** and the existing `AgentSeam` fakes — **no live model calls** in unit tests.
- Only one new production dependency is permitted: **`@aws-sdk/client-secrets-manager`**. No other new deps.
- The docs root must contain `docs/graph.json`, `docs/INDEX.md`, and `docs/sources/` (validated by `runQa` preflight).
- `CURSOR_API_KEY` must be a **personal user key or a service-account key** — a Team/Admin key 401s every call (`strata-qa/NOTES.md`).
- Lambda's filesystem is **read-only except `/tmp`**. `runQa` writes JSONL on its *success* path (`run.ts:238`), so this is a live crash path, not a theoretical one — Task 2 fixes it at the source and Task 6 points `logDir` at `/tmp/qa`.
- The agent wall-clock timeout (`AGENT_TIMEOUT_MS`, ~90s) MUST be strictly less than the Lambda function timeout (~120s) so the handler returns a clean 504 before Lambda hard-kills the invocation.
- **`withTimeout` does not cancel the agent** (`agent.ts:42-52` — `Promise.race`; the underlying `Agent.prompt` runs on). Under Lambda's freeze/thaw the orphan resumes inside the *next* invocation. Task 6 adds the container recycle; Task 7 is the gate that proves it works.
- Refusals (`no_match`, `low_confidence`) are valid answers → HTTP **200**, not errors.
- `@cursor/sdk` stays pinned at exactly `1.0.24`. Plan-mode (`mode:"plan"`) is the only thing standing between an attacker-supplied question and shell access, and `supportsReadOnlyLockdown()` (`agent.ts:131`) is a compile-time tautology, not a runtime probe. Do not bump the SDK in this plan.

## File Structure

- **Create** `strata-qa/src/lambda/core.ts` — `handleQuestion(job, seam, config)`: builds `RunOptions`, calls `runQa`, emits the structured CloudWatch log line, returns the `RunOutcome`. No HTTP knowledge. This is the seam the Slack dispatcher will call.
- **Create** `strata-qa/src/lambda/core.test.ts`
- **Create** `strata-qa/src/lambda/handler.ts` — the Function URL adapter: `parseJob`, `toHttpResponse`, `loadConfig`, `ensureApiKey`, `handleEvent`, the recycle logic, and the exported `handler`.
- **Create** `strata-qa/src/lambda/handler.test.ts`
- **Create** `strata-qa/Dockerfile` — image built from the **repo-root** context: `COPY` docs + CLI, `npm ci`, build, set handler CMD.
- **Create** `.dockerignore` (repo root) — the build context is the repo root, and Docker reads `.dockerignore` from the context root.
- **Create** `strata-qa/deploy.sh` — scripted AWS CLI: IAM role, ECR, secret, Lambda from image, reserved concurrency, Function URL.
- **Modify** `strata-qa/src/log.ts` + `strata-qa/src/log.test.ts` — make filesystem failure non-fatal.
- **Modify** `strata-qa/package.json` — add `@aws-sdk/client-secrets-manager`.
- **Modify** `README.md` and `AGENTS.md` (Commands; `CLAUDE.md` is a symlink — edit `AGENTS.md` only).

**Two gates.** Task 1 gates everything (can the SDK runtime execute under Lambda constraints at all). Task 7 gates deployment (does the post-timeout recycle actually work). Do not proceed past either on a failure — report and stop.

---

## Task 1: Feasibility spike — prove the SDK runtime works in Lambda (GATE 1)

**This task gates the rest of the plan.** If plan-mode retrieval cannot run under Lambda's read-only filesystem, stop and revisit the approach before building any handler code.

The probe reuses the existing, already-tested CLI as the workload — no handler code yet — so this isolates runtime feasibility from new code. The orphan/recycle question needs the handler and is deferred to Task 7.

**Files:**
- Create: `strata-qa/Dockerfile`
- Create: `.dockerignore` (repo root)

**Interfaces:**
- Consumes: the repo working tree as build context; the existing `dist/cli.js`.
- Produces: a buildable image whose CMD is finalized in Task 7; confirmation (or documented mitigation) that `mode:"plan"` retrieval runs read-only.

- [ ] **Step 1: Write the repo-root `.dockerignore`**

The build context is the **repo root** (the image needs both `docs/` and `strata-qa/`), so `.dockerignore` goes at the repo root, not in `strata-qa/`. Excluding the host's `node_modules` is not just about context size — it stops the darwin-arm64 `@cursor/sdk` binary from shadowing the Linux one.

```
.git
node_modules
strata-qa/node_modules
strata-qa/dist
.logs
.sources
__pycache__
.venv
.pytest_cache
```

- [ ] **Step 2: Write the Dockerfile (probe form)**

```dockerfile
# strata-qa/Dockerfile
#
# Build context is the REPO ROOT, not strata-qa/:
#   docker build -f strata-qa/Dockerfile --platform linux/arm64 -t strata-qa-lambda:probe .
#
# arm64 is confirmed viable: @cursor/sdk-linux-arm64@1.0.24 publishes, so Graviton
# (cheaper) is available. Keep the arch consistent through Task 8.
FROM public.ecr.aws/lambda/nodejs:22

# Provenance only. docsVersion is computed separately (see note below).
ARG GIT_SHA=unknown
ENV STRATA_QA_GIT_SHA=${GIT_SHA}

WORKDIR ${LAMBDA_TASK_ROOT}

# Dependency layer first so doc-only edits don't reinstall node_modules.
COPY strata-qa/package.json strata-qa/package-lock.json ./strata-qa/
RUN cd strata-qa && npm ci

# Sources + the baked doc corpus (~900 KB).
COPY strata-qa ./strata-qa
COPY docs ./docs
RUN cd strata-qa && npm run build && npm prune --omit=dev

# The agent runtime needs a writable HOME; only /tmp is writable in Lambda.
ENV HOME=/tmp
ENV DOCS_ROOT=${LAMBDA_TASK_ROOT}
ENV QA_LOG_DIR=/tmp/qa

# Probe CMD (Task 7 confirms it). The probe in Step 4 overrides the entrypoint,
# so the not-yet-existing handler does not matter at this stage.
CMD ["strata-qa/dist/lambda/handler.handler"]
```

Note on `docsVersion`: `computeDocsVersion` (`graph.ts:30`) shells out to `git rev-parse HEAD` and falls back to `sha256:<hash of graph.json>` on failure. `.git` is excluded from the image, so **`docsVersion` in Lambda will be a `sha256:` string, not a git SHA.** That is correct and deterministic — just different from local runs. `STRATA_QA_GIT_SHA` carries the git provenance instead. Assert this in Task 7's smoke output rather than being surprised by it.

- [ ] **Step 3: Build the image**

Run (from the **repo root**):

```bash
docker build -f strata-qa/Dockerfile --platform linux/arm64 \
  --build-arg GIT_SHA="$(git rev-parse HEAD)" \
  -t strata-qa-lambda:probe .
```

Expected: build succeeds; during `npm ci` the log shows `@cursor/sdk-linux-arm64` being added (the Linux binary, not the darwin one). Confirm with `docker run --rm --entrypoint ls strata-qa-lambda:probe /var/task/strata-qa/node_modules/@cursor` — expect `sdk` and `sdk-linux-arm64`, and **no** `sdk-darwin-arm64`.

- [ ] **Step 4: Probe plan-mode retrieval read-only, HOME=/tmp**

Runs the real CLI inside the image against the baked docs, root filesystem read-only, only `/tmp` writable — mirroring Lambda. Supply a real personal/service-account key. Note `--log-dir` is deliberately **omitted** here so the run uses the CWD-relative default and exercises the read-only failure path.

```bash
docker run --rm \
  --read-only --tmpfs /tmp \
  -e HOME=/tmp \
  -e CURSOR_API_KEY="$CURSOR_API_KEY" \
  --entrypoint node \
  strata-qa-lambda:probe \
  strata-qa/dist/cli.js "What does the nava-platform CLI wrap to install templates?" \
  --docs-root /var/task --timeout 90
```

Two distinct outcomes to record separately:

- **Retrieval:** exactly one JSON object on stdout with `"status":"answered"` (or a grounded refusal). SDK progress noise on stderr is fine.
- **Logging:** an `EROFS`/`EACCES` failure from `appendJsonl` is **expected here and is not a spike failure** — it is exactly the bug Task 2 fixes. Record whether it occurred.

- [ ] **Step 5: Record the outcome (gate decision)**

- If retrieval answers: the runtime is Lambda-compatible. Proceed, whether or not logging threw.
- If it fails writing agent/sandbox state (EROFS/EACCES from the SDK, not from `appendJsonl`), or the sandbox binary errors: apply mitigations one at a time and re-run Step 4 — (a) confirm `HOME=/tmp` is set; (b) pass `sandboxOptions:{enabled:false}` via the seam; (c) redirect any other writable path the error names to `/tmp`. If none succeed, **stop and report** — the baked-image + local-runtime approach is not viable as-is.
- Also record, for the design's spike checklist: cold-start-equivalent wall time for the first run, peak RSS (`docker stats` during the run) against the planned 2048 MB, and `/tmp` usage after the run (`du -sh /tmp` via a second `docker exec`). These inform Task 8's memory setting; none of them gate.

- [ ] **Step 6: Commit**

```bash
git add strata-qa/Dockerfile .dockerignore
git commit -m "Add probe Dockerfile and confirm SDK plan-mode runs read-only in Lambda base"
```

---

## Task 2: Make file logging non-fatal (`log.ts`)

`runQa` calls `logQuery` on the **success path** (`run.ts:238`) and again for refusals (`run.ts:240`). `appendJsonl` (`log.ts`) calls `mkdirSync` + `appendFileSync` with no error handling, so on a read-only filesystem a perfectly good answer becomes an uncaught throw. Fixing it in `log.ts` rather than in the handler is the right layer: a log write should never be able to destroy an answer for the CLI either.

**Files:**
- Modify: `strata-qa/src/log.ts`
- Test: `strata-qa/src/log.test.ts`

**Interfaces:**
- Produces: `appendJsonl(file, record): void` — unchanged signature, now swallowing (and reporting to stderr) filesystem errors.

- [ ] **Step 1: Write the failing test**

Append to `strata-qa/src/log.test.ts`:

```ts
  test("a filesystem failure never throws and never touches stdout", () => {
    // A path whose parent is a FILE, not a directory: mkdirSync throws ENOTDIR.
    const dir = mkdtempSync(join(tmpdir(), "strata-qa-log-"));
    const blocker = join(dir, "blocker");
    writeFileSync(blocker, "not a directory");
    const errors: string[] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((m) => {
      errors.push(String(m));
    });
    try {
      expect(() => appendJsonl(join(blocker, "queries.jsonl"), { a: 1 })).not.toThrow();
    } finally {
      spy.mockRestore();
    }
    expect(errors.join("\n")).toMatch(/log write failed/i);
  });
```

Update the imports at the top of the file to `import { describe, expect, test, vi } from "vitest";` and `import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";`.

- [ ] **Step 2: Run test to verify it fails**

Run (from `strata-qa/`): `npm test -- log`
Expected: FAIL — the call throws `ENOTDIR`.

- [ ] **Step 3: Write minimal implementation**

```ts
// strata-qa/src/log.ts
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

// Logging is observability, never correctness: a failed log write must not be
// able to destroy an answer the caller already paid for. This matters most on
// Lambda, where everything outside /tmp is read-only and runQa logs on its
// success path (run.ts:238) — an unguarded throw there turns a good answer into
// a 500. Report to stderr (never stdout: the CLI's contract is one JSON object
// on stdout) and continue.
export function appendJsonl(file: string, record: unknown): void {
  try {
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, JSON.stringify(record) + "\n", "utf8");
  } catch (e) {
    console.error(`log write failed (${file}): ${String(e)}`);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `strata-qa/`): `npm test -- log`
Expected: PASS, including the pre-existing happy-path test.

- [ ] **Step 5: Confirm no regressions**

Run (from `strata-qa/`): `npm test`
Expected: entire suite PASS. `run.test.ts` asserts on logging behavior in places — if any test depended on `appendJsonl` throwing, that expectation was wrong and should be updated, not the implementation.

- [ ] **Step 6: Commit**

```bash
git add strata-qa/src/log.ts strata-qa/src/log.test.ts
git commit -m "Make JSONL log writes non-fatal

A failed log write could turn a successful answer into an error. On Lambda,
where everything outside /tmp is read-only and runQa logs on its success
path, that would have failed every good response."
```

---

## Task 3: Exit-code → HTTP mapping and the response envelope (`toHttpResponse`)

**Files:**
- Create: `strata-qa/src/lambda/handler.ts`
- Test: `strata-qa/src/lambda/handler.test.ts`

**Interfaces:**
- Consumes: `EXIT`, `RunOutcome`, `QaResult` from `../run.js`.
- Produces:
  - `interface LambdaResponse { statusCode: number; headers: Record<string, string>; body: string }`
  - `const EXIT_TO_HTTP: Record<number, number>`
  - `function toHttpResponse(outcome: RunOutcome, requestId: string): LambdaResponse`
  - `function errorResponse(statusCode: number, message: string, requestId: string): LambdaResponse`

The envelope is load-bearing. `errorMessage` lives on `RunOutcome`, not on `QaResult` (`run.ts:44-48`), so returning `QaResult` alone would make every failure an opaque `{"status":"error","answer":null}` — a 502 that cannot distinguish an unreachable model from unparseable output. `requestId` is echoed on every response so a caller can correlate with CloudWatch.

- [ ] **Step 1: Write the failing test**

```ts
// strata-qa/src/lambda/handler.test.ts
import { describe, expect, test } from "vitest";
import { EXIT, type RunOutcome } from "../run.js";
import { errorResponse, toHttpResponse } from "./handler.js";

function outcome(exitCode: number, status: string, errorMessage?: string): RunOutcome {
  return {
    result: {
      schema_version: 1,
      status: status as RunOutcome["result"]["status"],
      answer: status === "answered" ? "A." : null,
      sources: [],
      grounding: { citationsTotal: 0, citationsResolved: 0, quotesVerified: 0, distinctDocs: 0, docsCited: 0 },
      model: "m",
      docsVersion: "v",
      usage: null,
      durationMs: null,
    },
    exitCode,
    errorMessage,
  };
}

describe("toHttpResponse", () => {
  test("answered -> 200 with result body", () => {
    const r = toHttpResponse(outcome(EXIT.OK, "answered"), "rid");
    expect(r.statusCode).toBe(200);
    expect(r.headers["content-type"]).toBe("application/json");
    const body = JSON.parse(r.body);
    expect(body.status).toBe("answered");
    expect(body.requestId).toBe("rid");
    expect(body.error).toBeUndefined();
  });

  test("refusal -> 200", () => {
    expect(toHttpResponse(outcome(EXIT.OK, "no_match"), "rid").statusCode).toBe(200);
  });

  test.each([
    [EXIT.AUTH, 500],
    [EXIT.DOCS, 500],
    [EXIT.LOCKDOWN, 500],
    [EXIT.MODEL, 502],
    [EXIT.PARSE, 502],
    [EXIT.TRANSPORT, 502],
    [EXIT.TIMEOUT, 504],
  ])("exit %i -> http %i", (exit, http) => {
    expect(toHttpResponse(outcome(exit, "error", "boom"), "rid").statusCode).toBe(http);
  });

  test("unknown exit code falls back to 500", () => {
    expect(toHttpResponse(outcome(99, "error", "?"), "rid").statusCode).toBe(500);
  });

  test("error body carries errorMessage and requestId", () => {
    const body = JSON.parse(toHttpResponse(outcome(EXIT.TIMEOUT, "error", "timed out"), "rid").body);
    expect(body.error).toBe("timed out");
    expect(body.requestId).toBe("rid");
  });
});

describe("errorResponse", () => {
  test("carries status, message, and requestId without a QaResult", () => {
    const r = errorResponse(400, "'question' is required", "rid");
    expect(r.statusCode).toBe(400);
    expect(JSON.parse(r.body)).toEqual({ error: "'question' is required", requestId: "rid" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `strata-qa/`): `npm test -- lambda`
Expected: FAIL — `Failed to resolve import "./handler.js"`.

- [ ] **Step 3: Write minimal implementation**

```ts
// strata-qa/src/lambda/handler.ts
import { EXIT, type QaResult, type RunOutcome } from "../run.js";

export interface LambdaResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

export const JSON_HEADERS: Record<string, string> = { "content-type": "application/json" };

// Server misconfiguration (auth/docs/lockdown) -> 500; upstream model
// interaction (model/parse/transport) -> 502; wall-clock cutoff -> 504.
// EXIT.LOCKDOWN is unreachable at runtime — supportsReadOnlyLockdown()
// (agent.ts:131) is a compile-time tautology — but is mapped for completeness.
export const EXIT_TO_HTTP: Record<number, number> = {
  [EXIT.OK]: 200,
  [EXIT.AUTH]: 500,
  [EXIT.DOCS]: 500,
  [EXIT.LOCKDOWN]: 500,
  [EXIT.MODEL]: 502,
  [EXIT.PARSE]: 502,
  [EXIT.TRANSPORT]: 502,
  [EXIT.TIMEOUT]: 504,
};

export function errorResponse(statusCode: number, message: string, requestId: string): LambdaResponse {
  return { statusCode, headers: JSON_HEADERS, body: JSON.stringify({ error: message, requestId }) };
}

// errorMessage lives on RunOutcome, not QaResult (run.ts:44-48), so returning
// the bare QaResult would make every failure an opaque {"status":"error"} with
// no way to tell an unreachable model from unparseable output. Never include a
// stack — this body is caller-visible.
export function toHttpResponse(outcome: RunOutcome, requestId: string): LambdaResponse {
  const statusCode = EXIT_TO_HTTP[outcome.exitCode] ?? 500;
  const body: QaResult & { error?: string; requestId: string } = { ...outcome.result, requestId };
  if (outcome.errorMessage) body.error = outcome.errorMessage;
  return { statusCode, headers: JSON_HEADERS, body: JSON.stringify(body) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `strata-qa/`): `npm test -- lambda`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add strata-qa/src/lambda/handler.ts strata-qa/src/lambda/handler.test.ts
git commit -m "Add exit-code to HTTP status mapping for Lambda handler"
```

---

## Task 4: Request validation (`parseJob`)

The request body is a **job envelope**, not a bare question: `requestId` and the reserved `replyTo` are what the async Slack dispatcher needs, so the shape does not change when it lands. `replyTo` is accepted and ignored in this slice.

Validation is a cost control as much as a correctness one: at ~190k tokens per question (`NOTES.md`), an unbounded question and a caller-chosen model are both spend vectors on a network-reachable endpoint.

**Files:**
- Modify: `strata-qa/src/lambda/handler.ts`
- Test: `strata-qa/src/lambda/handler.test.ts`

**Interfaces:**
- Produces:
  - `interface FunctionUrlEvent { body?: string | null; isBase64Encoded?: boolean; requestContext?: { http?: { method?: string } } }`
  - `interface QaJob { question: string; model?: string; requestId?: string; replyTo?: string }`
  - `class BadRequestError extends Error { constructor(message: string, readonly statusCode?: number) }`
  - `const MAX_QUESTION_CHARS = 2000`
  - `function parseJob(event: FunctionUrlEvent, allowedModels: readonly string[]): QaJob`

- [ ] **Step 1: Write the failing test**

Append to `strata-qa/src/lambda/handler.test.ts`:

```ts
import { BadRequestError, MAX_QUESTION_CHARS, parseJob, type FunctionUrlEvent } from "./handler.js";

const ALLOWED = ["gpt-5.6-luna", "claude-sonnet-5"] as const;
const post = (body: string | null | undefined, extra: Partial<FunctionUrlEvent> = {}): FunctionUrlEvent => ({
  body,
  requestContext: { http: { method: "POST" } },
  ...extra,
});

describe("parseJob", () => {
  test("parses a minimal job", () => {
    expect(parseJob(post(JSON.stringify({ question: "how?" })), ALLOWED)).toEqual({
      question: "how?",
      model: undefined,
      requestId: undefined,
      replyTo: undefined,
    });
  });

  test("parses the full envelope", () => {
    const job = parseJob(
      post(JSON.stringify({ question: "q", model: "claude-sonnet-5", requestId: "r1", replyTo: "https://x" })),
      ALLOWED,
    );
    expect(job).toEqual({ question: "q", model: "claude-sonnet-5", requestId: "r1", replyTo: "https://x" });
  });

  test("decodes a base64 body", () => {
    const b64 = Buffer.from(JSON.stringify({ question: "hi" })).toString("base64");
    expect(parseJob(post(b64, { isBase64Encoded: true }), ALLOWED).question).toBe("hi");
  });

  test("a missing requestContext is treated as POST (RIE sends bare events)", () => {
    expect(parseJob({ body: JSON.stringify({ question: "q" }) }, ALLOWED).question).toBe("q");
  });

  test("non-POST -> 405", () => {
    const event = { body: "{}", requestContext: { http: { method: "GET" } } };
    expect(() => parseJob(event, ALLOWED)).toThrow(BadRequestError);
    try {
      parseJob(event, ALLOWED);
    } catch (e) {
      expect((e as BadRequestError).statusCode).toBe(405);
    }
  });

  test.each([
    ["empty body", post(undefined)],
    ["blank body", post("   ")],
    ["not json", post("not json")],
    ["json array", post("[]")],
    ["missing question", post(JSON.stringify({}))],
    ["blank question", post(JSON.stringify({ question: "  " }))],
    ["non-string question", post(JSON.stringify({ question: 123 }))],
    ["oversized question", post(JSON.stringify({ question: "x".repeat(MAX_QUESTION_CHARS + 1) }))],
    ["non-string model", post(JSON.stringify({ question: "q", model: 5 }))],
    ["model off the allowlist", post(JSON.stringify({ question: "q", model: "gpt-4-turbo" }))],
    ["non-string requestId", post(JSON.stringify({ question: "q", requestId: 7 }))],
  ])("rejects %s", (_label, event) => {
    expect(() => parseJob(event as FunctionUrlEvent, ALLOWED)).toThrow(BadRequestError);
  });

  test("a question exactly at the cap is accepted", () => {
    const q = "x".repeat(MAX_QUESTION_CHARS);
    expect(parseJob(post(JSON.stringify({ question: q })), ALLOWED).question).toBe(q);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `strata-qa/`): `npm test -- lambda`
Expected: FAIL — `parseJob` is not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `strata-qa/src/lambda/handler.ts`:

```ts
export interface FunctionUrlEvent {
  body?: string | null;
  isBase64Encoded?: boolean;
  requestContext?: { http?: { method?: string } };
}

export interface QaJob {
  question: string;
  model?: string;
  requestId?: string;
  replyTo?: string;
}

export class BadRequestError extends Error {
  constructor(
    message: string,
    readonly statusCode: number = 400,
  ) {
    super(message);
    this.name = "BadRequestError";
  }
}

// Token spend is the cost driver (~190k tokens/question per NOTES.md) and a
// longer question buys nothing, so cap it rather than pay for an essay.
export const MAX_QUESTION_CHARS = 2000;

export function parseJob(event: FunctionUrlEvent, allowedModels: readonly string[]): QaJob {
  // The Runtime Interface Emulator and direct `lambda invoke` send bare events
  // with no requestContext; only reject a method that is present and not POST.
  const method = event.requestContext?.http?.method;
  if (method !== undefined && method.toUpperCase() !== "POST") {
    throw new BadRequestError(`method ${method} not allowed; use POST`, 405);
  }

  const raw = event.body ?? "";
  const text = event.isBase64Encoded ? Buffer.from(raw, "base64").toString("utf8") : raw;
  if (!text.trim()) throw new BadRequestError("request body is empty");

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new BadRequestError("request body is not valid JSON");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new BadRequestError("request body must be a JSON object");
  }

  const { question, model, requestId, replyTo } = parsed as Record<string, unknown>;
  if (typeof question !== "string" || question.trim() === "") {
    throw new BadRequestError("'question' is required and must be a non-empty string");
  }
  if (question.length > MAX_QUESTION_CHARS) {
    throw new BadRequestError(`'question' exceeds ${MAX_QUESTION_CHARS} characters`);
  }
  if (model !== undefined) {
    if (typeof model !== "string") throw new BadRequestError("'model' must be a string");
    // A caller-chosen model is a spend vector; allow only what the operator configured.
    if (!allowedModels.includes(model)) {
      throw new BadRequestError(`'model' must be one of: ${allowedModels.join(", ")}`);
    }
  }
  for (const [name, value] of [
    ["requestId", requestId],
    ["replyTo", replyTo],
  ] as const) {
    if (value !== undefined && typeof value !== "string") {
      throw new BadRequestError(`'${name}' must be a string`);
    }
  }

  return {
    question,
    model: model as string | undefined,
    requestId: requestId as string | undefined,
    // Reserved for the async Slack dispatcher; accepted and ignored in this slice.
    replyTo: replyTo as string | undefined,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `strata-qa/`): `npm test -- lambda`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add strata-qa/src/lambda/handler.ts strata-qa/src/lambda/handler.test.ts
git commit -m "Add request validation for the Lambda job envelope"
```

---

## Task 5: The HTTP-free core (`handleQuestion`)

`core.ts` is the seam the future Slack dispatcher calls. Slack requires a slash command to be acknowledged within **3 seconds** and even fast questions take 9–14s (`NOTES.md`), so the Slack pass *cannot* reuse a synchronous HTTP endpoint — it will ACK, then call `handleQuestion` on the async side. Keeping this module free of HTTP types is what makes that a no-op change.

**Files:**
- Create: `strata-qa/src/lambda/core.ts`
- Test: `strata-qa/src/lambda/core.test.ts`

**Interfaces:**
- Consumes: `runQa`, `RunOutcome` from `../run.js`; `AgentSeam` from `../agent.js`; `QaJob` from `./handler.js`.
- Produces:
  - `interface QaConfig { docsRoot: string; timeoutMs: number; defaultModel: string; logDir: string; allowedModels: readonly string[] }`
  - `async function handleQuestion(job: QaJob, seam: AgentSeam, config: QaConfig, emit?: (line: string) => void): Promise<RunOutcome>`

- [ ] **Step 1: Write the failing test**

```ts
// strata-qa/src/lambda/core.test.ts
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import type { AgentRun, AgentSeam } from "../agent.js";
import { TimeoutError } from "../agent.js";
import { EXIT } from "../run.js";
import { handleQuestion, type QaConfig } from "./core.js";

export function makeDocsRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "strata-qa-lambda-"));
  mkdirSync(join(root, "docs", "sources", "s"), { recursive: true });
  writeFileSync(
    join(root, "docs", "graph.json"),
    JSON.stringify({ nodes: [{ id: "a", path: "sources/s/d.md" }], edges: [] }),
  );
  writeFileSync(join(root, "docs", "INDEX.md"), "# i\n");
  writeFileSync(join(root, "docs", "sources", "s", "d.md"), "---\nverified: ok\n---\nAlpha beta gamma.\n");
  return root;
}

const BLOCK =
  "```json\n" +
  JSON.stringify({
    status: "answered",
    answer: "Alpha.",
    citations: [{ path: "sources/s/d.md", quote: "Alpha beta" }],
  }) +
  "\n```";

function finished(text: string): AgentRun {
  return { ok: true, text, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, durationMs: 5 };
}

export function fakeSeam(overrides: Partial<AgentSeam> = {}): AgentSeam {
  return {
    checkAuth: async () => true,
    listModelIds: async () => ["gpt-5.6-luna", "claude-sonnet-5"],
    supportsReadOnlyLockdown: () => true,
    ask: async () => finished(BLOCK),
    reformat: async () => finished(BLOCK),
    ...overrides,
  };
}

export function cfg(root: string): QaConfig {
  return {
    docsRoot: root,
    timeoutMs: 60_000,
    defaultModel: "gpt-5.6-luna",
    logDir: join(root, "logs"),
    allowedModels: ["gpt-5.6-luna", "claude-sonnet-5"],
  };
}

describe("handleQuestion", () => {
  test("answers and returns EXIT.OK", async () => {
    const root = makeDocsRoot();
    const outcome = await handleQuestion({ question: "what is alpha?" }, fakeSeam(), cfg(root));
    expect(outcome.exitCode).toBe(EXIT.OK);
    expect(outcome.result.status).toBe("answered");
  });

  test("falls back to the default model when the job omits one", async () => {
    const root = makeDocsRoot();
    let seen = "";
    const seam = fakeSeam({
      ask: async (_p, model) => {
        seen = model;
        return finished(BLOCK);
      },
    });
    await handleQuestion({ question: "q" }, seam, cfg(root));
    expect(seen).toBe("gpt-5.6-luna");
  });

  test("honours a job-supplied model", async () => {
    const root = makeDocsRoot();
    let seen = "";
    const seam = fakeSeam({
      ask: async (_p, model) => {
        seen = model;
        return finished(BLOCK);
      },
    });
    await handleQuestion({ question: "q", model: "claude-sonnet-5" }, seam, cfg(root));
    expect(seen).toBe("claude-sonnet-5");
  });

  test("maps an agent timeout to EXIT.TIMEOUT", async () => {
    const root = makeDocsRoot();
    const seam = fakeSeam({
      ask: async () => {
        throw new TimeoutError(90_000);
      },
    });
    const outcome = await handleQuestion({ question: "q" }, seam, cfg(root));
    expect(outcome.exitCode).toBe(EXIT.TIMEOUT);
  });

  test("emits one structured log line carrying the requestId", async () => {
    const root = makeDocsRoot();
    const lines: string[] = [];
    await handleQuestion({ question: "q", requestId: "r1" }, fakeSeam(), cfg(root), (l) => lines.push(l));
    expect(lines).toHaveLength(1);
    const record = JSON.parse(lines[0]);
    expect(record.requestId).toBe("r1");
    expect(record.status).toBe("answered");
    expect(record.exitCode).toBe(EXIT.OK);
    // The question is the caller's text; log it truncated, never the answer body.
    expect(record.answer).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `strata-qa/`): `npm test -- lambda`
Expected: FAIL — `Failed to resolve import "./core.js"`.

- [ ] **Step 3: Write minimal implementation**

```ts
// strata-qa/src/lambda/core.ts
import type { AgentSeam } from "../agent.js";
import { runQa, type RunOutcome } from "../run.js";
import type { QaJob } from "./handler.js";

export interface QaConfig {
  docsRoot: string;
  timeoutMs: number;
  defaultModel: string;
  logDir: string;
  allowedModels: readonly string[];
}

const LOGGED_QUESTION_CHARS = 200;

// The HTTP-free seam. The future Slack dispatcher must ACK within 3s and
// therefore cannot reuse a synchronous endpoint — it will ACK, then call this
// on the async side. Keeping HTTP types out of this module is what makes that
// a no-op change here.
export async function handleQuestion(
  job: QaJob,
  seam: AgentSeam,
  config: QaConfig,
  emit: (line: string) => void = (l) => console.log(l),
): Promise<RunOutcome> {
  const outcome = await runQa(
    {
      question: job.question,
      model: job.model ?? config.defaultModel,
      docsRoot: config.docsRoot,
      timeoutMs: config.timeoutMs,
      logDir: config.logDir,
    },
    seam,
  );

  // CloudWatch is the queryable log on Lambda; the JSONL files runQa writes go
  // to /tmp and never leave the container. Deliberately omits the answer body:
  // one line per invocation, greppable in Logs Insights.
  emit(
    JSON.stringify({
      ts: new Date().toISOString(),
      requestId: job.requestId,
      question: job.question.slice(0, LOGGED_QUESTION_CHARS),
      model: outcome.result.model,
      status: outcome.result.status,
      exitCode: outcome.exitCode,
      error: outcome.errorMessage,
      grounding: outcome.result.grounding,
      sources: outcome.result.sources.map((s) => s.path),
      docsVersion: outcome.result.docsVersion,
      durationMs: outcome.result.durationMs,
      usage: outcome.result.usage,
      gitSha: process.env.STRATA_QA_GIT_SHA,
    }),
  );

  return outcome;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `strata-qa/`): `npm test -- lambda`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add strata-qa/src/lambda/core.ts strata-qa/src/lambda/core.test.ts
git commit -m "Add the HTTP-free handleQuestion seam for the Lambda handler"
```

---

## Task 6: Handler wiring — config, secret loading, recycle, entry point

**Files:**
- Modify: `strata-qa/src/lambda/handler.ts`
- Modify: `strata-qa/package.json` (add `@aws-sdk/client-secrets-manager`)
- Test: `strata-qa/src/lambda/handler.test.ts`

**Interfaces:**
- Consumes: `EXIT` from `../run.js`; `AgentSeam`, `createCursorSeam` from `../agent.js`; `DEFAULT_MODEL` from `../cli.js`; `handleQuestion`, `QaConfig` from `./core.js`.
- Produces:
  - `function loadConfig(env: NodeJS.ProcessEnv): QaConfig`
  - `type SecretFetcher = (secretId: string) => Promise<string>`
  - `interface KeyLoader { ensure(): Promise<void>; invalidate(): void }`
  - `function createKeyLoader(env: NodeJS.ProcessEnv, fetchSecret: SecretFetcher): KeyLoader`
  - `async function handleEvent(event, seam, config, keys, deps?): Promise<LambdaResponse>`
  - `async function handler(event: FunctionUrlEvent): Promise<LambdaResponse>` (Lambda entry)

Three things here are not obvious and each has a comment in the implementation:

1. **Secret invalidation.** Caching for the life of a warm container means a rotated key bricks every warm container until it recycles. On an `AUTH` outcome the loader drops the cached value, re-fetches once, and the handler retries; a second `AUTH` returns 500.
2. **How the key reaches the SDK.** `agent.ts:101` reads `process.env.CURSOR_API_KEY` at call time, so the handler must assign the fetched secret into `process.env` before calling `runQa`. Ugly but real; replacing it with an `apiKey` on `RunOptions` is explicitly out of scope for this slice.
3. **The recycle.** See the block comment below — it is the mitigation for the uncancellable agent, and Task 7 is its gate.

- [ ] **Step 1: Add the AWS SDK dependency**

Run (from `strata-qa/`): `npm install @aws-sdk/client-secrets-manager`
Expected: `package.json` gains it under `dependencies`; `package-lock.json` updates. Confirm `@cursor/sdk` is still pinned to exactly `"1.0.24"` (no caret) afterwards.

- [ ] **Step 2: Write the failing test**

Append to `strata-qa/src/lambda/handler.test.ts`. Reuse the fixtures from `core.test.ts`:

```ts
import { EXIT } from "../run.js";
import { cfg, fakeSeam, makeDocsRoot } from "./core.test.js";
import { createKeyLoader, handleEvent, handler, loadConfig } from "./handler.js";

const silent = () => {};

describe("loadConfig", () => {
  test("defaults when env is empty", () => {
    const c = loadConfig({} as NodeJS.ProcessEnv);
    expect(c.timeoutMs).toBe(90_000);
    expect(c.logDir).toBe("/tmp/qa");
    expect(c.defaultModel).toBe("gpt-5.6-luna");
    expect(c.allowedModels).toEqual(["gpt-5.6-luna"]);
  });

  test("reads overrides from env", () => {
    const c = loadConfig({
      DOCS_ROOT: "/var/task",
      AGENT_TIMEOUT_MS: "45000",
      QA_MODEL: "claude-sonnet-5",
      QA_ALLOWED_MODELS: "claude-sonnet-5, gpt-5.6-luna",
    } as NodeJS.ProcessEnv);
    expect(c.docsRoot).toBe("/var/task");
    expect(c.timeoutMs).toBe(45_000);
    expect(c.defaultModel).toBe("claude-sonnet-5");
    expect(c.allowedModels).toEqual(["claude-sonnet-5", "gpt-5.6-luna"]);
  });

  test("the default model is always allowed", () => {
    const c = loadConfig({ QA_MODEL: "claude-sonnet-5", QA_ALLOWED_MODELS: "gpt-5.6-luna" } as NodeJS.ProcessEnv);
    expect(c.allowedModels).toContain("claude-sonnet-5");
  });

  test("a non-numeric timeout falls back to the default rather than NaN", () => {
    expect(loadConfig({ AGENT_TIMEOUT_MS: "soon" } as NodeJS.ProcessEnv).timeoutMs).toBe(90_000);
  });
});

describe("createKeyLoader", () => {
  test("an env key already present is never fetched", async () => {
    let calls = 0;
    const loader = createKeyLoader({ CURSOR_API_KEY: "abc" } as NodeJS.ProcessEnv, async () => {
      calls += 1;
      return "x";
    });
    await loader.ensure();
    expect(calls).toBe(0);
  });

  test("fetches once and caches across calls", async () => {
    const env = { CURSOR_API_KEY_SECRET_ID: "sid" } as unknown as NodeJS.ProcessEnv;
    let calls = 0;
    const loader = createKeyLoader(env, async (id) => {
      expect(id).toBe("sid");
      calls += 1;
      return "fetched-key";
    });
    await loader.ensure();
    await loader.ensure();
    expect(env.CURSOR_API_KEY).toBe("fetched-key");
    expect(calls).toBe(1);
  });

  test("invalidate forces a re-fetch (rotated key)", async () => {
    const env = { CURSOR_API_KEY_SECRET_ID: "sid" } as unknown as NodeJS.ProcessEnv;
    const keys = ["old", "new"];
    const loader = createKeyLoader(env, async () => keys.shift()!);
    await loader.ensure();
    expect(env.CURSOR_API_KEY).toBe("old");
    loader.invalidate();
    await loader.ensure();
    expect(env.CURSOR_API_KEY).toBe("new");
  });

  test("no key and no secret id leaves the env unset for runQa to fail loud", async () => {
    const env = {} as NodeJS.ProcessEnv;
    await createKeyLoader(env, async () => "x").ensure();
    expect(env.CURSOR_API_KEY).toBeUndefined();
  });
});

describe("handleEvent", () => {
  const noKeys = { ensure: async () => {}, invalidate: () => {} };

  test("a bad request never reaches runQa", async () => {
    const root = makeDocsRoot();
    let asked = false;
    const seam = fakeSeam({
      ask: async () => {
        asked = true;
        throw new Error("should not run");
      },
    });
    const r = await handleEvent({ body: "{}" }, seam, cfg(root), noKeys, { emit: silent });
    expect(r.statusCode).toBe(400);
    expect(JSON.parse(r.body).error).toMatch(/question/i);
    expect(asked).toBe(false);
  });

  test("a non-POST method -> 405", async () => {
    const root = makeDocsRoot();
    const event = { body: "{}", requestContext: { http: { method: "GET" } } };
    expect((await handleEvent(event, fakeSeam(), cfg(root), noKeys, { emit: silent })).statusCode).toBe(405);
  });

  test("answered -> 200", async () => {
    const root = makeDocsRoot();
    const r = await handleEvent(
      { body: JSON.stringify({ question: "what is alpha?" }) },
      fakeSeam(),
      cfg(root),
      noKeys,
      { emit: silent },
    );
    expect(r.statusCode).toBe(200);
    expect(JSON.parse(r.body).status).toBe("answered");
  });

  test("generates a requestId when the job omits one", async () => {
    const root = makeDocsRoot();
    const r = await handleEvent({ body: JSON.stringify({ question: "q" }) }, fakeSeam(), cfg(root), noKeys, {
      emit: silent,
    });
    expect(JSON.parse(r.body).requestId).toMatch(/[0-9a-f-]{36}/);
  });

  test("echoes a caller-supplied requestId, including on a 400", async () => {
    const root = makeDocsRoot();
    const r = await handleEvent({ body: JSON.stringify({ requestId: "r1" }) }, fakeSeam(), cfg(root), noKeys, {
      emit: silent,
    });
    expect(r.statusCode).toBe(400);
    expect(JSON.parse(r.body).requestId).toBe("r1");
  });

  test("an AUTH failure invalidates the key and retries once", async () => {
    const root = makeDocsRoot();
    let invalidated = 0;
    let attempts = 0;
    const keys = {
      ensure: async () => {},
      invalidate: () => {
        invalidated += 1;
      },
    };
    const seam = fakeSeam({
      checkAuth: async () => {
        attempts += 1;
        return attempts > 1; // first attempt fails auth, second succeeds
      },
    });
    const r = await handleEvent({ body: JSON.stringify({ question: "q" }) }, seam, cfg(root), keys, { emit: silent });
    expect(invalidated).toBe(1);
    expect(attempts).toBe(2);
    expect(r.statusCode).toBe(200);
  });

  test("a second AUTH failure gives up with 500", async () => {
    const root = makeDocsRoot();
    const seam = fakeSeam({ checkAuth: async () => false });
    const r = await handleEvent({ body: JSON.stringify({ question: "q" }) }, seam, cfg(root), noKeys, {
      emit: silent,
    });
    expect(r.statusCode).toBe(500);
  });

  test("a timeout returns 504 and schedules a container recycle", async () => {
    const root = makeDocsRoot();
    let recycled = 0;
    const seam = fakeSeam({
      ask: async () => {
        const { TimeoutError } = await import("../agent.js");
        throw new TimeoutError(90_000);
      },
    });
    const r = await handleEvent({ body: JSON.stringify({ question: "q" }) }, seam, cfg(root), noKeys, {
      emit: silent,
      recycle: () => {
        recycled += 1;
      },
    });
    expect(r.statusCode).toBe(504);
    expect(recycled).toBe(1);
  });

  test("a successful invocation never recycles", async () => {
    const root = makeDocsRoot();
    let recycled = 0;
    await handleEvent({ body: JSON.stringify({ question: "q" }) }, fakeSeam(), cfg(root), noKeys, {
      emit: silent,
      recycle: () => {
        recycled += 1;
      },
    });
    expect(recycled).toBe(0);
  });

  test("an unexpected throw becomes a 500 with no stack", async () => {
    const root = makeDocsRoot();
    const seam = fakeSeam({
      listModelIds: async () => {
        throw Object.assign(new Error("kaboom"), { stack: "SECRET STACK LINE" });
      },
    });
    const r = await handleEvent({ body: JSON.stringify({ question: "q" }) }, seam, cfg(root), noKeys, {
      emit: silent,
    });
    expect(r.body).not.toContain("SECRET STACK LINE");
  });
});

describe("handler", () => {
  test("is exported as a function for the RIC to resolve", () => {
    expect(typeof handler).toBe("function");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run (from `strata-qa/`): `npm test -- lambda`
Expected: FAIL — `loadConfig`/`createKeyLoader`/`handleEvent` not exported.

- [ ] **Step 4: Write minimal implementation**

Append to `strata-qa/src/lambda/handler.ts`:

```ts
import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { randomUUID } from "node:crypto";
import { createCursorSeam, type AgentSeam } from "../agent.js";
import { DEFAULT_MODEL } from "../cli.js";
import { handleQuestion, type QaConfig } from "./core.js";

const DEFAULT_TIMEOUT_MS = 90_000;

export function loadConfig(env: NodeJS.ProcessEnv): QaConfig {
  const defaultModel = env.QA_MODEL ?? DEFAULT_MODEL;
  const configured = (env.QA_ALLOWED_MODELS ?? "")
    .split(",")
    .map((m) => m.trim())
    .filter((m) => m !== "");
  const timeoutMs = Number(env.AGENT_TIMEOUT_MS);
  return {
    docsRoot: env.DOCS_ROOT ?? process.cwd(),
    // A bad env value must not become NaN and disable the timeout entirely —
    // the wall-clock bound is the only thing standing between an ambiguous
    // question and a 33-minute agentic loop (NOTES.md).
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS,
    defaultModel,
    // Lambda's filesystem is read-only except /tmp; runQa's JSONL MUST land there.
    logDir: env.QA_LOG_DIR ?? "/tmp/qa",
    // A caller-chosen model is a spend vector. The default is always permitted.
    allowedModels: configured.includes(defaultModel) ? configured : [defaultModel, ...configured],
  };
}

export type SecretFetcher = (secretId: string) => Promise<string>;

export interface KeyLoader {
  ensure(): Promise<void>;
  invalidate(): void;
}

// Populates process.env.CURSOR_API_KEY, because the unchanged createCursorSeam()
// reads that env var at ask() time (agent.ts:101) rather than taking the key as
// an argument. Threading apiKey through RunOptions is the cleaner fix and is
// out of scope for this slice.
//
// invalidate() exists for key rotation: caching for the life of a warm container
// would otherwise brick every warm container until it recycles.
export function createKeyLoader(env: NodeJS.ProcessEnv, fetchSecret: SecretFetcher): KeyLoader {
  let pending: Promise<void> | null = null;
  return {
    async ensure(): Promise<void> {
      if (env.CURSOR_API_KEY && env.CURSOR_API_KEY.trim() !== "") return;
      const secretId = env.CURSOR_API_KEY_SECRET_ID;
      // Neither a key nor a secret id: leave it unset and let runQa's preflight
      // fail loud with EXIT.AUTH rather than guessing.
      if (!secretId) return;
      pending ??= fetchSecret(secretId).then((key) => {
        env.CURSOR_API_KEY = key;
      });
      try {
        await pending;
      } catch (e) {
        pending = null; // a failed fetch must not be cached
        throw e;
      }
    },
    invalidate(): void {
      pending = null;
      delete env.CURSOR_API_KEY;
    },
  };
}

export interface HandleEventDeps {
  emit?: (line: string) => void;
  recycle?: () => void;
}

export async function handleEvent(
  event: FunctionUrlEvent,
  seam: AgentSeam,
  config: QaConfig,
  keys: KeyLoader,
  deps: HandleEventDeps = {},
): Promise<LambdaResponse> {
  const { emit, recycle = scheduleRecycle } = deps;

  // Parse before generating an id so a caller-supplied requestId is echoed even
  // on a 400; fall back to a generated one when the body never parsed.
  let job: QaJob;
  let requestId = randomUUID();
  try {
    job = parseJob(event, config.allowedModels);
    requestId = job.requestId ?? requestId;
    job = { ...job, requestId };
  } catch (e) {
    if (e instanceof BadRequestError) {
      const echoed = readRequestId(event) ?? requestId;
      return errorResponse(e.statusCode, e.message, echoed);
    }
    throw e;
  }

  try {
    await keys.ensure();
    let outcome = await handleQuestion(job, seam, config, emit);

    // A rotated key looks exactly like a bad key from here. Drop the cached
    // value and try once more before declaring an auth failure.
    if (outcome.exitCode === EXIT.AUTH) {
      keys.invalidate();
      await keys.ensure();
      outcome = await handleQuestion(job, seam, config, emit);
    }

    if (outcome.exitCode === EXIT.TIMEOUT) {
      poisoned = true;
      recycle();
    }
    return toHttpResponse(outcome, requestId);
  } catch (e) {
    // Backstop: a JSON error body, never a stack.
    const message = e instanceof Error ? e.message : String(e);
    return errorResponse(500, `internal error: ${message}`, requestId);
  }
}

// Best-effort echo of requestId when parseJob rejected the body.
function readRequestId(event: FunctionUrlEvent): string | undefined {
  try {
    const raw = event.body ?? "";
    const text = event.isBase64Encoded ? Buffer.from(raw, "base64").toString("utf8") : raw;
    const parsed: unknown = JSON.parse(text);
    const id = (parsed as { requestId?: unknown } | null)?.requestId;
    return typeof id === "string" ? id : undefined;
  } catch {
    return undefined;
  }
}

// --- Container recycle after a timeout -------------------------------------
//
// withTimeout (agent.ts:42-52) is a Promise.race: it rejects, but the underlying
// Agent.prompt keeps running. Its own comment assumes "the CLI exits immediately
// after, so the orphaned run is harmless" — FALSE on Lambda, which freezes the
// environment on return and thaws it for the next invocation. The orphaned agent
// (and its cursorsandbox child) would resume inside the NEXT request: stealing
// CPU, polluting that request's log stream, and still burning ~190k tokens on an
// answer nobody will read.
//
// So: poison the container and let Lambda replace it. This is a RACE — the Node
// runtime POSTs the handler result after the returned promise resolves, and the
// environment may freeze immediately after. Exit too eagerly and the 504 is lost;
// use a timer and it may instead fire on the next thaw. Hence both halves:
//   - a short delayed exit, intended to land after the response is flushed;
//   - a `poisoned` flag checked at the top of every invocation, so a container
//     that survived the exit refuses to serve work rather than serving degraded
//     work.
// Either way one invocation is lost per timeout. Timeouts are rare (NOTES.md:
// 9-14s typical), so that is the accepted cost.
//
// Task 7 is the gate. If the recycle proves unreliable there, switch to the
// documented fallback: fork a worker per invocation and SIGKILL it on timeout,
// which is true cancellation at the cost of a ~100ms spawn.
const RECYCLE_DELAY_MS = Number(process.env.RECYCLE_DELAY_MS ?? "250");
let poisoned = false;

function scheduleRecycle(): void {
  // unref so this never holds a local test process open; the Lambda RIC keeps
  // the loop alive on its own, so the timer still fires there.
  setTimeout(() => process.exit(1), RECYCLE_DELAY_MS).unref();
}

const secretsClient = new SecretsManagerClient({});

const fetchFromSecretsManager: SecretFetcher = async (secretId) => {
  const out = await secretsClient.send(new GetSecretValueCommand({ SecretId: secretId }));
  if (!out.SecretString) throw new Error(`secret ${secretId} has no SecretString`);
  return out.SecretString;
};

const keyLoader = createKeyLoader(process.env, fetchFromSecretsManager);

export async function handler(event: FunctionUrlEvent): Promise<LambdaResponse> {
  // The delayed exit did not win the race and the container thawed first. Refuse
  // rather than serve an invocation contaminated by an orphaned agent run.
  if (poisoned) process.exit(1);
  return handleEvent(event, createCursorSeam(), loadConfig(process.env), keyLoader);
}
```

Move the `import { EXIT, ... } from "../run.js";` line at the top of the file to also import `EXIT` if it is not already imported, and add `type QaJob` to the local declarations already present from Task 4.

- [ ] **Step 5: Run tests and the type build**

Run (from `strata-qa/`): `npm test -- lambda && npm run build`
Expected: all lambda tests PASS; `tsc` compiles clean and produces `dist/lambda/handler.js` and `dist/lambda/core.js`.

- [ ] **Step 6: Run the full suite to confirm no regressions**

Run (from `strata-qa/`): `npm test`
Expected: entire suite PASS.

- [ ] **Step 7: Commit**

```bash
git add strata-qa/src/lambda/handler.ts strata-qa/src/lambda/handler.test.ts strata-qa/package.json strata-qa/package-lock.json
git commit -m "Add Lambda handler wiring, secret loading, and post-timeout recycle"
```

---

## Task 7: Local container smoke — and the recycle gate (GATE 2)

**This task gates deployment.** Step 5 decides whether the direct-`runQa` design survives or flips to fork-a-worker.

**Files:**
- Modify: `strata-qa/Dockerfile` (only if the CMD path needs correcting)

**Interfaces:**
- Consumes: the built `strata-qa/dist/lambda/handler.js` exporting `handler`.
- Produces: an image verified end-to-end via the AWS Runtime Interface Emulator (bundled in the base image), including the freeze/thaw orphan behaviour.

- [ ] **Step 1: Confirm the handler CMD**

The Dockerfile ends with `CMD ["strata-qa/dist/lambda/handler.handler"]` (Task 1). The RIC resolves this as: load `strata-qa/dist/lambda/handler.js` relative to `LAMBDA_TASK_ROOT` (`/var/task`) and invoke its exported `handler`. Verify the compiled path matches (`docker run --rm --entrypoint ls <image> /var/task/strata-qa/dist/lambda`) and correct the CMD if not.

- [ ] **Step 2: Rebuild the image**

Run (from the **repo root**):

```bash
docker build -f strata-qa/Dockerfile --platform linux/arm64 \
  --build-arg GIT_SHA="$(git rev-parse HEAD)" \
  -t strata-qa-lambda:local .
```

- [ ] **Step 3: Run the image with the Runtime Interface Emulator**

```bash
docker run --rm -p 9000:8080 \
  --read-only --tmpfs /tmp \
  -e HOME=/tmp \
  -e CURSOR_API_KEY="$CURSOR_API_KEY" \
  --name strata-qa-rie \
  strata-qa-lambda:local
```

Leave it running; the base image's entrypoint starts the emulator on port 8080.

- [ ] **Step 4: Happy path and 400 path (second terminal)**

```bash
curl -s "http://localhost:9000/2015-03-31/functions/function/invocations" \
  -d '{"body": "{\"question\": \"What does the nava-platform CLI wrap to install templates?\"}"}'

curl -s "http://localhost:9000/2015-03-31/functions/function/invocations" -d '{"body": "{}"}'
```

Expected: first returns `"statusCode": 200` with a `body` string parsing to `{"status":"answered", ...}`; second returns `"statusCode": 400` with an error mentioning `question`. (The RIE wraps the handler's returned object; a Function URL returns `body` directly to the caller.) Confirm three things in the first response and in the container logs:

- `docsVersion` is a `sha256:` string, not a git SHA (expected — `.git` is not in the image; see Task 1 Step 2).
- `requestId` is present in the body.
- Exactly one structured JSON log line per invocation, carrying `gitSha`.
- **No `EROFS`** anywhere. If one appears, Task 2's fix is not in the image — rebuild.

- [ ] **Step 5: The orphan / recycle test (THE GATE)**

Force a timeout, then immediately invoke again, and watch whether the second invocation is clean.

```bash
# Restart the container with a timeout short enough to guarantee a cutoff.
docker rm -f strata-qa-rie 2>/dev/null || true
docker run --rm -p 9000:8080 --read-only --tmpfs /tmp \
  -e HOME=/tmp -e CURSOR_API_KEY="$CURSOR_API_KEY" \
  -e AGENT_TIMEOUT_MS=3000 \
  --name strata-qa-rie strata-qa-lambda:local

# Terminal 2 — invocation 1 must time out:
curl -s "http://localhost:9000/2015-03-31/functions/function/invocations" \
  -d '{"body": "{\"question\": \"How does the Strata SDK integrate with Salesforce?\", \"requestId\": \"first\"}"}'

# Invocation 2, immediately after:
curl -s "http://localhost:9000/2015-03-31/functions/function/invocations" \
  -d '{"body": "{\"question\": \"What attribute types does the Strata SDK provide?\", \"requestId\": \"second\"}"}'
```

Record all four:

1. Did invocation 1 return a complete `"statusCode": 504` body, or did the `process.exit(1)` cut the response off? **This is the race.**
2. Did the container process exit and restart between the two calls (`docker logs` shows the RIC reinitializing)?
3. Did invocation 2 succeed, and were its logs free of any `requestId: "first"` chatter from the orphaned run?
4. `du -sh /tmp` inside the container (`docker exec strata-qa-rie du -sh /tmp`) after ~10 invocations — `/tmp` persists in a warm container, so confirm it is not growing unboundedly toward the 1 GB limit.

**Gate decision:**

- All four clean → the direct-`runQa` design holds. Proceed to Task 8.
- The 504 is truncated or lost, or invocation 2 shows contamination → **stop and report**. Do not tune `RECYCLE_DELAY_MS` to paper over it; switch to the fork-a-worker fallback (fork a child running `handleQuestion`, `SIGKILL` on timeout) and re-run this step. That reverses the "call `runQa` directly" decision, so record it in the design doc before implementing.

- [ ] **Step 6: Commit (only if the Dockerfile changed)**

```bash
git add strata-qa/Dockerfile
git commit -m "Verify Lambda handler and post-timeout recycle via Runtime Interface Emulator"
```

If Step 1 confirmed the CMD was already correct and nothing changed, skip the commit and note that in the task record.

---

## Task 8: Deploy script (`deploy.sh`)

**Files:**
- Create: `strata-qa/deploy.sh`

**Interfaces:**
- Consumes: local AWS credentials (SigV4), Docker, the repo-root build context; env vars `AWS_REGION`, `CURSOR_API_KEY` (to seed the secret).
- Produces: an ECR repo, a Secrets Manager secret, an IAM execution role scoped to that one secret, the Lambda function from the image with **reserved concurrency**, and a Function URL with `AWS_IAM` auth. Prints the Function URL.

- [ ] **Step 1: Write `deploy.sh`**

```bash
#!/usr/bin/env bash
# Deploy strata-qa as a container-image Lambda with an IAM-authed Function URL.
# Prereqs: aws CLI v2, docker, and CURSOR_API_KEY exported (personal or
# service-account key). Run from the REPO ROOT — the image build context is the
# repo root, because the image needs both docs/ and strata-qa/.
set -euo pipefail

AWS_REGION="${AWS_REGION:-us-east-1}"
FUNCTION_NAME="${FUNCTION_NAME:-strata-qa}"
ECR_REPO="${ECR_REPO:-strata-qa-lambda}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
ARCH="${ARCH:-arm64}"                       # arm64 | x86_64
DOCKER_PLATFORM="linux/${ARCH/x86_64/amd64}"
MEMORY_MB="${MEMORY_MB:-2048}"
TIMEOUT_S="${TIMEOUT_S:-120}"
AGENT_TIMEOUT_MS="${AGENT_TIMEOUT_MS:-90000}"
# At ~190k tokens per question (NOTES.md), an endpoint with unreserved
# concurrency is an unbounded spend on the Cursor API -- and a 504 at 90s is
# exactly the response a client library retries. Cap it.
RESERVED_CONCURRENCY="${RESERVED_CONCURRENCY:-3}"
SECRET_NAME="${SECRET_NAME:-strata-qa/cursor-api-key}"
ROLE_NAME="${ROLE_NAME:-strata-qa-lambda-role}"

: "${CURSOR_API_KEY:?export CURSOR_API_KEY (personal or service-account key) before deploying}"

# The agent's own timeout must fire first, so the handler returns a clean 504
# rather than Lambda hard-killing the invocation mid-flight.
if (( AGENT_TIMEOUT_MS >= TIMEOUT_S * 1000 )); then
  echo "AGENT_TIMEOUT_MS (${AGENT_TIMEOUT_MS}) must be less than TIMEOUT_S (${TIMEOUT_S}s)" >&2
  exit 1
fi

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
ECR_URI="${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO}"
IMAGE_URI="${ECR_URI}:${IMAGE_TAG}"
GIT_SHA="$(git rev-parse HEAD)"

echo "==> ECR repo"
aws ecr describe-repositories --repository-names "$ECR_REPO" --region "$AWS_REGION" >/dev/null 2>&1 \
  || aws ecr create-repository --repository-name "$ECR_REPO" --region "$AWS_REGION" >/dev/null

echo "==> Secret"
if aws secretsmanager describe-secret --secret-id "$SECRET_NAME" --region "$AWS_REGION" >/dev/null 2>&1; then
  aws secretsmanager put-secret-value --secret-id "$SECRET_NAME" \
    --secret-string "$CURSOR_API_KEY" --region "$AWS_REGION" >/dev/null
else
  aws secretsmanager create-secret --name "$SECRET_NAME" \
    --secret-string "$CURSOR_API_KEY" --region "$AWS_REGION" >/dev/null
fi
SECRET_ARN="$(aws secretsmanager describe-secret --secret-id "$SECRET_NAME" \
  --region "$AWS_REGION" --query ARN --output text)"

echo "==> IAM execution role"
if ! aws iam get-role --role-name "$ROLE_NAME" >/dev/null 2>&1; then
  aws iam create-role --role-name "$ROLE_NAME" \
    --assume-role-policy-document '{
      "Version":"2012-10-17",
      "Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]
    }' >/dev/null
  aws iam attach-role-policy --role-name "$ROLE_NAME" \
    --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole >/dev/null
fi
# Read just this one secret, nothing else.
aws iam put-role-policy --role-name "$ROLE_NAME" --policy-name read-cursor-secret \
  --policy-document "{
    \"Version\":\"2012-10-17\",
    \"Statement\":[{\"Effect\":\"Allow\",\"Action\":\"secretsmanager:GetSecretValue\",\"Resource\":\"${SECRET_ARN}\"}]
  }" >/dev/null
ROLE_ARN="$(aws iam get-role --role-name "$ROLE_NAME" --query Role.Arn --output text)"

echo "==> Build & push image (${DOCKER_PLATFORM}, context = repo root)"
aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
docker build -f strata-qa/Dockerfile --platform "$DOCKER_PLATFORM" \
  --build-arg GIT_SHA="$GIT_SHA" -t "$IMAGE_URI" .
docker push "$IMAGE_URI"

ENV_VARS="Variables={HOME=/tmp,DOCS_ROOT=/var/task,QA_LOG_DIR=/tmp/qa,AGENT_TIMEOUT_MS=${AGENT_TIMEOUT_MS},CURSOR_API_KEY_SECRET_ID=${SECRET_ARN}}"

echo "==> Lambda function"
if aws lambda get-function --function-name "$FUNCTION_NAME" --region "$AWS_REGION" >/dev/null 2>&1; then
  aws lambda update-function-code --function-name "$FUNCTION_NAME" \
    --image-uri "$IMAGE_URI" --region "$AWS_REGION" >/dev/null
  aws lambda wait function-updated --function-name "$FUNCTION_NAME" --region "$AWS_REGION"
  aws lambda update-function-configuration --function-name "$FUNCTION_NAME" \
    --timeout "$TIMEOUT_S" --memory-size "$MEMORY_MB" \
    --environment "$ENV_VARS" --region "$AWS_REGION" >/dev/null
  aws lambda wait function-updated --function-name "$FUNCTION_NAME" --region "$AWS_REGION"
else
  # IAM role propagation can lag; retry create briefly.
  for i in 1 2 3 4 5; do
    aws lambda create-function --function-name "$FUNCTION_NAME" \
      --package-type Image --code "ImageUri=${IMAGE_URI}" \
      --role "$ROLE_ARN" --architectures "$ARCH" \
      --timeout "$TIMEOUT_S" --memory-size "$MEMORY_MB" \
      --environment "$ENV_VARS" --region "$AWS_REGION" >/dev/null && break
    echo "   create failed (role may still be propagating); retry $i..." && sleep 10
  done
fi
aws lambda wait function-active-v2 --function-name "$FUNCTION_NAME" --region "$AWS_REGION"

echo "==> Reserved concurrency (${RESERVED_CONCURRENCY}) — cost ceiling"
aws lambda put-function-concurrency --function-name "$FUNCTION_NAME" \
  --reserved-concurrent-executions "$RESERVED_CONCURRENCY" --region "$AWS_REGION" >/dev/null

echo "==> Function URL (AWS_IAM auth)"
aws lambda get-function-url-config --function-name "$FUNCTION_NAME" --region "$AWS_REGION" >/dev/null 2>&1 \
  || aws lambda create-function-url-config --function-name "$FUNCTION_NAME" \
       --auth-type AWS_IAM --region "$AWS_REGION" >/dev/null
FUNCTION_URL="$(aws lambda get-function-url-config --function-name "$FUNCTION_NAME" \
  --region "$AWS_REGION" --query FunctionUrl --output text)"

echo "==> Deployed ${GIT_SHA:0:12}. Function URL: ${FUNCTION_URL}"
echo "    Invoke with SigV4, e.g.:"
echo "    awscurl --service lambda --region ${AWS_REGION} -X POST \\"
echo "      -d '{\"question\":\"What does the nava-platform CLI wrap to install templates?\"}' \\"
echo "      ${FUNCTION_URL}"
```

- [ ] **Step 2: Make it executable and lint it**

Run (from the repo root): `chmod +x strata-qa/deploy.sh && bash -n strata-qa/deploy.sh`
Expected: no output (syntax OK). If `shellcheck` is installed, also run `shellcheck strata-qa/deploy.sh` and address warnings.

- [ ] **Step 3: Commit**

```bash
git add strata-qa/deploy.sh
git commit -m "Add scripted AWS CLI deploy for strata-qa Lambda"
```

- [ ] **Step 4: Deploy and smoke-test (manual, requires live AWS + key)**

Run (from the **repo root**): `AWS_REGION=<your-region> CURSOR_API_KEY=<your-key> ./strata-qa/deploy.sh`

Then invoke the printed Function URL with SigV4 (`pip install awscurl` if needed, or sign the request another way):

```bash
# Answerable -> 200 "answered"
awscurl --service lambda --region <your-region> -X POST \
  -d '{"question":"What does the nava-platform CLI wrap to install templates?"}' "$FUNCTION_URL"

# Refusal -> 200 "no_match" (refusals are valid answers, not errors)
awscurl --service lambda --region <your-region> -X POST \
  -d '{"question":"What is the best pizza topping?"}' "$FUNCTION_URL"

# Validation -> 400
awscurl --service lambda --region <your-region> -X POST -d '{}' "$FUNCTION_URL"
```

Record the observed cold-start latency of the first call, and confirm CloudWatch shows one structured log line per invocation.

---

## Task 9: Documentation

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md` (Commands section; `CLAUDE.md` is a symlink to it — edit `AGENTS.md` only)

**Interfaces:**
- Consumes: nothing (docs only).
- Produces: operator-facing instructions for building, deploying, and invoking the Lambda.

- [ ] **Step 1: Add a Lambda section to `README.md`**

Under the `strata-qa` documentation in `README.md`, add (note: no hard-wrapping in the fenced blocks; keep prose within the file's existing wrap width):

```markdown
### Deploying strata-qa as a Lambda

`strata-qa` can run as a container-image AWS Lambda behind an IAM-authed Function URL.
The image bakes the docs + CLI in at build time; the build context is the repo root.

```bash
AWS_REGION=<region> CURSOR_API_KEY=<personal-or-service-account-key> ./strata-qa/deploy.sh
```

`deploy.sh` creates the ECR repo, stores the key in Secrets Manager, creates the
execution role, deploys the function from the image, caps reserved concurrency, and
prints the Function URL. Invoke it with a SigV4-signed `POST` whose JSON body is
`{"question": "..."}` (optional `model`, `requestId`, `replyTo`); the response body is
the `QaResult` JSON the CLI emits plus `requestId`, and `error` on failures. Refusals
return HTTP 200.

Config via Lambda env vars: `AGENT_TIMEOUT_MS` (default 90000, must stay under the
Lambda `TIMEOUT_S` of 120), `QA_MODEL` (default `gpt-5.6-luna`), `QA_ALLOWED_MODELS`
(comma-separated allowlist for caller-supplied `model`), `DOCS_ROOT` (default
`/var/task`), `QA_LOG_DIR` (default `/tmp/qa` — the only writable path).

Two behaviours worth knowing: `docsVersion` is a `sha256:` hash rather than a git SHA
(the image has no `.git`; `STRATA_QA_GIT_SHA` carries the commit), and a question that
hits the 90s timeout returns 504 and recycles the container, so the next invocation
pays a cold start.
```

- [ ] **Step 2: Add the Lambda commands to `AGENTS.md`**

In the `strata-qa` block of the Commands section in `AGENTS.md`, append:

```markdown
# Deploy strata-qa as a container-image Lambda (needs AWS creds + docker + CURSOR_API_KEY)
./strata-qa/deploy.sh                                   # from the repo root: build, push, deploy, print URL
docker build -f strata-qa/Dockerfile -t strata-qa-lambda .   # build the image only (context = repo root)
```

- [ ] **Step 3: Verify the doc pipeline still passes**

Run (from the repo root): `python -m scripts.lint_docs`
Expected: `DOCS_OK`. These edits touch only `README.md`/`AGENTS.md`, not `docs/`, so no graph impact is expected — run it to be sure.

- [ ] **Step 4: Commit**

```bash
git add README.md AGENTS.md
git commit -m "Document strata-qa Lambda deployment and invocation"
```

---

## Self-Review Notes (for the implementer)

- **Spec coverage:** container image + baked docs via `COPY` (Tasks 1, 7); `handler.ts`/`core.ts` split for the Slack seam (Tasks 3–6); Function URL + IAM + reserved concurrency (Task 8); exit-code→HTTP map and the `error`/`requestId` envelope (Task 3); request validation incl. method, base64, length cap, model allowlist (Task 4); latency bounding via `AGENT_TIMEOUT_MS < TIMEOUT_S` (Tasks 6, 8); post-timeout container recycle (Tasks 6, 7); Secrets Manager with rotation-safe invalidation (Task 6); non-fatal logging + CloudWatch structured lines (Tasks 2, 5); feasibility gate (Task 1); recycle gate (Task 7); docs (Task 9). Every design section maps to a task.
- **Two gates, both hard stops.** Task 1 (can the SDK runtime execute under Lambda constraints) and Task 7 Step 5 (does the recycle work). Do not tune around a Task 7 failure — flip to fork-a-worker and record the reversal in the design doc.
- **Do not touch:** `run.ts`, `agent.ts`, `grounding.ts`, `parse.ts`, `prompt.ts`, `cli.ts`. This slice consumes them. The only pre-existing file modified is `log.ts` (Task 2), and that fix is correct for the CLI too.
- **Do not bump `@cursor/sdk`.** Plan mode is the only runtime containment, and `supportsReadOnlyLockdown()` cannot detect its loss (`agent.ts:131` is a tautology). A version bump requires re-running the `PWNED.txt` probe from `NOTES.md` and is out of scope here.
- **Type consistency:** `LambdaResponse`, `FunctionUrlEvent`, `QaJob`, `BadRequestError`, `JSON_HEADERS`, `EXIT_TO_HTTP`, `MAX_QUESTION_CHARS`, `toHttpResponse`, `errorResponse`, `parseJob`, `loadConfig`, `SecretFetcher`, `KeyLoader`, `createKeyLoader`, `HandleEventDeps`, `handleEvent`, `handler` live in `src/lambda/handler.ts`; `QaConfig` and `handleQuestion` live in `src/lambda/core.ts`. Env names used across code, tests, Dockerfile, and deploy: `DOCS_ROOT`, `AGENT_TIMEOUT_MS`, `QA_MODEL`, `QA_ALLOWED_MODELS`, `QA_LOG_DIR`, `CURSOR_API_KEY`, `CURSOR_API_KEY_SECRET_ID`, `RECYCLE_DELAY_MS`, `STRATA_QA_GIT_SHA`.
- **Known circular-ish import:** `core.ts` imports `QaJob` from `handler.ts` and `handler.ts` imports `handleQuestion` from `core.ts`. `QaJob` is a type-only import, so it erases at compile time and the runtime cycle does not exist. If `tsc` or vitest complains, move `QaJob`/`QaConfig` into a small `src/lambda/types.ts` rather than merging the modules — the split is the point.
