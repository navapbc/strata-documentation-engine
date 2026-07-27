import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// --- Per-root memoization ----------------------------------------------------
//
// Both functions below are pure over the docs tree, and runQa calls them on every
// question: loadNodePaths reparses a 56KB graph.json, and computeDocsVersion spawns
// git — which in the Lambda image has neither a .git directory nor a git binary, so
// it pays a failed process spawn and then SHA-256s that same 56KB, per request.
//
// The cache assumes docs under a given root do not change for the life of the
// process. That holds where it matters: the Lambda image is immutable, and the CLI
// is one-shot. Keyed by docsRoot so tests (and any future multi-root caller) stay
// independent; only successes are cached, so a malformed graph still throws every
// time rather than poisoning the entry.
const nodePathsCache = new Map<string, Set<string>>();
const docsVersionCache = new Map<string, string>();

export function resetGraphCaches(): void {
  nodePathsCache.clear();
  docsVersionCache.clear();
}

export function loadNodePaths(docsRoot: string): Set<string> {
  const cached = nodePathsCache.get(docsRoot);
  // A defensive copy: the cached Set outlives the call, and handing callers a
  // shared mutable reference would let one request's edit leak into the next.
  if (cached) return new Set(cached);
  const paths = parseNodePaths(docsRoot);
  nodePathsCache.set(docsRoot, paths);
  return new Set(paths);
}

function parseNodePaths(docsRoot: string): Set<string> {
  const raw = readFileSync(join(docsRoot, "docs", "graph.json"), "utf8");
  const graph: unknown = JSON.parse(raw);
  const nodes = (graph as { nodes?: unknown })?.nodes;
  if (!Array.isArray(nodes)) throw new Error("malformed graph.json: missing nodes array");
  const paths = new Set<string>();
  for (const n of nodes) {
    const p = (n as { path?: unknown })?.path;
    // build_graph.py emits doc_type:"source" grouping nodes with path:null (never
    // a citation target). Collect only string doc paths; skip null/absent paths.
    if (typeof p === "string") paths.add(p);
  }
  return paths;
}

export function normalizeCitationPath(raw: string): string {
  return raw
    .trim()
    .replace(/^\.\//, "")
    .replace(/^docs\//, "")
    .replace(/#.*$/, "")
    .replace(/(:\d+)+$/, "");
}

export function computeDocsVersion(docsRoot: string): string {
  const cached = docsVersionCache.get(docsRoot);
  if (cached !== undefined) return cached;
  const version = readDocsVersion(docsRoot);
  docsVersionCache.set(docsRoot, version);
  return version;
}

function readDocsVersion(docsRoot: string): string {
  try {
    return execFileSync("git", ["-C", docsRoot, "rev-parse", "HEAD"], {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    const bytes = readFileSync(join(docsRoot, "docs", "graph.json"));
    return "sha256:" + createHash("sha256").update(bytes).digest("hex");
  }
}
