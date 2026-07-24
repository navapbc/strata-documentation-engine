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
