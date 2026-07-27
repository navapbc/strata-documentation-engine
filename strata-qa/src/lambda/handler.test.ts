// strata-qa/src/lambda/handler.test.ts
import { describe, expect, test } from "vitest";
import type { AgentSeam } from "../agent.js";
import { EXIT, errorResult, type RunOutcome } from "../run.js";
import { fakeSeam, makeDocsRoot } from "../fixtures.js";
import { cfg } from "./fixtures.js";
import {
  BadRequestError,
  MAX_QUESTION_CHARS,
  createKeyLoader,
  errorResponse,
  handleEvent,
  handler,
  invocationBudgetMs,
  loadConfig,
  parseJob,
  toHttpResponse,
  type FunctionUrlEvent,
  type HandleEventDeps,
  type KeyLoader,
  type LambdaContext,
} from "./handler.js";

const silent = () => {};

// Returns the thrown BadRequestError, so a single call can be asserted against.
// A bare try/catch with no unreachable guard passes vacuously if the call ever
// stops throwing.
function rejects(fn: () => unknown): BadRequestError {
  try {
    fn();
  } catch (e) {
    return e as BadRequestError;
  }
  throw new Error("expected parseJob to throw a BadRequestError");
}

// Built from run.ts's own errorResult so a new QaResult field is one edit there
// rather than a silent divergence here.
function outcome(exitCode: number, status: string, errorMessage?: string): RunOutcome {
  return {
    result: {
      ...errorResult("m", "v", null, null),
      status: status as RunOutcome["result"]["status"],
      answer: status === "answered" ? "A." : null,
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
    expect(rejects(() => parseJob(event, ALLOWED)).statusCode).toBe(405);
  });

  test("a rejection carries the caller's requestId for the error path to echo", () => {
    const event = post(JSON.stringify({ requestId: "r1" }));
    expect(rejects(() => parseJob(event, ALLOWED)).requestId).toBe("r1");
  });

  test("a rejection carries no requestId when the body never parsed", () => {
    expect(rejects(() => parseJob(post("not json"), ALLOWED)).requestId).toBeUndefined();
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

  // A key that came from the environment has no source to re-fetch from, so
  // discarding it on the auth retry would not refresh anything — it would leave the
  // container with no key at all for the rest of its life, from what may well have
  // been one transient Cursor.me() failure.
  test("invalidate keeps an env-supplied key, which it could never re-fetch", async () => {
    const env = { CURSOR_API_KEY: "from-env" } as NodeJS.ProcessEnv;
    let calls = 0;
    const loader = createKeyLoader(env, async () => {
      calls += 1;
      return "fetched";
    });
    await loader.ensure();
    loader.invalidate();
    await loader.ensure();
    expect(env.CURSOR_API_KEY).toBe("from-env");
    expect(calls).toBe(0);
  });

  // ...and the same guard must not block a real rotation on the second round trip.
  test("invalidate still re-fetches repeatedly when the key is ours", async () => {
    const env = { CURSOR_API_KEY_SECRET_ID: "sid" } as unknown as NodeJS.ProcessEnv;
    const keys = ["first", "second", "third"];
    const loader = createKeyLoader(env, async () => keys.shift()!);
    await loader.ensure();
    loader.invalidate();
    await loader.ensure();
    loader.invalidate();
    await loader.ensure();
    expect(env.CURSOR_API_KEY).toBe("third");
  });

  test("no key and no secret id leaves the env unset for runQa to fail loud", async () => {
    const env = {} as NodeJS.ProcessEnv;
    await createKeyLoader(env, async () => "x").ensure();
    expect(env.CURSOR_API_KEY).toBeUndefined();
  });
});

describe("handleEvent", () => {
  const noKeys: KeyLoader = { ensure: async () => {}, invalidate: () => {} };
  // The corpus is only ever read, so one temp dir serves every test here.
  const root = makeDocsRoot();

  const ask = (
    body: unknown,
    seam: AgentSeam = fakeSeam(),
    deps: HandleEventDeps = {},
    keys: KeyLoader = noKeys,
  ) => handleEvent({ body: JSON.stringify(body) }, seam, cfg(root), keys, { emit: silent, ...deps });

  test("a bad request never reaches runQa", async () => {
    let asked = false;
    const seam = fakeSeam({
      ask: async () => {
        asked = true;
        throw new Error("should not run");
      },
    });
    const r = await ask({}, seam);
    expect(r.statusCode).toBe(400);
    expect(JSON.parse(r.body).error).toMatch(/question/i);
    expect(asked).toBe(false);
  });

  test("a non-POST method -> 405", async () => {
    const event = { body: "{}", requestContext: { http: { method: "GET" } } };
    expect((await handleEvent(event, fakeSeam(), cfg(root), noKeys, { emit: silent })).statusCode).toBe(405);
  });

  test("answered -> 200", async () => {
    const r = await ask({ question: "what is alpha?" });
    expect(r.statusCode).toBe(200);
    expect(JSON.parse(r.body).status).toBe("answered");
  });

  test("generates a requestId when the job omits one", async () => {
    expect(JSON.parse((await ask({ question: "q" })).body).requestId).toMatch(/[0-9a-f-]{36}/);
  });

  test("echoes a caller-supplied requestId", async () => {
    const r = await ask({ question: "q", requestId: "r1" });
    expect(r.statusCode).toBe(200);
    expect(JSON.parse(r.body).requestId).toBe("r1");
  });

  test("echoes a caller-supplied requestId on a 400 too", async () => {
    const r = await ask({ requestId: "r1" });
    expect(r.statusCode).toBe(400);
    expect(JSON.parse(r.body).requestId).toBe("r1");
  });

  test("generates a requestId when the body never parsed", async () => {
    const r = await handleEvent({ body: "not json" }, fakeSeam(), cfg(root), noKeys, { emit: silent });
    expect(r.statusCode).toBe(400);
    expect(JSON.parse(r.body).requestId).toMatch(/[0-9a-f-]{36}/);
  });

  test("an AUTH failure invalidates the key and retries once", async () => {
    let invalidated = 0;
    let attempts = 0;
    const keys: KeyLoader = {
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
    const r = await ask({ question: "q" }, seam, {}, keys);
    expect(invalidated).toBe(1);
    expect(attempts).toBe(2);
    expect(r.statusCode).toBe(200);
  });

  test("a second AUTH failure gives up with 500", async () => {
    expect((await ask({ question: "q" }, fakeSeam({ checkAuth: async () => false }))).statusCode).toBe(500);
  });

  // agent.ts cancels its own per-call timeout before throwing, so by the time the
  // handler sees EXIT.TIMEOUT there is nothing in flight and the container is clean.
  test("a timeout returns 504 and does NOT recycle when the run was cancelled", async () => {
    let recycled = 0;
    let cancelCalls = 0;
    const seam = fakeSeam({
      ask: async () => {
        const { TimeoutError } = await import("../agent.js");
        throw new TimeoutError(90_000);
      },
    });
    // The injected recycle also stands in for poisoning the module, so this test
    // cannot leave the real handler refusing every later invocation.
    const r = await ask({ question: "q" }, seam, {
      recycle: () => void (recycled += 1),
      cancelRuns: async () => (cancelCalls += 1) > 0,
    });
    expect(r.statusCode).toBe(504);
    expect(cancelCalls).toBe(1);
    expect(recycled).toBe(0);
  });

  // The fallback the recycle now exists for: a future SDK where supports("cancel")
  // is false, or cancel() throws. An abandoned run is not survivable on Lambda.
  test("a timeout recycles when the run could NOT be cancelled", async () => {
    let recycled = 0;
    const seam = fakeSeam({
      ask: async () => {
        const { TimeoutError } = await import("../agent.js");
        throw new TimeoutError(90_000);
      },
    });
    const r = await ask({ question: "q" }, seam, {
      recycle: () => void (recycled += 1),
      cancelRuns: async () => false,
    });
    expect(r.statusCode).toBe(504);
    expect(recycled).toBe(1);
  });

  test("a timeout emits whether the run stopped and the container was recycled", async () => {
    const lines: string[] = [];
    const seam = fakeSeam({ ask: () => new Promise(() => {}) });
    await ask({ question: "q" }, seam, {
      budgetMs: 20,
      recycle: () => {},
      cancelRuns: async () => false,
      emit: (l) => void lines.push(l),
    });
    const timeoutLine = lines.map((l) => JSON.parse(l)).find((o) => o.event === "timeout");
    expect(timeoutLine).toMatchObject({ runsStopped: false, containerRecycled: true });
    expect(timeoutLine.requestId).toBeDefined();
  });

  test("a successful invocation never recycles", async () => {
    let recycled = 0;
    await ask({ question: "q" }, fakeSeam(), { recycle: () => void (recycled += 1) });
    expect(recycled).toBe(0);
  });

  // The invocation budget exists to beat Lambda's hard kill, which is the one
  // path that returns no body AND never recycles. A slow seam stands in for
  // runQa's two per-call-bounded agent calls summing past the Lambda timeout.
  test("the invocation budget returns 504 and cancels the run it abandoned", async () => {
    let recycled = 0;
    let cancelCalls = 0;
    const seam = fakeSeam({ ask: () => new Promise(() => {}) }); // never settles
    // Unlike the per-call timeout, this path abandons a run that is genuinely still
    // going: the handler holds the only handle to it, so it must do the cancelling.
    const r = await ask({ question: "q" }, seam, {
      budgetMs: 20,
      recycle: () => void (recycled += 1),
      cancelRuns: async () => (cancelCalls += 1) > 0,
    });
    expect(r.statusCode).toBe(504);
    expect(cancelCalls).toBe(1);
    expect(recycled).toBe(0);
    const body = JSON.parse(r.body);
    expect(body.error).toMatch(/invocation exceeded its 20ms budget/);
    expect(body.status).toBe("error");
    expect(body.requestId).toBeDefined();
  });

  test("the budget covers the auth retry, not just the first attempt", async () => {
    // First attempt fails auth instantly; the retry hangs. Bounding only one
    // attempt would let this run past the deadline.
    let attempts = 0;
    const seam = fakeSeam({
      checkAuth: async () => {
        attempts += 1;
        return attempts > 1;
      },
      ask: () => new Promise(() => {}),
    });
    const keys: KeyLoader = { ensure: async () => {}, invalidate: () => {} };
    const r = await ask({ question: "q" }, seam, { budgetMs: 20, recycle: () => {} }, keys);
    expect(attempts).toBe(2);
    expect(r.statusCode).toBe(504);
  });

  test("the synthesized timeout result reports the model the job asked for", async () => {
    const seam = fakeSeam({ ask: () => new Promise(() => {}) });
    const r = await ask({ question: "q", model: "claude-sonnet-5" }, seam, { budgetMs: 20, recycle: () => {} });
    expect(JSON.parse(r.body).model).toBe("claude-sonnet-5");
  });

  test("a run that finishes inside its budget is untouched", async () => {
    let recycled = 0;
    const r = await ask({ question: "q" }, fakeSeam(), {
      budgetMs: 10_000,
      recycle: () => void (recycled += 1),
    });
    expect(r.statusCode).toBe(200);
    expect(recycled).toBe(0);
  });

  test("an unexpected throw becomes a 500 with no stack", async () => {
    const seam = fakeSeam({
      listModelIds: async () => {
        throw Object.assign(new Error("kaboom"), { stack: "SECRET STACK LINE" });
      },
    });
    expect((await ask({ question: "q" }, seam)).body).not.toContain("SECRET STACK LINE");
  });
});

describe("invocationBudgetMs", () => {
  test("derives the budget from the remaining time less the response reserve", () => {
    expect(invocationBudgetMs({ getRemainingTimeInMillis: () => 120_000 })).toBe(117_000);
  });

  test("clamps to a positive budget when almost no time is left", () => {
    expect(invocationBudgetMs({ getRemainingTimeInMillis: () => 500 })).toBe(1);
  });

  test.each([
    ["no context at all (RIE, direct invoke)", undefined],
    ["a context without the method", {}],
    ["a non-numeric remaining time", { getRemainingTimeInMillis: () => NaN }],
    ["an exhausted clock", { getRemainingTimeInMillis: () => 0 }],
  ])("returns null for %s, leaving runQa's per-call bounds in charge", (_label, context) => {
    expect(invocationBudgetMs(context as LambdaContext | undefined)).toBeNull();
  });
});

describe("handler", () => {
  test("is exported as a function for the RIC to resolve", () => {
    expect(typeof handler).toBe("function");
  });
});
