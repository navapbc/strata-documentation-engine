// strata-qa/src/lambda/handler.test.ts
import { describe, expect, test } from "vitest";
import { EXIT, type RunOutcome } from "../run.js";
import {
  BadRequestError,
  MAX_QUESTION_CHARS,
  errorResponse,
  parseJob,
  toHttpResponse,
  type FunctionUrlEvent,
} from "./handler.js";

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
