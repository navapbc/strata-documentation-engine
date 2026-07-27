import { describe, expect, test } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentSeam } from "./agent.js";
import { TimeoutError } from "./agent.js";
import { answerBlock, fakeSeam as baseSeam, finished as agentRun, makeDocsRoot as makeCorpus } from "./fixtures.js";
import { DEFAULT_MODEL, EXIT, runQa } from "./run.js";

const DOC_PATH = "sources/strata-sdk/overview.md";
const DOC = `---
id: sdk-overview
verified: ok
---
The nava-platform CLI wraps Copier to install templates.
`;

const makeDocsRoot = () => makeCorpus({ prefix: "strata-qa-run-", docPath: DOC_PATH, body: DOC });

const GOOD_BLOCK = answerBlock("It wraps Copier.", [
  { path: DOC_PATH, quote: "wraps Copier to install templates" },
]);

// This suite asserts on summed token counts, so it pins its own usage numbers.
const finished = (text: string) =>
  agentRun(text, { inputTokens: 100, outputTokens: 20, totalTokens: 120 }, 900);

const fakeSeam = (overrides: Partial<AgentSeam> = {}): AgentSeam =>
  baseSeam({
    // "sonnet-4" is asserted on by the unknown-model test's error message.
    listModelIds: async () => [DEFAULT_MODEL, "sonnet-4"],
    ask: async () => finished(GOOD_BLOCK),
    reformat: async () => finished(GOOD_BLOCK),
    ...overrides,
  });

function opts(root: string, logDir: string) {
  return { question: "what wraps copier?", model: "gpt-5.6-luna", docsRoot: root, logDir, timeoutMs: 60_000 };
}

