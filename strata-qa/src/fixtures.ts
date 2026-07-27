// strata-qa/src/fixtures.ts
//
// Shared test fixtures for every suite that needs a docs corpus or a stand-in
// agent. Deliberately NOT a *.test.ts file: when handler.test.ts imported these
// from core.test.ts, vitest collected core.test.ts's describe blocks a second time
// through the module graph and ran its tests twice per `npm test`.
//
// The corpus layout below is a real contract — runQa preflights exactly
// docs/graph.json, docs/INDEX.md and docs/sources (run.ts) — so it is built in one
// place. A fourth required path is then one edit, not one per suite.
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { AgentRun, AgentSeam, AgentUsage } from "./agent.js";
import { DEFAULT_MODEL } from "./run.js";

export const DEFAULT_DOC_PATH = "sources/s/d.md";
export const DEFAULT_DOC_BODY = "---\nverified: ok\n---\nAlpha beta gamma.\n";
export const ALT_MODEL = "claude-sonnet-5";

export interface DocsRootOptions {
  prefix?: string;
  /** Path of the single doc, relative to `docs/`. Also the graph's one node. */
  docPath?: string;
  /** Full file contents, frontmatter included. */
  body?: string;
}

export function makeDocsRoot(opts: DocsRootOptions = {}): string {
  const { prefix = "strata-qa-", docPath = DEFAULT_DOC_PATH, body = DEFAULT_DOC_BODY } = opts;
  const root = mkdtempSync(join(tmpdir(), prefix));
  const doc = join(root, "docs", docPath);
  mkdirSync(dirname(doc), { recursive: true });
  writeFileSync(
    join(root, "docs", "graph.json"),
    JSON.stringify({ nodes: [{ id: "a", path: docPath }], edges: [] }),
  );
  writeFileSync(join(root, "docs", "INDEX.md"), "# i\n");
  writeFileSync(doc, body);
  return root;
}

/** The fenced-JSON envelope the prompt asks the model for. */
export function answerBlock(answer: string, citations: Array<{ path: string; quote: string }>): string {
  return "```json\n" + JSON.stringify({ status: "answered", answer, citations }) + "\n```";
}

export const BLOCK = answerBlock("Alpha.", [{ path: DEFAULT_DOC_PATH, quote: "Alpha beta" }]);

const DEFAULT_USAGE: AgentUsage = { inputTokens: 1, outputTokens: 1, totalTokens: 2 };

export function finished(
  text: string,
  usage: AgentUsage | null = DEFAULT_USAGE,
  durationMs: number | null = 5,
): AgentRun {
  return { ok: true, text, usage, durationMs };
}

export function fakeSeam(overrides: Partial<AgentSeam> = {}): AgentSeam {
  return {
    checkAuth: async () => true,
    listModelIds: async () => [DEFAULT_MODEL, ALT_MODEL],
    supportsReadOnlyLockdown: () => true,
    ask: async () => finished(BLOCK),
    reformat: async () => finished(BLOCK),
    ...overrides,
  };
}
