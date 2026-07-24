# strata-qa Lambda HTTP Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy the existing `strata-qa` docs Q&A CLI as a container-image AWS Lambda, fronted by a Lambda Function URL, that accepts a question over HTTPS and returns the existing `strata-qa` JSON answer.

**Architecture:** A thin Lambda handler (`src/lambda.ts`) imports and calls the already-tested `runQa()` seam directly — no subprocess, no new QA logic. It parses the Function URL request body into a question, runs the agent bounded by a wall-clock timeout, and maps the structured `RunOutcome.exitCode` to an HTTP status. Docs + CLI + node_modules are baked into a container image at build time (git clone of the public repo); `@cursor/sdk`'s per-platform Linux binary is resolved by running `npm ci` inside the Lambda base image.

**Tech Stack:** Node 22, TypeScript (strict, ESM/NodeNext), vitest, `@cursor/sdk` 1.0.24, `@aws-sdk/client-secrets-manager`, Docker, AWS CLI (Lambda container image + Function URL + ECR + Secrets Manager).

## Global Constraints

- Runtime: **Node 22**, TypeScript **strict**, ESM (`"type": "module"`, `module`/`moduleResolution` = `NodeNext`). Relative imports use the `.js` extension (e.g. `import { runQa } from "./run.js"`).
- Handler source lives under `strata-qa/src/` (tsconfig `rootDir` is `src`); it compiles to `strata-qa/dist/`.
- Tests use **vitest** and the existing `AgentSeam` fakes — **no live model calls** in unit tests.
- Only one new production dependency is permitted: **`@aws-sdk/client-secrets-manager`**. No other new deps.
- The docs root must contain `docs/graph.json`, `docs/INDEX.md`, and `docs/sources/` (validated by `runQa` preflight).
- `CURSOR_API_KEY` must be a **personal user key or a service-account key** — a Team/Admin key 401s every call (`strata-qa/NOTES.md`).
- Lambda's filesystem is **read-only except `/tmp`**. Any path the handler writes (query/refusal logs) MUST be under `/tmp`.
- The agent wall-clock timeout (`AGENT_TIMEOUT_MS`, ~90s) MUST be strictly less than the Lambda function timeout (~120s) so the handler returns a clean 504 before Lambda hard-kills the invocation.
- Refusals (`no_match`, `low_confidence`) are valid answers → HTTP **200**, not errors.

## File Structure

- **Create** `strata-qa/src/lambda.ts` — the Lambda handler and its testable pure helpers: request parsing, exit-code→HTTP mapping, config loading, secret loading, and the `handler` entry point. One responsibility: adapt HTTP ⇄ the existing `runQa` seam.
- **Create** `strata-qa/src/lambda.test.ts` — unit tests for every pure helper and `handleEvent`, using fake seams.
- **Create** `strata-qa/Dockerfile` — container image: clone public repo, `npm ci`, build, bake docs, set handler CMD.
- **Create** `strata-qa/deploy.sh` — scripted AWS CLI: IAM role, ECR, secret, Lambda from image, Function URL.
- **Create** `strata-qa/.dockerignore` — keep local `node_modules`/`dist`/`.logs` out of build context (the image builds from a fresh clone).
- **Modify** `strata-qa/package.json` — add the `@aws-sdk/client-secrets-manager` dependency.
- **Modify** `README.md` and `CLAUDE.md`/`AGENTS.md` (Commands) — document the Lambda deploy + invoke.

The handler is deliberately one file: parsing, mapping, and wiring are small, change together, and are read as a unit. `runQa` and `createCursorSeam` stay untouched — we consume them.

---

## Task 1: Feasibility spike — prove the SDK runtime works in Lambda (GATE)

**This task gates the rest of the plan.** If plan-mode retrieval cannot run under Lambda's read-only filesystem, stop and revisit the approach before building the handler.

The probe reuses the existing, already-tested CLI as the workload — no handler code yet — so this isolates the runtime-feasibility question from new code.

**Files:**
- Create: `strata-qa/Dockerfile`
- Create: `strata-qa/.dockerignore`

**Interfaces:**
- Consumes: the public repo `https://github.com/navapbc/strata-documentation-engine` (docs + CLI); the existing `dist/cli.js`.
- Produces: a buildable image whose CMD is finalized in Task 5; confirmation (or documented mitigation) that `mode:"plan"` retrieval runs read-only.

- [ ] **Step 1: Write `.dockerignore`**

