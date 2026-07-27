import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type { AgentSeam } from "./agent.js";
import { activeRunCount, cancelActiveRuns } from "./agent.js";
import type { QaResult } from "./run.js";
import { runQa, withInvocationBudget } from "./run.js";

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

export interface EvalOptions {
  fixturesPath: string;
  model: string;
  docsRoot: string;
  timeoutMs: number;
  logDir: string;
  // Per FIXTURE, not per loop: it is the same "one whole question" bound the ask
  // path and the Lambda apply, and a pathological question is what it exists to cut
  // off (NOTES.md measured one at 33 minutes inside this very loop).
  maxTotalMs?: number | null;
  gitSha?: string;
}

// Injected for the same reason as cli.ts's MainDeps: agent.ts's active-run set is
// module state, and a test must be able to describe an orphan without creating one.
export interface EvalDeps {
  activeRuns?: () => number;
  cancelRuns?: () => Promise<boolean>;
  newRunId?: () => string;
}

export async function runEval(
  opts: EvalOptions,
  seam: AgentSeam,
  write: (s: string) => void,
  deps: EvalDeps = {},
): Promise<number> {
  const { activeRuns = activeRunCount, cancelRuns = cancelActiveRuns, newRunId = randomUUID } = deps;
  const fixtures: Fixture[] = JSON.parse(readFileSync(opts.fixturesPath, "utf8"));
  const rows: EvalRow[] = [];
  let abortedAfter: number | null = null;

  for (const f of fixtures) {
    const { result } = await withInvocationBudget(
      () =>
        runQa(
          {
            question: f.question,
            model: opts.model,
            docsRoot: opts.docsRoot,
            timeoutMs: opts.timeoutMs,
            logDir: opts.logDir,
            // Per fixture, so a row in the log names the one question that produced it.
            runId: newRunId(),
            gitSha: opts.gitSha,
          },
          seam,
        ),
      opts.maxTotalMs,
      opts.model,
    );
    const row = scoreFixture(f, result);
    rows.push(row);
    write(`${row.pass ? "PASS" : "FAIL"}  expect=${row.expect}  got=${row.status}  ${row.question}\n`);

    // Between fixtures is the only place this loop can act. A run still in flight
    // here survived agent.ts's own cancel, and unlike the ask path — which returns
    // to a process that is about to exit — this loop would keep it company for
    // every remaining fixture while it spends tokens on an answer nobody reads.
    // Cancelling is the Lambda's container recycle in the only form available here;
    // when even that fails, not scheduling more work is what is left.
    if (activeRuns() > 0 && !(await cancelRuns())) {
      abortedAfter = rows.length;
      break;
    }
  }

  if (abortedAfter !== null) {
    write(
      `---\nABORTED after ${abortedAfter}/${fixtures.length}: a run could not be cancelled and is still ` +
        `spending tokens in this process; the remaining fixtures were not attempted\n`,
    );
  }
  write("---\n" + formatSummary(rows));
  // An abort is a failure of the run itself, however the scored rows came out.
  return abortedAfter === null && rows.every((r) => r.pass) ? 0 : 1;
}
