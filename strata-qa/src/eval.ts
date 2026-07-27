import { readFileSync } from "node:fs";
import type { AgentSeam } from "./agent.js";
import type { QaResult } from "./run.js";
import { runQa } from "./run.js";

export interface Fixture {
  question: string;
  expect: "answerable" | "refuse";
}

export interface EvalRow {
  question: string;
  expect: string;
  status: string;
  pass: boolean;
  durationMs: number | null;
  totalTokens: number | null;
  quoteDowngrade: boolean;
}

export function scoreFixture(f: Fixture, r: QaResult): EvalRow {
  const pass =
    f.expect === "answerable"
      ? r.status === "answered"
      : r.status === "no_match" || r.status === "low_confidence";
  return {
    question: f.question,
    expect: f.expect,
    status: r.status,
    pass,
    durationMs: r.durationMs,
    totalTokens: r.usage?.totalTokens ?? null,
    quoteDowngrade: r.grounding.citationsResolved > 0 && r.grounding.quotesVerified < r.grounding.citationsResolved,
  };
}

export function formatSummary(rows: EvalRow[]): string {
  const passed = rows.filter((r) => r.pass).length;
  const withDuration = rows.filter((r) => r.durationMs !== null);
  const meanMs = withDuration.length
    ? Math.round(withDuration.reduce((a, r) => a + (r.durationMs ?? 0), 0) / withDuration.length)
    : null;
  const tokens = rows.reduce((a, r) => a + (r.totalTokens ?? 0), 0);
  const downgrades = rows.filter((r) => r.quoteDowngrade).length;
  return (
    `${passed}/${rows.length} passed  |  mean latency: ${meanMs ?? "?"} ms  |  ` +
    `total tokens: ${tokens}  |  quote-downgrades: ${downgrades}\n`
  );
}

export async function runEval(
  opts: { fixturesPath: string; model: string; docsRoot: string; timeoutMs: number; logDir: string },
  seam: AgentSeam,
  write: (s: string) => void,
): Promise<number> {
  const fixtures: Fixture[] = JSON.parse(readFileSync(opts.fixturesPath, "utf8"));
  const rows: EvalRow[] = [];
  for (const f of fixtures) {
    const { result } = await runQa(
      {
        question: f.question,
        model: opts.model,
        docsRoot: opts.docsRoot,
        timeoutMs: opts.timeoutMs,
        logDir: opts.logDir,
      },
      seam,
    );
    const row = scoreFixture(f, result);
    rows.push(row);
    write(`${row.pass ? "PASS" : "FAIL"}  expect=${row.expect}  got=${row.status}  ${row.question}\n`);
  }
  write("---\n" + formatSummary(rows));
  return rows.every((r) => r.pass) ? 0 : 1;
}