```
node_modules
dist
.logs
.sources
```

- [ ] **Step 2: Write the Dockerfile (probe form)**

Confirm the public repo's clone URL and default branch first: `git remote get-url origin`. Substitute the real URL/ref below if different.

```dockerfile
# strata-qa/Dockerfile
FROM public.ecr.aws/lambda/nodejs:22

# git is needed only to clone the public repo at build time.
RUN dnf install -y git && dnf clean all

# LAMBDA_TASK_ROOT is /var/task. Clone the repo root here so docs live at
# /var/task/docs and the CLI/handler at /var/task/strata-qa.
ARG REPO_URL=https://github.com/navapbc/strata-documentation-engine.git
ARG REPO_REF=main
WORKDIR ${LAMBDA_TASK_ROOT}
RUN git clone --depth 1 --branch ${REPO_REF} ${REPO_URL} . \
 && cd strata-qa \
 && npm ci \
 && npm run build \
 && npm prune --omit=dev \
 && rm -rf /var/task/.git

# Agent runtime needs a writable HOME; only /tmp is writable in Lambda.
ENV HOME=/tmp
ENV DOCS_ROOT=${LAMBDA_TASK_ROOT}

# Probe CMD (Task 5 replaces this with the handler). Left as the CLI so this
# image is runnable as a standalone probe via `docker run --entrypoint`.
CMD ["strata-qa/dist/lambda.handler"]
```

Note: the CMD references `lambda.handler`, which does not exist until Task 4. For the probe in Step 4 we override the entrypoint, so the missing handler does not matter yet.

- [ ] **Step 3: Build the image**

Run (from `strata-qa/`): `docker build --platform linux/arm64 -t strata-qa-lambda:probe .`

Expected: build succeeds; during `npm ci` the log shows `@cursor/sdk-linux-arm64` being added (the Linux binary, not the darwin one). Use `linux/amd64` instead if you intend an x86_64 Lambda — keep the arch consistent through Task 6.

- [ ] **Step 4: Probe plan-mode retrieval read-only, HOME=/tmp**

This runs the real CLI inside the image against the baked docs, with the root filesystem read-only and only `/tmp` writable — mirroring Lambda. Supply a real personal/service-account key.

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

Expected: exactly one JSON object on stdout with `"status":"answered"` (or a grounded refusal), exit code 0. SDK progress noise on stderr is fine.

- [ ] **Step 5: Record the outcome (gate decision)**

- If it answers: the runtime is Lambda-compatible. Proceed.
- If it fails writing state (EROFS/EACCES) or the sandbox binary errors: apply mitigations one at a time and re-run Step 4 — (a) confirm `HOME=/tmp` is set; (b) in a later handler change, pass `sandboxOptions:{enabled:false}` via the seam; (c) redirect any other writable path the error names to `/tmp`. If none succeed, **stop and report** — the baked-image + local-runtime approach is not viable as-is.

- [ ] **Step 6: Commit**

```bash
git add strata-qa/Dockerfile strata-qa/.dockerignore
git commit -m "Add probe Dockerfile and confirm SDK plan-mode runs read-only in Lambda base"
```

---

## Task 2: Exit-code → HTTP mapping (`toHttpResponse`)

**Files:**
- Create: `strata-qa/src/lambda.ts`
- Test: `strata-qa/src/lambda.test.ts`

**Interfaces:**
- Consumes: `EXIT`, `RunOutcome`, `QaResult` from `./run.js`.
- Produces:
  - `interface LambdaResponse { statusCode: number; headers: Record<string, string>; body: string }`
  - `const EXIT_TO_HTTP: Record<number, number>`
  - `function toHttpResponse(outcome: RunOutcome): LambdaResponse`

- [ ] **Step 1: Write the failing test**

```ts
// strata-qa/src/lambda.test.ts
import { describe, expect, test } from "vitest";
import { EXIT, type RunOutcome } from "./run.js";
import { toHttpResponse } from "./lambda.js";

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
    const r = toHttpResponse(outcome(EXIT.OK, "answered"));
    expect(r.statusCode).toBe(200);
    expect(r.headers["content-type"]).toBe("application/json");
    expect(JSON.parse(r.body).status).toBe("answered");
  });

  test("refusal -> 200", () => {
    expect(toHttpResponse(outcome(EXIT.OK, "no_match")).statusCode).toBe(200);
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
    expect(toHttpResponse(outcome(exit, "error", "boom")).statusCode).toBe(http);
  });

  test("error body includes errorMessage", () => {
    const r = toHttpResponse(outcome(EXIT.TIMEOUT, "error", "timed out"));
    expect(JSON.parse(r.body).error).toBe("timed out");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `strata-qa/`): `npm test -- lambda`
Expected: FAIL — `Failed to resolve import "./lambda.js"` (module does not exist yet).

- [ ] **Step 3: Write minimal implementation**

```ts
// strata-qa/src/lambda.ts
import { EXIT, type QaResult, type RunOutcome } from "./run.js";

