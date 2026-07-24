// strata-qa/src/lambda/handler.test.ts
import { describe, expect, test } from "vitest";
import { EXIT, type RunOutcome } from "../run.js";
import { cfg, fakeSeam, makeDocsRoot } from "./core.test.js";
import {
  BadRequestError,
  MAX_QUESTION_CHARS,
  createKeyLoader,
  errorResponse,
  handleEvent,
  handler,
  loadConfig,
  parseJob,
  toHttpResponse,
  type FunctionUrlEvent,
} from "./handler.js";

const silent = () => {};

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
