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
