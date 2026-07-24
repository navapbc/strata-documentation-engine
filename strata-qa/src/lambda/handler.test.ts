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
