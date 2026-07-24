import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

// Logging is observability, never correctness: a failed log write must not be
// able to destroy an answer the caller already paid for. This matters most on
// Lambda, where everything outside /tmp is read-only and runQa logs on its
// success path (run.ts:238) — an unguarded throw there turns a good answer into
// a 500. Report to stderr (never stdout: the CLI's contract is one JSON object
// on stdout) and continue.
export function appendJsonl(file: string, record: unknown): void {
  try {
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, JSON.stringify(record) + "\n", "utf8");
  } catch (e) {
    console.error(`log write failed (${file}): ${String(e)}`);
  }
}
