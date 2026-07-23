import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export function loadNodePaths(docsRoot: string): Set<string> {
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
