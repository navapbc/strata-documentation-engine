// strata-qa/src/lambda/handler.ts
import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { randomUUID } from "node:crypto";
import { createCursorSeam, type AgentSeam } from "../agent.js";
import { DEFAULT_MODEL } from "../cli.js";
import { EXIT, type QaResult, type RunOutcome } from "../run.js";
import { handleQuestion, type QaConfig } from "./core.js";

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
  let requestId: string = randomUUID();
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