export interface LambdaResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

export const JSON_HEADERS: Record<string, string> = { "content-type": "application/json" };

// Server misconfiguration (auth/docs/lockdown) -> 500; upstream model
// interaction (model/parse/transport) -> 502; wall-clock cutoff -> 504.
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

export function toHttpResponse(outcome: RunOutcome): LambdaResponse {
  const statusCode = EXIT_TO_HTTP[outcome.exitCode] ?? 500;
  const body: QaResult & { error?: string } = { ...outcome.result };
  if (outcome.errorMessage) body.error = outcome.errorMessage;
  return { statusCode, headers: JSON_HEADERS, body: JSON.stringify(body) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `strata-qa/`): `npm test -- lambda`
Expected: PASS (all `toHttpResponse` cases green).

- [ ] **Step 5: Commit**

```bash
git add strata-qa/src/lambda.ts strata-qa/src/lambda.test.ts
git commit -m "Add exit-code to HTTP status mapping for Lambda handler"
```

---

## Task 3: Request parsing (`parseQuestion`)

**Files:**
- Modify: `strata-qa/src/lambda.ts`
- Test: `strata-qa/src/lambda.test.ts`

**Interfaces:**
- Produces:
  - `interface FunctionUrlEvent { body?: string | null; isBase64Encoded?: boolean }`
  - `class BadRequestError extends Error {}`
  - `function parseQuestion(event: FunctionUrlEvent): { question: string; model?: string }`

- [ ] **Step 1: Write the failing test**

Append to `strata-qa/src/lambda.test.ts`:

```ts
import { parseQuestion, BadRequestError } from "./lambda.js";

describe("parseQuestion", () => {
  test("parses question from JSON body", () => {
    expect(parseQuestion({ body: JSON.stringify({ question: "how?" }) })).toEqual({
      question: "how?",
      model: undefined,
    });
  });

  test("parses optional model", () => {
    expect(parseQuestion({ body: JSON.stringify({ question: "q", model: "sonnet-4" }) }).model).toBe("sonnet-4");
  });

  test("decodes base64 body", () => {
    const b64 = Buffer.from(JSON.stringify({ question: "hi" })).toString("base64");
    expect(parseQuestion({ body: b64, isBase64Encoded: true }).question).toBe("hi");
  });

  test.each([
    [{ body: undefined }],
    [{ body: "" }],
    [{ body: "not json" }],
    [{ body: JSON.stringify({}) }],
    [{ body: JSON.stringify({ question: "" }) }],
    [{ body: JSON.stringify({ question: 123 }) }],
    [{ body: JSON.stringify({ question: "q", model: 5 }) }],
  ])("rejects %j with BadRequestError", (event) => {
    expect(() => parseQuestion(event as import("./lambda.js").FunctionUrlEvent)).toThrow(BadRequestError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `strata-qa/`): `npm test -- lambda`
Expected: FAIL — `parseQuestion is not exported` / not a function.

- [ ] **Step 3: Write minimal implementation**

Append to `strata-qa/src/lambda.ts`:

```ts
export interface FunctionUrlEvent {
  body?: string | null;
  isBase64Encoded?: boolean;
}

export class BadRequestError extends Error {}

export function parseQuestion(event: FunctionUrlEvent): { question: string; model?: string } {
  const raw = event.body ?? "";
  const text = event.isBase64Encoded ? Buffer.from(raw, "base64").toString("utf8") : raw;
  if (!text.trim()) throw new BadRequestError("request body is empty");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new BadRequestError("request body is not valid JSON");
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new BadRequestError("request body must be a JSON object");
  }
  const { question, model } = parsed as Record<string, unknown>;
  if (typeof question !== "string" || question.trim() === "") {
    throw new BadRequestError("'question' is required and must be a non-empty string");
  }
  if (model !== undefined && typeof model !== "string") {
    throw new BadRequestError("'model' must be a string");
  }
  return { question, model: model as string | undefined };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `strata-qa/`): `npm test -- lambda`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add strata-qa/src/lambda.ts strata-qa/src/lambda.test.ts
