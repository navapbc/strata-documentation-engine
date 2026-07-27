// strata-qa/src/lambda/handler.ts
import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { randomUUID } from "node:crypto";
import { cancelActiveRuns, createCursorSeam, TimeoutError, withTimeout, type AgentSeam } from "../agent.js";
import { DEFAULT_MODEL, EXIT, errorResult, type QaResult, type RunOutcome } from "../run.js";
import { handleQuestion, type QaConfig } from "./core.js";

export interface LambdaResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

const JSON_HEADERS: Record<string, string> = { "content-type": "application/json" };

// Server misconfiguration (auth/docs/lockdown) -> 500; upstream model
// interaction (model/parse/transport) -> 502; wall-clock cutoff -> 504.
// EXIT.LOCKDOWN is unreachable at runtime — supportsReadOnlyLockdown()
// (agent.ts:131) is a compile-time tautology — and EXIT.USAGE is a CLI-only
// argv failure, but both are mapped because the type below is exhaustive over
// EXIT on purpose: adding an exit code to run.ts must be a compile error here,
// not a silent fall-through to the 500 in toHttpResponse.
const EXIT_TO_HTTP: Record<number, number> = {
  [EXIT.OK]: 200,
  [EXIT.USAGE]: 400,
  [EXIT.AUTH]: 500,
  [EXIT.DOCS]: 500,
  [EXIT.LOCKDOWN]: 500,
  [EXIT.MODEL]: 502,
  [EXIT.PARSE]: 502,
  [EXIT.TRANSPORT]: 502,
  [EXIT.TIMEOUT]: 504,
  // The `satisfies` is the exhaustiveness gate; the declared Record<number,
  // number> is what lets toHttpResponse index it with a plain exitCode.
} satisfies Record<(typeof EXIT)[keyof typeof EXIT], number>;

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
    // The caller's requestId when the body parsed far enough to recover one, so
    // a 4xx can echo it without the error path re-decoding the envelope.
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "BadRequestError";
  }
}

// Token spend is the cost driver (~190k tokens/question per NOTES.md) and a
// longer question buys nothing, so cap it rather than pay for an essay.
export const MAX_QUESTION_CHARS = 2000;

// The one place that knows how a Function URL carries its payload. Any future
// content-encoding belongs here and nowhere else.
function decodeBody(event: FunctionUrlEvent): string {
  const raw = event.body ?? "";
  return event.isBase64Encoded ? Buffer.from(raw, "base64").toString("utf8") : raw;
}

export function parseJob(event: FunctionUrlEvent, allowedModels: readonly string[]): QaJob {
  const text = decodeBody(event);

  // Parse first but reject later: a caller-supplied requestId is recoverable
  // even from a body we are about to reject, and echoing it is what lets a
  // client correlate a 4xx with the request it sent. Rejection order below is
  // unchanged (method, then empty, then malformed, then per-field).
  let parsed: unknown;
  let jsonError = false;
  try {
    parsed = JSON.parse(text);
  } catch {
    jsonError = true;
  }
  const echoed = (parsed as { requestId?: unknown } | null | undefined)?.requestId;
  // Annotated on the const, not just the arrow: TS only narrows through a
  // never-returning call when the variable itself carries the type.
  const reject: (message: string, statusCode?: number) => never = (message, statusCode = 400) => {
    throw new BadRequestError(message, statusCode, typeof echoed === "string" ? echoed : undefined);
  };

  // The Runtime Interface Emulator and direct `lambda invoke` send bare events
  // with no requestContext; only reject a method that is present and not POST.
  const method = event.requestContext?.http?.method;
  if (method !== undefined && method.toUpperCase() !== "POST") {
    reject(`method ${method} not allowed; use POST`, 405);
  }

  if (!text.trim()) reject("request body is empty");
  if (jsonError) reject("request body is not valid JSON");
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    reject("request body must be a JSON object");
  }

  const { question, model, requestId, replyTo } = parsed as Record<string, unknown>;
  if (typeof question !== "string" || question.trim() === "") {
    reject("'question' is required and must be a non-empty string");
  }
  if (question.length > MAX_QUESTION_CHARS) {
    reject(`'question' exceeds ${MAX_QUESTION_CHARS} characters`);
  }
  if (model !== undefined && typeof model !== "string") reject("'model' must be a string");
  // A caller-chosen model is a spend vector; allow only what the operator configured.
  if (model !== undefined && !allowedModels.includes(model)) {
    reject(`'model' must be one of: ${allowedModels.join(", ")}`);
  }
  if (requestId !== undefined && typeof requestId !== "string") reject("'requestId' must be a string");
  if (replyTo !== undefined && typeof replyTo !== "string") reject("'replyTo' must be a string");

  // Reserved for the async Slack dispatcher; accepted and ignored in this slice.
  return { question, model, requestId, replyTo };
}

