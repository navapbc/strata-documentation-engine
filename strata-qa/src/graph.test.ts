import { beforeEach, describe, expect, test } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadNodePaths, normalizeCitationPath, computeDocsVersion, resetGraphCaches } from "./graph.js";

// Both loaders memoize per docsRoot for the life of the process, so every test
// starts from a cold cache rather than inheriting the previous one's entries.
beforeEach(resetGraphCaches);

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

  test("skips source-container nodes with a null path", () => {
    // The real build_graph.py emits one doc_type:"source" node per source with
    // path:null (a grouping node, never a citation target) alongside the doc
    // nodes. loadNodePaths collects only the string doc paths and skips the rest.
    const root = makeDocsRoot({
      nodes: [
        { id: "source:oscer", doc_type: "source", path: null },
        { id: "a", path: "sources/oscer/tasks.md" },
        { id: "b" }, // no path key at all -> also skipped, not fatal
      ],
      edges: [],
    });
    expect(loadNodePaths(root)).toEqual(new Set(["sources/oscer/tasks.md"]));
  });
});

describe("loadNodePaths memoization", () => {
  test("reuses the parsed graph for a root, and resetGraphCaches re-reads it", () => {
    const root = makeDocsRoot({ nodes: [{ id: "a", path: "sources/a/one.md" }], edges: [] });
    expect(loadNodePaths(root)).toEqual(new Set(["sources/a/one.md"]));

    // Documents the cache's contract: docs under a root are assumed immutable for
    // the life of the process (true for the Lambda image and the one-shot CLI).
    writeFileSync(
      join(root, "docs", "graph.json"),
      JSON.stringify({ nodes: [{ id: "b", path: "sources/b/two.md" }], edges: [] }),
    );
    expect(loadNodePaths(root)).toEqual(new Set(["sources/a/one.md"]));

    resetGraphCaches();
    expect(loadNodePaths(root)).toEqual(new Set(["sources/b/two.md"]));
  });

  test("caches per root, so two roots do not share an entry", () => {
    const a = makeDocsRoot({ nodes: [{ id: "a", path: "sources/a/one.md" }], edges: [] });
    const b = makeDocsRoot({ nodes: [{ id: "b", path: "sources/b/two.md" }], edges: [] });
    expect(loadNodePaths(a)).toEqual(new Set(["sources/a/one.md"]));
    expect(loadNodePaths(b)).toEqual(new Set(["sources/b/two.md"]));
    expect(loadNodePaths(a)).toEqual(new Set(["sources/a/one.md"]));
  });

  test("a malformed graph is not cached as a failure", () => {
    const root = makeDocsRoot({ edges: [] });
    expect(() => loadNodePaths(root)).toThrow(/malformed graph.json/);
    // Repairing the file must take effect: nothing was cached by the throw.
    writeFileSync(
      join(root, "docs", "graph.json"),
      JSON.stringify({ nodes: [{ id: "a", path: "sources/a/one.md" }], edges: [] }),
    );
    expect(loadNodePaths(root)).toEqual(new Set(["sources/a/one.md"]));
  });

  test("the cached set is handed back directly, and the type is what stops a caller corrupting it", () => {
    const root = makeDocsRoot({ nodes: [{ id: "a", path: "sources/a/one.md" }], edges: [] });
    const first = loadNodePaths(root);
    // No per-request defensive copy: the very same instance comes back.
    expect(loadNodePaths(root)).toBe(first);
    // @ts-expect-error ReadonlySet exposes no add() — corrupting the cache is now a
    // compile error rather than something a runtime copy has to defend against.
    // Referenced, never called: this line is the assertion, and tsc is what runs it.
    void first.add;
    expect([...first]).toEqual(["sources/a/one.md"]);
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
    // Reset first, or the second call is a cache hit and proves nothing.
    resetGraphCaches();
    expect(computeDocsVersion(root)).toBe(v); // deterministic
  });

  test("memoizes per root and re-reads after resetGraphCaches", () => {
    const root = makeDocsRoot({ nodes: [], edges: [] });
    const v = computeDocsVersion(root);

    writeFileSync(join(root, "docs", "graph.json"), JSON.stringify({ nodes: [{ id: "x" }] }));
    expect(computeDocsVersion(root)).toBe(v); // cached

    resetGraphCaches();
    expect(computeDocsVersion(root)).not.toBe(v);
  });

  test("returns a git sha inside a git repo", () => {
    // This repo itself is a git checkout; its root has docs/graph.json.
    const v = computeDocsVersion(join(import.meta.dirname, "..", ".."));
    expect(v).toMatch(/^[0-9a-f]{40}$/);
  });
});