git commit -m "Add request body parsing for Lambda handler"
```

---

## Task 4: Orchestration, config, secret loading, and entry point

**Files:**
- Modify: `strata-qa/src/lambda.ts`
- Modify: `strata-qa/package.json` (add `@aws-sdk/client-secrets-manager`)
- Test: `strata-qa/src/lambda.test.ts`

**Interfaces:**
- Consumes: `runQa`, `EXIT` from `./run.js`; `TimeoutError`, `AgentSeam`, `createCursorSeam` from `./agent.js`; `DEFAULT_MODEL` from `./cli.js`; `toHttpResponse`, `parseQuestion`, `BadRequestError`, `JSON_HEADERS`, `FunctionUrlEvent`, `LambdaResponse` (same module).
- Produces:
  - `interface HandlerConfig { docsRoot: string; timeoutMs: number; defaultModel: string; logDir: string }`
  - `function loadConfig(env: NodeJS.ProcessEnv): HandlerConfig`
  - `type SecretFetcher = (secretId: string) => Promise<string>`
  - `async function ensureApiKey(env: NodeJS.ProcessEnv, fetchSecret: SecretFetcher): Promise<void>`
  - `async function handleEvent(event: FunctionUrlEvent, seam: AgentSeam, config: HandlerConfig): Promise<LambdaResponse>`
  - `async function handler(event: FunctionUrlEvent): Promise<LambdaResponse>` (Lambda entry — exported as `handler`)

- [ ] **Step 1: Add the AWS SDK dependency**

Run (from `strata-qa/`): `npm install @aws-sdk/client-secrets-manager`
Expected: `package.json` gains it under `dependencies`; `package-lock.json` updates.

- [ ] **Step 2: Write the failing test**

Append to `strata-qa/src/lambda.test.ts`:

```ts
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentRun, AgentSeam } from "./agent.js";
import { TimeoutError } from "./agent.js";
import { ensureApiKey, handleEvent, loadConfig, type HandlerConfig } from "./lambda.js";