// Distinct from cli.ts's own default (60s): a Lambda invocation has a longer
// wall clock to spend than an interactive CLI run.
const LAMBDA_DEFAULT_TIMEOUT_MS = 90_000;

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
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : LAMBDA_DEFAULT_TIMEOUT_MS,
    defaultModel,
    // Lambda's filesystem is read-only except /tmp; runQa's JSONL MUST land there.
    logDir: env.QA_LOG_DIR ?? "/tmp/qa",
    // A caller-chosen model is a spend vector. The default is always permitted.
    allowedModels: [...new Set([defaultModel, ...configured])],
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

// --- Invocation wall clock ---------------------------------------------------
//
// config.timeoutMs bounds ONE agent call, and per-call bounds do not sum to an
// invocation bound: runQa can make two (ask, then the tool-less repair at
// run.ts:203), and handleEvent runs the whole thing again on an auth retry. With
// AGENT_TIMEOUT_MS=90000 a single request can therefore legitimately spend 180s
// against deploy.sh's TIMEOUT_S of 120 — reachable, because the repair only runs
// when ask already SUCCEEDED, so ask at 60s plus a repair hanging to 90s is 150s.
//
// That matters more than the lost answer. A Lambda hard-kill is the one path that
// returns no 504 AND never reaches recycle(), which leaves the orphaned agent
// alive in exactly the container the recycle exists to replace. So bound the
// invocation here, at the only layer that knows the real deadline, and beat
// Lambda to it.
const RESPONSE_RESERVE_MS = 3_000;

// The slice of the Lambda context this handler uses. Declared locally rather than
// pulling in @types/aws-lambda for one method.
export interface LambdaContext {
  getRemainingTimeInMillis?: () => number;
}

// Returns null when there is no deadline to beat — the Runtime Interface Emulator
// and direct `lambda invoke` in tests pass no context, and nothing is going to
// hard-kill those, so runQa's per-call bounds are sufficient there.
export function invocationBudgetMs(context?: LambdaContext): number | null {
  const remaining = context?.getRemainingTimeInMillis?.();
  if (typeof remaining !== "number" || !Number.isFinite(remaining) || remaining <= 0) return null;
  // Leave enough to serialize the 504 and let the recycle's delayed exit land
  // after the response is flushed.
  return Math.max(remaining - RESPONSE_RESERVE_MS, 1);
}

// Reuses withTimeout (a Promise.race that leaves the work running) deliberately:
// there is nothing to cancel — the SDK exposes no AbortSignal — and the TIMEOUT
// this produces routes straight into recycle(), which kills the container the
// orphan is running in. A late emit() from the orphaned handleQuestion may reach
// the log stream in the ~250ms before that exit; it is one stray line, and the
// alternative is the hard-kill this function exists to prevent.
async function withInvocationBudget(
  work: () => Promise<RunOutcome>,
  budgetMs: number | null | undefined,
  model: string,
): Promise<RunOutcome> {
  if (typeof budgetMs !== "number") return work();
  try {
    return await withTimeout(work(), budgetMs);
  } catch (e) {
    if (!(e instanceof TimeoutError)) throw e;
    // docsVersion stays "" for the same reason runQa's own preflight bailout
    // leaves it empty: we cannot know it from out here.
    return {
      result: errorResult(model, "", null, null),
      exitCode: EXIT.TIMEOUT,
      errorMessage: `invocation exceeded its ${budgetMs}ms budget before the agent returned`,
    };
  }
}

export interface HandleEventDeps {
  emit?: (line: string) => void;
  recycle?: () => void;
  // Stops whatever the container still has in flight, reporting false if anything
  // could not be stopped. Defaults to the real SDK-backed canceller.
  cancelRuns?: () => Promise<boolean>;
  // Whole-invocation wall clock in ms, or null/undefined for none. `handler`
  // derives it from the Lambda context; tests pass a number directly.
  budgetMs?: number | null;
}

