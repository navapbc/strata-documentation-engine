import { describe, expect, test } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadNodePaths, normalizeCitationPath, computeDocsVersion } from "./graph.js";

function makeDocsRoot(graph: unknown): string {
  const root = mkdtempSync(join(tmpdir(), "strata-qa-"));
  mkdirSync(join(root, "docs"), { recursive: true });
  writeFileSync(join(root, "docs", "graph.json"), JSON.stringify(graph));
  return root;
}

describe("loadNodePaths", () => {
  test("returns the set of node paths", () => {
    const root = makeDocsRoot({
      nodes: [
        { id: "a", path: "sources/strata-sdk/overview.md" },
        { id: "b", path: "sources/oscer/tasks.md" },
      ],
      edges: [],
    });
    expect(loadNodePaths(root)).toEqual(
      new Set(["sources/strata-sdk/overview.md", "sources/oscer/tasks.md"]),
    );
  });

  test("throws on graph without nodes array", () => {
    const root = makeDocsRoot({ edges: [] });
    expect(() => loadNodePaths(root)).toThrow(/malformed graph.json/);
  });

  test("throws on node without string path", () => {
    const root = makeDocsRoot({ nodes: [{ id: "a" }], edges: [] });
    expect(() => loadNodePaths(root)).toThrow(/malformed graph.json/);
  });
});

describe("normalizeCitationPath", () => {
  test.each([
    ["sources/oscer/tasks.md", "sources/oscer/tasks.md"],
    ["docs/sources/oscer/tasks.md", "sources/oscer/tasks.md"],
    ["./docs/sources/oscer/tasks.md", "sources/oscer/tasks.md"],
    ["sources/oscer/tasks.md#staff-tasks", "sources/oscer/tasks.md"],
    ["sources/oscer/tasks.md:42", "sources/oscer/tasks.md"],
    ["sources/oscer/tasks.md:42:7", "sources/oscer/tasks.md"],
    ["  sources/oscer/tasks.md  ", "sources/oscer/tasks.md"],
  ])("%s -> %s", (raw, expected) => {
    expect(normalizeCitationPath(raw)).toBe(expected);
  });
});

describe("computeDocsVersion", () => {
  test("falls back to sha256 of graph.json outside a git repo", () => {
    const root = makeDocsRoot({ nodes: [], edges: [] });
    const v = computeDocsVersion(root);
    expect(v).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(computeDocsVersion(root)).toBe(v); // deterministic
  });

  test("returns a git sha inside a git repo", () => {
    // This repo itself is a git checkout; its root has docs/graph.json.
    const v = computeDocsVersion(join(import.meta.dirname, "..", ".."));
    expect(v).toMatch(/^[0-9a-f]{40}$/);
  });
});
