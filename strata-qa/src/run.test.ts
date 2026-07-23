import { describe, expect, test } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentRun, AgentSeam } from "./agent.js";
import { TimeoutError } from "./agent.js";
import { EXIT, runQa } from "./run.js";

const DOC = `---
id: sdk-overview
verified: ok
---
The nava-platform CLI wraps Copier to install templates.
`;

function makeDocsRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "strata-qa-run-"));
  mkdirSync(join(root, "docs", "sources", "strata-sdk"), { recursive: true });
  writeFileSync(
    join(root, "docs", "graph.json"),
    JSON.stringify({ nodes: [{ id: "a", path: "sources/strata-sdk/overview.md" }], edges: [] }),
  );
  writeFileSync(join(root, "docs", "INDEX.md"), "# Index\n");
  writeFileSync(join(root, "docs", "sources", "strata-sdk", "overview.md"), DOC);
  return root;
}

const GOOD_BLOCK =
  "```json\n" +
  JSON.stringify({
    status: "answered",
    answer: "It wraps Copier.",
    citations: [{ path: "sources/strata-sdk/overview.md", quote: "wraps Copier to install templates" }],
  }) +
  "\n```";

function finished(text: string): AgentRun {
  return { ok: true, text, usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 }, durationMs: 900 };
}

function fakeSeam(overrides: Partial<AgentSeam> = {}): AgentSeam {
  return {
    checkAuth: async () => true,
    listModelIds: async () => ["gpt-5.6-luna", "sonnet-4"],
    supportsReadOnlyLockdown: () => true,
    ask: async () => finished(GOOD_BLOCK),
    reformat: async () => finished(GOOD_BLOCK),
    ...overrides,
  };
}

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
    const badBlock =
      "```json\n" +
      JSON.stringify({
        status: "answered",
        answer: "made up",
        citations: [{ path: "sources/strata-sdk/overview.md", quote: "retries five times" }],
      }) +
      "\n```";
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
    const block =
      "```json\n" +
      JSON.stringify({
        status: "answered",
        answer: "It wraps Copier.",
        citations: [
          { path: "sources/strata-sdk/overview.md", quote: "wraps Copier to install templates" },
          { path: "sources/strata-sdk/overview.md", quote: "a paraphrase that appears nowhere" },
        ],
      }) +
      "\n```";
    const { result, exitCode } = await runQa(opts(root, logDir), fakeSeam({ ask: async () => finished(block) }));
    expect(exitCode).toBe(EXIT.OK);
    expect(result.status).toBe("answered");
    expect(result.answer).toBe("It wraps Copier.");
    expect(existsSync(join(logDir, "refusals.jsonl"))).toBe(false);
  });

  test("low_confidence refusal logs per-citation detail", async () => {
    const root = makeDocsRoot();
    const logDir = join(root, "logs");
    const block =
      "```json\n" +
      JSON.stringify({
        status: "answered",
        answer: "partly grounded",
        citations: [
          { path: "sources/strata-sdk/overview.md", quote: "wraps Copier to install templates" },
          { path: "sources/strata-sdk/ghost.md", quote: "made up" },
        ],
      }) +
      "\n```";
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