describe("runQa", () => {
  test("happy path: answered, exit 0, query logged", async () => {
    const root = makeDocsRoot();
    const logDir = join(root, "logs");
    const { result, exitCode } = await runQa(opts(root, logDir), fakeSeam());
    expect(exitCode).toBe(EXIT.OK);
    expect(result.status).toBe("answered");
    expect(result.schema_version).toBe(1);
    expect(result.answer).toBe("It wraps Copier.");
    expect(result.sources).toEqual([{ path: "sources/strata-sdk/overview.md", verified: "ok" }]);
    expect(result.grounding.quotesVerified).toBe(1);
    expect(result.docsVersion).not.toBe("");
    expect(result.usage?.totalTokens).toBe(120);
    const q = readFileSync(join(logDir, "queries.jsonl"), "utf8").trim().split("\n");
    expect(q).toHaveLength(1);
    expect(JSON.parse(q[0]).status).toBe("answered");
    expect(existsSync(join(logDir, "refusals.jsonl"))).toBe(false);
  });

  test("fabricated quote: no_match, exit 0, refusal logged with reason", async () => {
    const root = makeDocsRoot();
    const logDir = join(root, "logs");
    const badBlock = answerBlock("made up", [{ path: DOC_PATH, quote: "retries five times" }]);
    const { result, exitCode } = await runQa(opts(root, logDir), fakeSeam({ ask: async () => finished(badBlock) }));
    expect(exitCode).toBe(EXIT.OK);
    expect(result.status).toBe("no_match");
    expect(result.answer).toBeNull();
    const refusals = readFileSync(join(logDir, "refusals.jsonl"), "utf8").trim().split("\n");
    expect(JSON.parse(refusals[0]).reason).toMatch(/no citation verified/);
  });

  test("redundant unverified quote in a verified doc -> still answered, no refusal", async () => {
    const root = makeDocsRoot();
    const logDir = join(root, "logs");
    const block = answerBlock("It wraps Copier.", [
      { path: DOC_PATH, quote: "wraps Copier to install templates" },
      { path: DOC_PATH, quote: "a paraphrase that appears nowhere" },
    ]);
    const { result, exitCode } = await runQa(opts(root, logDir), fakeSeam({ ask: async () => finished(block) }));
    expect(exitCode).toBe(EXIT.OK);
    expect(result.status).toBe("answered");
    expect(result.answer).toBe("It wraps Copier.");
    expect(existsSync(join(logDir, "refusals.jsonl"))).toBe(false);
  });

  test("low_confidence refusal logs per-citation detail", async () => {
    const root = makeDocsRoot();
    const logDir = join(root, "logs");
    const block = answerBlock("partly grounded", [
      { path: DOC_PATH, quote: "wraps Copier to install templates" },
      { path: "sources/strata-sdk/ghost.md", quote: "made up" },
    ]);
    const { result } = await runQa(opts(root, logDir), fakeSeam({ ask: async () => finished(block) }));
    expect(result.status).toBe("low_confidence");
    expect(result.answer).toBeNull();
    const entry = JSON.parse(readFileSync(join(logDir, "refusals.jsonl"), "utf8").trim());
    expect(entry.reason).toMatch(/partial verification/);
    expect(entry.citations).toEqual([
      { path: "sources/strata-sdk/overview.md", quote: "wraps Copier to install templates", resolved: true, verified: true },
      { path: "sources/strata-sdk/ghost.md", quote: "made up", resolved: false, verified: false },
    ]);
  });

  // Run identity is what makes two loop runs over the same corpus comparable after
  // the fact: docsVersion says which corpus answered, runId and gitSha say which
  // run and which code. Both edges supply them (cli.ts generates a runId per
  // question, lambda/handler.ts passes the caller's requestId), so the log rows
  // join to the CLI's stdout object and to the handler's CloudWatch line.
  test("query log carries the caller's runId and gitSha", async () => {
    const root = makeDocsRoot();
    const logDir = join(root, "logs");
    await runQa({ ...opts(root, logDir), runId: "r-42", gitSha: "abc1234" }, fakeSeam());
    const entry = JSON.parse(readFileSync(join(logDir, "queries.jsonl"), "utf8").trim());
    expect(entry.runId).toBe("r-42");
    expect(entry.gitSha).toBe("abc1234");
  });

  // A refusal is the row you most want to trace back to its stdout object.
  test("refusal log carries the runId too", async () => {
    const root = makeDocsRoot();
    const logDir = join(root, "logs");
    const block = answerBlock("ungrounded", [{ path: DOC_PATH, quote: "never appears" }]);
    await runQa(
      { ...opts(root, logDir), runId: "r-43" },
      fakeSeam({ ask: async () => finished(block) }),
    );
    const entry = JSON.parse(readFileSync(join(logDir, "refusals.jsonl"), "utf8").trim());
    expect(entry.runId).toBe("r-43");
  });

  // Guards the absent-vs-null choice rather than driving new behavior: the CLI can
  // fail to resolve a gitSha (not a git checkout), and a logged `null` would then be
  // a value a reader has to interpret instead of a key that simply is not there.
  test("omitted run identity leaves the keys out of the record", async () => {
    const root = makeDocsRoot();
    const logDir = join(root, "logs");
    await runQa(opts(root, logDir), fakeSeam());
    const entry = JSON.parse(readFileSync(join(logDir, "queries.jsonl"), "utf8").trim());
    expect("runId" in entry).toBe(false);
    expect("gitSha" in entry).toBe(false);
  });

  test("auth failure -> exit 2, status error", async () => {
    const root = makeDocsRoot();
    const out = await runQa(opts(root, join(root, "logs")), fakeSeam({ checkAuth: async () => false }));
    expect(out.exitCode).toBe(EXIT.AUTH);
    expect(out.result.status).toBe("error");
    expect(out.errorMessage).toMatch(/CURSOR_API_KEY/);
  });

  test("unknown model -> exit 3 with available ids in message", async () => {
    const root = makeDocsRoot();
    const out = await runQa(
      { ...opts(root, join(root, "logs")), model: "nope-1" },
      fakeSeam(),
    );
    expect(out.exitCode).toBe(EXIT.MODEL);
    expect(out.errorMessage).toContain("sonnet-4");
  });

  test("listModelIds throws (post-auth transport failure) -> exit 7, status error, no crash", async () => {
    const root = makeDocsRoot();
    const out = await runQa(
      opts(root, join(root, "logs")),
      fakeSeam({
        listModelIds: async () => {
          throw new Error("models.list 503");
        },
      }),
    );
    expect(out.exitCode).toBe(EXIT.TRANSPORT);
    expect(out.result.status).toBe("error");
    expect(out.errorMessage).toContain("models.list 503");
  });

  test("missing docs root files -> exit 4", async () => {
    const empty = mkdtempSync(join(tmpdir(), "strata-qa-empty-"));
    const out = await runQa(opts(empty, join(empty, "logs")), fakeSeam());
    expect(out.exitCode).toBe(EXIT.DOCS);
  });

  test("malformed graph.json (invalid JSON) -> exit 4, fails fast before the model call", async () => {
    const root = makeDocsRoot();
    writeFileSync(join(root, "docs", "graph.json"), "{ not valid json");
    let asked = false;
    const seam = fakeSeam({ ask: async () => ((asked = true), finished(GOOD_BLOCK)) });
    const out = await runQa(opts(root, join(root, "logs")), seam);
    expect(out.exitCode).toBe(EXIT.DOCS);
    expect(out.result.status).toBe("error");
    expect(out.errorMessage).toMatch(/malformed/i);
    expect(asked).toBe(false); // preflight bailed before any (expensive) agent call
  });

  test("malformed graph.json (missing nodes array) -> exit 4", async () => {
    const root = makeDocsRoot();
    writeFileSync(join(root, "docs", "graph.json"), JSON.stringify({ edges: [] }));
    const out = await runQa(opts(root, join(root, "logs")), fakeSeam());
    expect(out.exitCode).toBe(EXIT.DOCS);
    expect(out.errorMessage).toMatch(/malformed/i);
  });

  test("no lockdown support -> exit 5", async () => {
    const root = makeDocsRoot();
    const out = await runQa(opts(root, join(root, "logs")), fakeSeam({ supportsReadOnlyLockdown: () => false }));
    expect(out.exitCode).toBe(EXIT.LOCKDOWN);
  });

  test("malformed output repaired on second try -> answered", async () => {
    const root = makeDocsRoot();
    let reformatCalled = 0;
    const seam = fakeSeam({
      ask: async () => finished("here's your answer in prose"),
      reformat: async () => {
        reformatCalled++;
        return finished(GOOD_BLOCK);
      },
    });
    const { result, exitCode } = await runQa(opts(root, join(root, "logs")), seam);
    expect(exitCode).toBe(EXIT.OK);
    expect(result.status).toBe("answered");
    expect(reformatCalled).toBe(1);
    expect(result.usage?.totalTokens).toBe(240); // both calls summed
  });

  test("still malformed after repair -> exit 6, status error, logged", async () => {
    const root = makeDocsRoot();
    const logDir = join(root, "logs");
    const seam = fakeSeam({
      ask: async () => finished("prose"),
      reformat: async () => finished("still prose"),
    });
    const out = await runQa(opts(root, logDir), seam);
    expect(out.exitCode).toBe(EXIT.PARSE);
    expect(out.result.status).toBe("error");
    expect(JSON.parse(readFileSync(join(logDir, "queries.jsonl"), "utf8").trim()).status).toBe("error");
  });

  test("seam throw -> exit 7", async () => {
    const root = makeDocsRoot();
    const seam = fakeSeam({
      ask: async () => {
        throw new Error("socket hang up");
      },
    });
    const out = await runQa(opts(root, join(root, "logs")), seam);
    expect(out.exitCode).toBe(EXIT.TRANSPORT);
    expect(out.errorMessage).toContain("socket hang up");
  });

  test("agent run not ok -> exit 7", async () => {
    const root = makeDocsRoot();
    const seam = fakeSeam({ ask: async () => ({ ok: false, text: null, usage: null, durationMs: null }) });
    const out = await runQa(opts(root, join(root, "logs")), seam);
    expect(out.exitCode).toBe(EXIT.TRANSPORT);
  });

  test("ask() timeout -> exit 8 (distinct from transport), status error", async () => {
    const root = makeDocsRoot();
    const seam = fakeSeam({
      ask: async () => {
        throw new TimeoutError(60_000);
      },
    });
    const out = await runQa(opts(root, join(root, "logs")), seam);
    expect(out.exitCode).toBe(EXIT.TIMEOUT);
    expect(out.result.status).toBe("error");
    expect(out.errorMessage).toMatch(/timed out/i);
  });

  test("reformat() timeout -> exit 8", async () => {
    const root = makeDocsRoot();
    const seam = fakeSeam({
      ask: async () => finished("prose, not json"),
      reformat: async () => {
        throw new TimeoutError(60_000);
      },
    });
    const out = await runQa(opts(root, join(root, "logs")), seam);
    expect(out.exitCode).toBe(EXIT.TIMEOUT);
    expect(out.errorMessage).toMatch(/timed out/i);
  });

  test("timeoutMs is passed through to the seam calls", async () => {
    const root = makeDocsRoot();
    const seen: number[] = [];
    const seam = fakeSeam({
      ask: async (_p, _m, _d, timeoutMs) => {
        seen.push(timeoutMs);
        return finished("prose"); // force the repair path so reformat also runs
      },
      reformat: async (_m, _model, timeoutMs) => {
        seen.push(timeoutMs);
        return finished(GOOD_BLOCK);
      },
    });
    await runQa({ ...opts(root, join(root, "logs")), timeoutMs: 12_345 }, seam);
    expect(seen).toEqual([12_345, 12_345]);
  });
});
