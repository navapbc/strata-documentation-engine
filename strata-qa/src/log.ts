import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

// Logging is observability, never correctness: a failed log write must not be
// able to destroy an answer the caller already paid for. This matters most on
// Lambda, where everything outside /tmp is read-only and runQa's logQuery runs on
// its success path — an unguarded throw there turns a good answer into
// a 500. Report to stderr (never stdout: the CLI's contract is one JSON object
// on stdout) and continue.
// Directories this process has already created. runQa appends one or two records
// per question into the same directory, so without this every append re-issues the
// mkdir syscall. Cleared by nothing: a log dir does not stop existing mid-process,
// and if one is removed the appendFileSync below fails into the same guarded path.
const ensuredDirs = new Set<string>();

export function appendJsonl(file: string, record: unknown): void {
  try {
    const dir = dirname(file);
    if (!ensuredDirs.has(dir)) {
      mkdirSync(dir, { recursive: true });
      ensuredDirs.add(dir);
    }
    appendFileSync(file, JSON.stringify(record) + "\n", "utf8");
  } catch (e) {
    console.error(`log write failed (${file}): ${String(e)}`);
  }
}
