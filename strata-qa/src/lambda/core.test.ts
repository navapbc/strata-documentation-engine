// strata-qa/src/lambda/core.test.ts
import { describe, expect, test } from "vitest";
import { TimeoutError } from "../agent.js";
import { EXIT } from "../run.js";
import { handleQuestion } from "./core.js";
import { BLOCK, cfg, fakeSeam, finished, makeDocsRoot } from "./fixtures.js";

describe("handleQuestion", () => {
  test("answers and returns EXIT.OK", async () => {
    const root = makeDocsRoot();
    const outcome = await handleQuestion({ question: "what is alpha?" }, fakeSeam(), cfg(root));
    expect(outcome.exitCode).toBe(EXIT.OK);
    expect(outcome.result.status).toBe("answered");
  });

  test.each([
    ["omits one, falling back to the default", undefined, "gpt-5.6-luna"],
    ["supplies one", "claude-sonnet-5", "claude-sonnet-5"],
  ])("when the job %s the agent is called with %s -> %s", async (_label, model, expected) => {
    const root = makeDocsRoot();
    let seen = "";
    const seam = fakeSeam({
      ask: async (_p, m) => {
        seen = m;
        return finished(BLOCK);
      },
    });
    await handleQuestion({ question: "q", model }, seam, cfg(root));
    expect(seen).toBe(expected);
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