function makeDocsRoot(): string {
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

function fakeSeam(overrides: Partial<AgentSeam> = {}): AgentSeam {
  return {
    checkAuth: async () => true,
    listModelIds: async () => ["gpt-5.6-luna"],
    supportsReadOnlyLockdown: () => true,
    ask: async () => finished(BLOCK),
    reformat: async () => finished(BLOCK),
    ...overrides,
  };
}

function cfg(root: string): HandlerConfig {
  return { docsRoot: root, timeoutMs: 60_000, defaultModel: "gpt-5.6-luna", logDir: join(root, "logs") };
}

describe("loadConfig", () => {
  test("defaults when env is empty", () => {
    const c = loadConfig({} as NodeJS.ProcessEnv);
    expect(c.timeoutMs).toBe(90_000);
    expect(c.logDir).toBe("/tmp/qa");
    expect(c.defaultModel).toBe("gpt-5.6-luna");
  });

  test("reads overrides from env", () => {
    const c = loadConfig({ DOCS_ROOT: "/var/task", AGENT_TIMEOUT_MS: "45000", QA_MODEL: "sonnet-4" } as NodeJS.ProcessEnv);
    expect(c.docsRoot).toBe("/var/task");
    expect(c.timeoutMs).toBe(45_000);
    expect(c.defaultModel).toBe("sonnet-4");
  });
});

describe("ensureApiKey", () => {
  test("env already set -> no fetch", async () => {
    let called = false;
    await ensureApiKey({ CURSOR_API_KEY: "abc" } as NodeJS.ProcessEnv, async () => {
      called = true;
      return "x";
    });
    expect(called).toBe(false);
  });

  test("fetches and assigns when secret id present", async () => {
    const env = { CURSOR_API_KEY_SECRET_ID: "sid" } as unknown as NodeJS.ProcessEnv;
    await ensureApiKey(env, async (id) => {
      expect(id).toBe("sid");
      return "fetched-key";
    });
    expect(env.CURSOR_API_KEY).toBe("fetched-key");
  });

  test("no key and no secret id -> leaves unset", async () => {
    const env = {} as NodeJS.ProcessEnv;
    await ensureApiKey(env, async () => "x");
    expect(env.CURSOR_API_KEY).toBeUndefined();
  });
});

describe("handleEvent", () => {
  test("bad request -> 400", async () => {
    const root = makeDocsRoot();
    const r = await handleEvent({ body: "{}" }, fakeSeam(), cfg(root));
    expect(r.statusCode).toBe(400);
    expect(JSON.parse(r.body).error).toMatch(/question/i);
  });

  test("answered -> 200", async () => {
    const root = makeDocsRoot();
    const r = await handleEvent({ body: JSON.stringify({ question: "what is alpha?" }) }, fakeSeam(), cfg(root));
    expect(r.statusCode).toBe(200);
    expect(JSON.parse(r.body).status).toBe("answered");
  });

  test("agent timeout -> 504", async () => {
    const root = makeDocsRoot();
    const seam = fakeSeam({
      ask: async () => {
        throw new TimeoutError(90_000);
      },
    });
    const r = await handleEvent({ body: JSON.stringify({ question: "q" }) }, seam, cfg(root));
    expect(r.statusCode).toBe(504);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run (from `strata-qa/`): `npm test -- lambda`
Expected: FAIL — `loadConfig`/`ensureApiKey`/`handleEvent` not exported.

- [ ] **Step 4: Write minimal implementation**

Append to `strata-qa/src/lambda.ts`:

```ts
import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { createCursorSeam, type AgentSeam } from "./agent.js";
import { DEFAULT_MODEL } from "./cli.js";
import { runQa } from "./run.js";

export interface HandlerConfig {
  docsRoot: string;
  timeoutMs: number;
  defaultModel: string;
  logDir: string;
}

export function loadConfig(env: NodeJS.ProcessEnv): HandlerConfig {
  return {
    docsRoot: env.DOCS_ROOT ?? process.cwd(),
    timeoutMs: Number(env.AGENT_TIMEOUT_MS ?? "90000"),
    defaultModel: env.QA_MODEL ?? DEFAULT_MODEL,
    // Lambda's filesystem is read-only except /tmp; logs MUST land there.
    logDir: env.QA_LOG_DIR ?? "/tmp/qa",
  };
}

export type SecretFetcher = (secretId: string) => Promise<string>;

// Populate process.env.CURSOR_API_KEY once, so the unchanged createCursorSeam()
// (which reads that env var at ask() time) authenticates. If the key is already
// present, do nothing; if neither key nor secret id is set, leave it unset and
// let runQa's preflight fail loud with EXIT.AUTH.
export async function ensureApiKey(env: NodeJS.ProcessEnv, fetchSecret: SecretFetcher): Promise<void> {
  if (env.CURSOR_API_KEY && env.CURSOR_API_KEY.trim() !== "") return;
  const secretId = env.CURSOR_API_KEY_SECRET_ID;
  if (!secretId) return;
  env.CURSOR_API_KEY = await fetchSecret(secretId);
}

export async function handleEvent(
  event: FunctionUrlEvent,
  seam: AgentSeam,
  config: HandlerConfig,
): Promise<LambdaResponse> {
  let parsed: { question: string; model?: string };
  try {
    parsed = parseQuestion(event);
  } catch (e) {
    if (e instanceof BadRequestError) {
      return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: e.message }) };
    }
    throw e;
  }
  const outcome = await runQa(
    {
      question: parsed.question,
      model: parsed.model ?? config.defaultModel,
      docsRoot: config.docsRoot,
      timeoutMs: config.timeoutMs,
      logDir: config.logDir,
    },
    seam,
  );
  return toHttpResponse(outcome);
}

const secretsClient = new SecretsManagerClient({});

const fetchFromSecretsManager: SecretFetcher = async (secretId) => {
  const out = await secretsClient.send(new GetSecretValueCommand({ SecretId: secretId }));
  if (!out.SecretString) throw new Error(`secret ${secretId} has no SecretString`);
  return out.SecretString;
};

// Cache the key resolution across warm invocations.
let apiKeyReady: Promise<void> | null = null;

export async function handler(event: FunctionUrlEvent): Promise<LambdaResponse> {
  try {
    if (!apiKeyReady) apiKeyReady = ensureApiKey(process.env, fetchFromSecretsManager);
    await apiKeyReady;
    return await handleEvent(event, createCursorSeam(), loadConfig(process.env));
  } catch (e) {
    return { statusCode: 500, headers: JSON_HEADERS, body: JSON.stringify({ error: `internal error: ${String(e)}` }) };
  }
}
```

- [ ] **Step 5: Run tests and the type build to verify they pass**

Run (from `strata-qa/`): `npm test -- lambda && npm run build`
Expected: all lambda tests PASS; `tsc` compiles with no errors (produces `dist/lambda.js`).

- [ ] **Step 6: Run the full suite to confirm no regressions**

Run (from `strata-qa/`): `npm test`
Expected: entire suite PASS.

- [ ] **Step 7: Commit**

```bash
git add strata-qa/src/lambda.ts strata-qa/src/lambda.test.ts strata-qa/package.json strata-qa/package-lock.json
git commit -m "Add Lambda handler wiring, config, and Secrets Manager key loading"
```

---

## Task 5: Finalize the Dockerfile and smoke-test the handler locally

**Files:**
- Modify: `strata-qa/Dockerfile`

**Interfaces:**
- Consumes: the built `strata-qa/dist/lambda.js` exporting `handler`.
- Produces: an image whose CMD invokes the Lambda handler; verified end-to-end via the AWS Runtime Interface Emulator (bundled in the base image).

- [ ] **Step 1: Confirm the handler CMD**

The Dockerfile already ends with `CMD ["strata-qa/dist/lambda.handler"]` (Task 1). Confirm it is present and unchanged. The RIC resolves this as: load `strata-qa/dist/lambda.js` relative to `LAMBDA_TASK_ROOT` (`/var/task`) and invoke its exported `handler`.

- [ ] **Step 2: Rebuild the image**

Run (from `strata-qa/`): `docker build --platform linux/arm64 -t strata-qa-lambda:local .`
Expected: build succeeds; `dist/lambda.js` is present in the image (it is produced by `npm run build` during the clone step).

- [ ] **Step 3: Run the image with the Runtime Interface Emulator**

```bash
docker run --rm -p 9000:8080 \
  --read-only --tmpfs /tmp \
  -e HOME=/tmp \
  -e CURSOR_API_KEY="$CURSOR_API_KEY" \
  strata-qa-lambda:local
```

Leave it running; the base image's entrypoint starts the emulator on port 8080.

- [ ] **Step 4: Invoke the emulated function (in a second terminal)**

```bash
curl -s "http://localhost:9000/2015-03-31/functions/function/invocations" \
  -d '{"body": "{\"question\": \"What does the nava-platform CLI wrap to install templates?\"}"}'
```

Expected: a JSON envelope with `"statusCode": 200` and a `body` string that parses to `{"status":"answered", ...}`. (The RIE wraps the handler's returned object; the Function URL later returns `body` directly to the caller.)

- [ ] **Step 5: Invoke with a bad request to confirm the 400 path**

```bash
curl -s "http://localhost:9000/2015-03-31/functions/function/invocations" -d '{"body": "{}"}'
```

Expected: `"statusCode": 400`, body error mentioning `question`. Stop the container (Ctrl-C in the first terminal) when done.

- [ ] **Step 6: Commit (only if the Dockerfile changed)**

```bash
git add strata-qa/Dockerfile
git commit -m "Finalize Lambda handler CMD and verify via Runtime Interface Emulator"
```

If Step 1 confirmed the CMD was already correct and nothing changed, skip the commit and note that in the task record.

---

## Task 6: Deploy script (`deploy.sh`)

**Files:**
- Create: `strata-qa/deploy.sh`

**Interfaces:**
- Consumes: local AWS credentials (SigV4), Docker, the built image; env vars `AWS_REGION`, `CURSOR_API_KEY` (to seed the secret).
- Produces: an ECR repo, a Secrets Manager secret, an IAM execution role, the Lambda function from the image, and a Function URL with `AWS_IAM` auth. Prints the Function URL.

- [ ] **Step 1: Write `deploy.sh`**

```bash
#!/usr/bin/env bash
# Deploy strata-qa as a container-image Lambda with an IAM-authed Function URL.
# Prereqs: aws CLI v2, docker, and CURSOR_API_KEY exported (personal or
# service-account key). Run from strata-qa/.
set -euo pipefail

AWS_REGION="${AWS_REGION:-us-east-1}"
FUNCTION_NAME="${FUNCTION_NAME:-strata-qa}"
ECR_REPO="${ECR_REPO:-strata-qa-lambda}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
ARCH="${ARCH:-arm64}"                       # arm64 | x86_64
DOCKER_PLATFORM="linux/${ARCH/x86_64/amd64}"
LAMBDA_ARCH="${ARCH}"
MEMORY_MB="${MEMORY_MB:-2048}"
TIMEOUT_S="${TIMEOUT_S:-120}"
AGENT_TIMEOUT_MS="${AGENT_TIMEOUT_MS:-90000}"
SECRET_NAME="${SECRET_NAME:-strata-qa/cursor-api-key}"
ROLE_NAME="${ROLE_NAME:-strata-qa-lambda-role}"

: "${CURSOR_API_KEY:?export CURSOR_API_KEY (personal or service-account key) before deploying}"

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
ECR_URI="${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO}"
IMAGE_URI="${ECR_URI}:${IMAGE_TAG}"

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
# Allow reading just this secret.
aws iam put-role-policy --role-name "$ROLE_NAME" --policy-name read-cursor-secret \
  --policy-document "{
    \"Version\":\"2012-10-17\",
    \"Statement\":[{\"Effect\":\"Allow\",\"Action\":\"secretsmanager:GetSecretValue\",\"Resource\":\"${SECRET_ARN}\"}]
  }" >/dev/null
ROLE_ARN="$(aws iam get-role --role-name "$ROLE_NAME" --query Role.Arn --output text)"

echo "==> Build & push image (${DOCKER_PLATFORM})"
aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
docker build --platform "$DOCKER_PLATFORM" -t "$IMAGE_URI" .
docker push "$IMAGE_URI"

ENV_VARS="Variables={HOME=/tmp,DOCS_ROOT=/var/task,AGENT_TIMEOUT_MS=${AGENT_TIMEOUT_MS},CURSOR_API_KEY_SECRET_ID=${SECRET_ARN}}"

echo "==> Lambda function"
if aws lambda get-function --function-name "$FUNCTION_NAME" --region "$AWS_REGION" >/dev/null 2>&1; then
  aws lambda update-function-code --function-name "$FUNCTION_NAME" \
    --image-uri "$IMAGE_URI" --region "$AWS_REGION" >/dev/null
  aws lambda wait function-updated --function-name "$FUNCTION_NAME" --region "$AWS_REGION"
  aws lambda update-function-configuration --function-name "$FUNCTION_NAME" \
    --timeout "$TIMEOUT_S" --memory-size "$MEMORY_MB" \
    --environment "$ENV_VARS" --region "$AWS_REGION" >/dev/null
else
  # IAM role propagation can lag; retry create briefly.
  for i in 1 2 3 4 5; do
    aws lambda create-function --function-name "$FUNCTION_NAME" \
      --package-type Image --code "ImageUri=${IMAGE_URI}" \
      --role "$ROLE_ARN" --architectures "$LAMBDA_ARCH" \
      --timeout "$TIMEOUT_S" --memory-size "$MEMORY_MB" \
      --environment "$ENV_VARS" --region "$AWS_REGION" >/dev/null && break
    echo "   create failed (role may still be propagating); retry $i..." && sleep 10
  done
fi
aws lambda wait function-active-v2 --function-name "$FUNCTION_NAME" --region "$AWS_REGION"

echo "==> Function URL (AWS_IAM auth)"
aws lambda get-function-url-config --function-name "$FUNCTION_NAME" --region "$AWS_REGION" >/dev/null 2>&1 \
  || aws lambda create-function-url-config --function-name "$FUNCTION_NAME" \
       --auth-type AWS_IAM --region "$AWS_REGION" >/dev/null
FUNCTION_URL="$(aws lambda get-function-url-config --function-name "$FUNCTION_NAME" \
  --region "$AWS_REGION" --query FunctionUrl --output text)"

echo "==> Deployed. Function URL: ${FUNCTION_URL}"
echo "    Invoke with SigV4, e.g.:"
echo "    awscurl --service lambda --region ${AWS_REGION} -X POST \\"
echo "      -d '{\"question\":\"What does the nava-platform CLI wrap to install templates?\"}' \\"
echo "      ${FUNCTION_URL}"
```

- [ ] **Step 2: Make it executable**

Run (from `strata-qa/`): `chmod +x deploy.sh`

- [ ] **Step 3: Lint the script**

Run (from `strata-qa/`): `bash -n deploy.sh`
Expected: no output (syntax OK). If `shellcheck` is installed, also run `shellcheck deploy.sh` and address warnings.

- [ ] **Step 4: Commit**

```bash
git add strata-qa/deploy.sh
git commit -m "Add scripted AWS CLI deploy for strata-qa Lambda"
```

- [ ] **Step 5: Deploy and smoke-test (manual, requires live AWS + key)**

Run (from `strata-qa/`): `AWS_REGION=<your-region> CURSOR_API_KEY=<your-key> ./deploy.sh`
Then invoke the printed Function URL with SigV4 (the script prints an `awscurl` example; `pip install awscurl` if needed, or sign the request another way):

```bash
awscurl --service lambda --region <your-region> -X POST \
  -d '{"question":"What does the nava-platform CLI wrap to install templates?"}' \
  "$FUNCTION_URL"
```

Expected: HTTP 200, body parses to `{"status":"answered", ...}`. Then send a clearly out-of-scope question (e.g. `"What is the best pizza topping?"`) and expect HTTP 200 with `"status":"no_match"`.

---

## Task 7: Documentation

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md` (Commands section; `CLAUDE.md` is a symlink to it — edit `AGENTS.md` only)

**Interfaces:**
- Consumes: nothing (docs only).
- Produces: operator-facing instructions for building, deploying, and invoking the Lambda.

- [ ] **Step 1: Add a Lambda section to `README.md`**

Under the `strata-qa` documentation in `README.md`, add:

```markdown
### Deploying strata-qa as a Lambda

`strata-qa` can run as a container-image AWS Lambda behind an IAM-authed Function URL.
The image bakes the docs + CLI in at build time (git clone of this public repo).

```bash
cd strata-qa
AWS_REGION=<region> CURSOR_API_KEY=<personal-or-service-account-key> ./deploy.sh
```

`deploy.sh` creates the ECR repo, stores the key in Secrets Manager, creates the
execution role, deploys the function from the image, and prints the Function URL.
Invoke it with a SigV4-signed `POST` whose JSON body is `{"question": "..."}`; the
response body is the same `QaResult` JSON the CLI emits (refusals return HTTP 200).

Config via Lambda env vars: `AGENT_TIMEOUT_MS` (default 90000, must stay under the
Lambda `TIMEOUT_S` of 120), `QA_MODEL` (default `gpt-5.6-luna`), `DOCS_ROOT`
(default `/var/task`). The handler logs to `/tmp/qa` (the only writable path).
```
```

- [ ] **Step 2: Add the Lambda commands to `AGENTS.md`**

In the `strata-qa` block of the Commands section in `AGENTS.md`, append:

```markdown
# Deploy strata-qa as a container-image Lambda (needs AWS creds + docker + CURSOR_API_KEY)
cd strata-qa && ./deploy.sh                       # build image, push, deploy, print Function URL
docker build -t strata-qa-lambda .                # build the image only
```
```

- [ ] **Step 3: Verify the doc pipeline still passes (no frontmatter/graph impact expected)**

Run (from repo root): `python -m scripts.lint_docs`
Expected: `DOCS_OK`. (These edits touch only `README.md`/`AGENTS.md`, not `docs/`, so this should be unaffected; run it to be sure.)

- [ ] **Step 4: Commit**

```bash
git add README.md AGENTS.md
git commit -m "Document strata-qa Lambda deployment and invocation"
```

---

## Self-Review Notes (for the implementer)

- **Spec coverage:** container image + baked docs (Tasks 1, 5), direct `runQa` handler (Task 4), Function URL + IAM (Task 6), exit-code→HTTP map (Task 2), latency bounding via `AGENT_TIMEOUT_MS < TIMEOUT_S` (Tasks 4, 6), Secrets Manager with env fallback (Task 4), read-only-FS logging to `/tmp` (Task 4 `loadConfig`), unit + local-container + deployed testing (Tasks 2–6), feasibility spike gate (Task 1), docs (Task 7). All spec sections map to a task.
- **The gate is Task 1.** Do not proceed past it until plan-mode retrieval is confirmed working (or mitigated) under a read-only filesystem.
- **Type consistency:** `LambdaResponse`, `FunctionUrlEvent`, `HandlerConfig`, `SecretFetcher`, `BadRequestError`, `JSON_HEADERS`, `EXIT_TO_HTTP`, `toHttpResponse`, `parseQuestion`, `loadConfig`, `ensureApiKey`, `handleEvent`, `handler` are defined once in `src/lambda.ts` and referenced with those exact names in tests and the deploy env (`CURSOR_API_KEY_SECRET_ID`, `DOCS_ROOT`, `AGENT_TIMEOUT_MS`, `QA_MODEL`, `QA_LOG_DIR`).
