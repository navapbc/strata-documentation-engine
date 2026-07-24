// strata-qa/src/lambda/core.test.ts
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import type { AgentRun, AgentSeam } from "../agent.js";
import { TimeoutError } from "../agent.js";
import { EXIT } from "../run.js";
import { handleQuestion, type QaConfig } from "./core.js";

export function makeDocsRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "strata-qa-lambda-"));
  mkdirSync(join(root, "docs", "sources", "s"), { recursive: true });
  writeFileSync(
    join(root, "docs", "graph.json"),
    JSON.stringify({ nodes: [{ id: "a", path: "sources/s/d.md" }], edges: [] }),
  );
  writeFileSync(join(root, "docs", "INDEX.md"), "# i\n");
  writeFileSync(join(root, "docs", "sources", "s", "d.md"), "---\nverified: ok\n---\nAlpha beta gamma.\n");
  return root;
}

const BLOCK =
  "```json\n" +
  JSON.stringify({
    status: "answered",
    answer: "Alpha.",
    citations: [{ path: "sources/s/d.md", quote: "Alpha beta" }],
  }) +
  "\n```";

function finished(text: string): AgentRun {
  return { ok: true, text, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, durationMs: 5 };
}

export function fakeSeam(overrides: Partial<AgentSeam> = {}): AgentSeam {
  return {
    checkAuth: async () => true,
    listModelIds: async () => ["gpt-5.6-luna", "claude-sonnet-5"],
    supportsReadOnlyLockdown: () => true,
    ask: async () => finished(BLOCK),
    reformat: async () => finished(BLOCK),
    ...overrides,
  };
}

export function cfg(root: string): QaConfig {
  return {
    docsRoot: root,
    timeoutMs: 60_000,
    defaultModel: "gpt-5.6-luna",
    logDir: join(root, "logs"),
    allowedModels: ["gpt-5.6-luna", "claude-sonnet-5"],
  };
}

describe("handleQuestion", () => {
  test("answers and returns EXIT.OK", async () => {
    const root = makeDocsRoot();
    const outcome = await handleQuestion({ question: "what is alpha?" }, fakeSeam(), cfg(root));
    expect(outcome.exitCode).toBe(EXIT.OK);
    expect(outcome.result.status).toBe("answered");
  });

  test("falls back to the default model when the job omits one", async () => {
    const root = makeDocsRoot();
    let seen = "";
    const seam = fakeSeam({
      ask: async (_p, model) => {
        seen = model;
        return finished(BLOCK);
      },
    });
    await handleQuestion({ question: "q" }, seam, cfg(root));
    expect(seen).toBe("gpt-5.6-luna");
  });

  test("honours a job-supplied model", async () => {
    const root = makeDocsRoot();
    let seen = "";
    const seam = fakeSeam({
      ask: async (_p, model) => {
        seen = model;
        return finished(BLOCK);
      },
    });
    await handleQuestion({ question: "q", model: "claude-sonnet-5" }, seam, cfg(root));
    expect(seen).toBe("claude-sonnet-5");
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
