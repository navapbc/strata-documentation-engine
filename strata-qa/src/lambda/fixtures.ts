// strata-qa/src/lambda/fixtures.ts
//
// The Lambda-specific fixture. Everything generic — the docs corpus, the fake
// seam, the answer envelope — lives in ../fixtures.ts and is imported directly by
// the suites that need it; only QaConfig is shaped by this layer.
import { join } from "node:path";
import { ALT_MODEL } from "../fixtures.js";
import { DEFAULT_MODEL } from "../run.js";
import type { QaConfig } from "./core.js";

export function cfg(root: string): QaConfig {
  return {
    docsRoot: root,
    timeoutMs: 60_000,
    defaultModel: DEFAULT_MODEL,
    logDir: join(root, "logs"),
    allowedModels: [DEFAULT_MODEL, ALT_MODEL],
  };
}
