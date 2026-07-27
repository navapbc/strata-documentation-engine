// strata-qa/src/lambda/fixtures.ts
//
// Shared test fixtures for the Lambda suites. Deliberately NOT a *.test.ts file:
// when handler.test.ts imported these from core.test.ts, vitest collected
// core.test.ts's describe blocks a second time through the module graph and ran
// its five tests twice per `npm test`.
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentRun, AgentSeam } from "../agent.js";
import type { QaConfig } from "./core.js";

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

export const BLOCK =
  "```json\n" +
  JSON.stringify({
    status: "answered",
    answer: "Alpha.",
    citations: [{ path: "sources/s/d.md", quote: "Alpha beta" }],
  }) +
  "\n```";

export function finished(text: string): AgentRun {
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