export async function handleEvent(
  event: FunctionUrlEvent,
  seam: AgentSeam,
  config: QaConfig,
  keys: KeyLoader,
  deps: HandleEventDeps = {},
): Promise<LambdaResponse> {
  const { emit, recycle = scheduleRecycle, cancelRuns = cancelActiveRuns, budgetMs } = deps;

  // A caller-supplied requestId is echoed even on a 400 (parseJob carries it on
  // the error); fall back to a generated one when the body never parsed.
  let job: QaJob & { requestId: string };
  try {
    const parsed = parseJob(event, config.allowedModels);
    job = { ...parsed, requestId: parsed.requestId ?? randomUUID() };
  } catch (e) {
    if (e instanceof BadRequestError) {
      return errorResponse(e.statusCode, e.message, e.requestId ?? randomUUID());
    }
    throw e;
  }
  const { requestId } = job;

  try {
    await keys.ensure();
    // The budget wraps the auth retry too, not just one attempt — two attempts is
    // exactly one of the ways an invocation overruns.
    const outcome = await withInvocationBudget(
      async () => {
        let o = await handleQuestion(job, seam, config, emit);

        // A rotated key looks exactly like a bad key from here. Drop the cached
        // value and try once more before declaring an auth failure. Cheap: AUTH
        // only comes from runQa's preflight checkAuth (run.ts:132), before any
        // model call, so the first attempt spent no tokens.
        if (o.exitCode === EXIT.AUTH) {
          keys.invalidate();
          await keys.ensure();
          o = await handleQuestion(job, seam, config, emit);
        }
        return o;
      },
      budgetMs,
      job.model ?? config.defaultModel,
    );

    if (outcome.exitCode === EXIT.TIMEOUT) {
      // Cancellation replaces the recycle when it works, and the recycle stays as
      // the fallback when it does not. Both timeout sources land here: agent.ts
      // already cancelled its own per-call timeout (so nothing is in flight and
      // this is a no-op), while the invocation budget above abandoned a run that
      // is still going and this is the only place holding a handle to it.
      const stopped = await cancelRuns();
      emit?.(
        JSON.stringify({
          ts: new Date().toISOString(),
          requestId,
          event: "timeout",
          runsStopped: stopped,
          containerRecycled: !stopped,
        }),
      );
      if (!stopped) recycle();
    }
    return toHttpResponse(outcome, requestId);
  } catch (e) {
    // Backstop: a JSON error body, never a stack.
    const message = e instanceof Error ? e.message : String(e);
    return errorResponse(500, `internal error: ${message}`, requestId);
  }
}

// --- Container recycle after a timeout: the FALLBACK path -------------------
//
// This used to be the only answer to a timeout. It no longer is. agent.ts now runs
// through `Agent.create` -> `send()` -> `Run`, and a `Run` can be genuinely
// cancelled (verified live; see the block above `runBounded` in agent.ts). When
// cancellation succeeds nothing is left running, the container is clean, and this
// code never executes — the invocation still returns its 504, but the container
// lives and the next request is served normally.
//
// The recycle survives for the case cancellation cannot cover: `supports("cancel")`
// returning false on some future SDK, or `cancel()` throwing. Then the run really is
// abandoned, and abandonment is not survivable on Lambda — the environment freezes
// on return and thaws for the next invocation, so the orphaned agent would resume
// inside the NEXT request, stealing CPU, polluting its log stream, and burning
// ~200k tokens on an answer nobody will read.
//
// Poisoning the container is a RACE: the Node runtime POSTs the handler result after
// the returned promise resolves, and the environment may freeze immediately after.
// Exit too eagerly and the 504 is lost; use a timer alone and it may instead fire on
// the next thaw. Hence both halves:
//   - a short delayed exit, intended to land after the response is flushed;
//   - a `poisoned` flag checked at the top of every invocation, so a container that
//     survived the exit refuses to serve work rather than serving degraded work.
// One invocation is lost whenever this runs, which is now a genuinely exceptional
// path rather than the cost of every timeout.
const RECYCLE_DELAY_MS = 250;
let poisoned = false;

// Both halves of the recycle live here, so injecting a fake `recycle` fakes the
// whole mechanism and handleEvent has no hidden module-level side effect.
function scheduleRecycle(): void {
  poisoned = true;
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

// Built once per container, not per invocation. The seam is stateless (its preflight
// cache is module-level in agent.ts) and the function's environment is fixed for the
// container's life, so rebuilding these each request was pure allocation.
const cursorSeam = createCursorSeam();
const qaConfig = loadConfig(process.env);

export async function handler(event: FunctionUrlEvent, context?: LambdaContext): Promise<LambdaResponse> {
  // The delayed exit did not win the race and the container thawed first. Refuse
  // rather than serve an invocation contaminated by an orphaned agent run.
  if (poisoned) process.exit(1);
  return handleEvent(event, cursorSeam, qaConfig, keyLoader, {
    budgetMs: invocationBudgetMs(context),
  });
}
