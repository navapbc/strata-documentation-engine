import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentSeam, AgentUsage } from "./agent.js";
import { TimeoutError, withTimeout } from "./agent.js";
import { computeDocsVersion, docPath, graphPath, loadNodePaths } from "./graph.js";
import type { GroundedSource, GroundingCounts, GroundingResult } from "./grounding.js";
import { ground } from "./grounding.js";
import { appendJsonl } from "./log.js";
import { extractAnswer } from "./parse.js";
import { buildPrompt } from "./prompt.js";

// Lives here, not in an adapter: both cli.ts and lambda/handler.ts need it, and
// an adapter must never import another adapter's entrypoint module for it.
export const DEFAULT_MODEL = "gpt-5.6-luna";

export const EXIT = {
  OK: 0,
  USAGE: 1,
  AUTH: 2,
  MODEL: 3,
  DOCS: 4,
  LOCKDOWN: 5,
  PARSE: 6,
  TRANSPORT: 7,
  TIMEOUT: 8,
} as const;

export interface RunOptions {
  question: string;
  model: string;
  docsRoot: string;
  timeoutMs: number;
  // Required: a cwd-relative default here would only ever be right for the CLI,
  // and appendJsonl swallows write failures by design — so a caller that
  // inherited the wrong one would lose its logs silently rather than crash.
  // Each edge names its own writable path (cli.ts, lambda/handler.ts).
  logDir: string;
  // Run identity, both optional and supplied by the edge. Without them a log row
  // says which corpus answered (docsVersion) but not which run or which code
  // produced it, which is exactly what comparing two loop runs needs. cli.ts
  // generates a runId per question; lambda/handler.ts passes the caller's
  // requestId, so runQa's /tmp JSONL joins to the CloudWatch line.
  runId?: string;
  gitSha?: string;
}

export interface QaResult {
  schema_version: 1;
  status: "answered" | "no_match" | "low_confidence" | "error";
  answer: string | null;
  sources: GroundedSource[];
  grounding: GroundingCounts;
  model: string;
  docsVersion: string;
  usage: AgentUsage | null;
  durationMs: number | null;
}

export interface RunOutcome {
  result: QaResult;
  exitCode: number;
  errorMessage?: string;
}

const EMPTY_GROUNDING: GroundingCounts = {
  citationsTotal: 0,
  citationsResolved: 0,
  quotesVerified: 0,
  distinctDocs: 0,
  docsCited: 0,
};

// Exported for lambda/handler.ts, which has to synthesize the outcome runQa
// never got to return when the invocation wall clock cuts it off. Duplicating
// the shape there would let the two drift as QaResult grows.
export function errorResult(
  model: string,
  docsVersion: string,
  usage: AgentUsage | null,
  durationMs: number | null,
): QaResult {
  return {
    schema_version: 1,
    status: "error",
    answer: null,
    sources: [],
    grounding: { ...EMPTY_GROUNDING },
    model,
    docsVersion,
    usage,
    durationMs,
  };
}

// --- Whole-run wall clock ----------------------------------------------------
//
// `timeoutMs` bounds ONE agent call, and per-call bounds do not sum to a bound on
// the whole run: runQa can make two calls (ask, then the tool-less repair through
// seam.reformat), and an edge may run the whole thing again — lambda/handler.ts
// retries once on EXIT.AUTH. So a 90s per-call bound genuinely permits 180s+, and
// the repair only runs when ask already SUCCEEDED, which is how a 60s ask plus a
// repair hanging to its own 90s reaches 150s.
//
// Lives here rather than in either adapter because both edges need it (see
// DEFAULT_MODEL above) and neither may import the other's entrypoint for it. The
// reason each edge *wants* a ceiling differs and stays at its call site: the Lambda
// must beat its own hard kill, while the CLI is bounding a pathological question
// (NOTES.md measured one at 33 minutes) inside an eval loop.
//
// Reuses withTimeout, which races but does not cancel, so this ABANDONS the run
// rather than stopping it. Stopping it is the caller's job — the caller holds the
// only handle, via cancelActiveRuns() — and this is the one timeout source that
// leaves a run genuinely in flight.
export async function withInvocationBudget(
  work: () => Promise<RunOutcome>,
  budgetMs: number | null | undefined,
  model: string,
): Promise<RunOutcome> {
  if (typeof budgetMs !== "number") return work();
  try {
    return await withTimeout(work(), budgetMs);
  } catch (e) {
    if (!(e instanceof TimeoutError)) throw e;
    // docsVersion stays "" for the same reason runQa's own preflight bailout
    // leaves it empty: we cannot know it from out here.
    return {
      result: errorResult(model, "", null, null),
      exitCode: EXIT.TIMEOUT,
      errorMessage: `invocation exceeded its ${budgetMs}ms budget before the agent returned`,
    };
  }
}

function sumUsage(a: AgentUsage | null, b: AgentUsage | null): AgentUsage | null {
  if (!a) return b;
  if (!b) return a;
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    totalTokens: a.totalTokens + b.totalTokens,
  };
}

function refusalReason(g: GroundingResult): string {
  if (g.grounding.citationsTotal === 0) return "model found no candidate docs";
  if (g.grounding.quotesVerified === 0)
    return "no citation verified (paths unresolved or quotes not found in cited docs)";
  return (
    `partial verification: ${g.grounding.distinctDocs} of ${g.grounding.docsCited} cited docs verified ` +
    `(${g.grounding.quotesVerified} of ${g.grounding.citationsTotal} quotes)`
  );
}

// Spread into every log record. Absent rather than null when the edge has nothing
// to say: a `null` gitSha is a value a reader has to interpret, a missing key is not.
function identity(opts: RunOptions): Record<string, string> {
  return {
    ...(opts.runId ? { runId: opts.runId } : {}),
    ...(opts.gitSha ? { gitSha: opts.gitSha } : {}),
  };
}

function logQuery(opts: RunOptions, result: QaResult): void {
  appendJsonl(join(opts.logDir, "queries.jsonl"), {
    ts: new Date().toISOString(),
    ...identity(opts),
    question: opts.question,
    model: result.model,
    status: result.status,
    grounding: result.grounding,
    sources: result.sources.map((s) => s.path),
    docsVersion: result.docsVersion,
    durationMs: result.durationMs,
    usage: result.usage,
  });
}

export async function runQa(opts: RunOptions, seam: AgentSeam): Promise<RunOutcome> {
  const { question, model, docsRoot, timeoutMs, logDir } = opts;

  // Preflight bailout — docsVersion is not yet known, so it stays "".
  const fail = (exitCode: number, errorMessage: string): RunOutcome => ({
    result: errorResult(model, "", null, null),
    exitCode,
    errorMessage,
  });

  // Preflight — fail loud with a distinct exit code per failure mode.
  // A THROW from the auth/list SDK calls (e.g. a transient 5xx after auth) maps
  // to TRANSPORT so the exit-code + single-JSON contract holds; checkAuth
  // returning false is the distinct AUTH case.
  let ids: string[];
  try {
    if (!(await seam.checkAuth())) {
      return fail(EXIT.AUTH, "CURSOR_API_KEY missing or failed to authenticate");
    }
    ids = await seam.listModelIds();
  } catch (e) {
    return fail(EXIT.TRANSPORT, `preflight failed contacting the model API: ${String(e)}`);
  }
  if (!ids.includes(model)) {
    return fail(EXIT.MODEL, `model '${model}' not found; available: ${ids.join(", ")}`);
  }
  for (const rel of [join("docs", "graph.json"), join("docs", "INDEX.md"), join("docs", "sources")]) {
    if (!existsSync(join(docsRoot, rel))) {
      return fail(EXIT.DOCS, `docs root '${docsRoot}' is missing ${rel}`);
    }
  }
  // Load the citation-target set here in preflight, not at the grounding stage:
  // a malformed/truncated graph.json otherwise throws after the (expensive) model
  // call and escapes runQa as an uncaught TRANSPORT-mapped crash with no JSON
  // emitted. Catching it here keeps it a fail-fast, single-JSON EXIT.DOCS.
  let nodePaths: ReadonlySet<string>;
  try {
    nodePaths = loadNodePaths(docsRoot);
  } catch (e) {
    return fail(EXIT.DOCS, `docs graph '${graphPath(docsRoot)}' is malformed: ${String(e)}`);
  }
  if (!seam.supportsReadOnlyLockdown()) {
    return fail(EXIT.LOCKDOWN, "SDK cannot enforce read-only tool lockdown (design-blocking; see spec)");
  }
  const docsVersion = computeDocsVersion(docsRoot);

  // A live agent call (ask or reformat) that throws maps to a distinct exit code:
  // a wall-clock TimeoutError to TIMEOUT, anything else to TRANSPORT.
  const mapAgentError = (
    e: unknown,
    label: string,
    usage: AgentUsage | null,
    durationMs: number | null,
  ): RunOutcome => ({
    result: errorResult(model, docsVersion, usage, durationMs),
    ...(e instanceof TimeoutError
      ? { exitCode: EXIT.TIMEOUT, errorMessage: `${label} timed out after ${e.timeoutMs}ms` }
      : { exitCode: EXIT.TRANSPORT, errorMessage: `${label} failed: ${String(e)}` }),
  });

  // Agentic retrieval — one shot.
  let run;
  try {
    run = await seam.ask(buildPrompt(question), model, docsRoot, timeoutMs);
  } catch (e) {
    return mapAgentError(e, "agent call", null, null);
  }
  if (!run.ok || run.text === null) {
    return {
      result: errorResult(model, docsVersion, run.usage, run.durationMs),
      exitCode: EXIT.TRANSPORT,
      errorMessage: "agent run did not finish",
    };
  }

  // Parse, with one tool-less repair (never a retrieval re-run).
  let usage = run.usage;
  let parsed = extractAnswer(run.text);
  if (!parsed) {
    let repair;
    try {
      repair = await seam.reformat(run.text, model, timeoutMs);
    } catch (e) {
      return mapAgentError(e, "repair call", usage, run.durationMs);
    }
    usage = sumUsage(usage, repair.usage);
    if (repair.ok && repair.text !== null) parsed = extractAnswer(repair.text);
  }
  if (!parsed) {
    const result = errorResult(model, docsVersion, usage, run.durationMs);
    logQuery(opts, result);
    return {
      result,
      exitCode: EXIT.PARSE,
      errorMessage: "model output could not be parsed after one repair attempt",
    };
  }

  // Deterministic grounding gate. nodePaths was loaded + validated in preflight.
  const readDoc = (nodePath: string): string | null => {
    try {
      return readFileSync(docPath(docsRoot, nodePath), "utf8");
    } catch {
      return null;
    }
  };
  const gate = ground(parsed, nodePaths, readDoc);

  const result: QaResult = {
    schema_version: 1,
    status: gate.status,
    answer: gate.status === "answered" ? parsed.answer : null,
    sources: gate.sources,
    grounding: gate.grounding,
    model,
    docsVersion,
    usage,
    durationMs: run.durationMs,
  };

  logQuery(opts, result);
  if (result.status === "no_match" || result.status === "low_confidence") {
    appendJsonl(join(logDir, "refusals.jsonl"), {
      ts: new Date().toISOString(),
      ...identity(opts),
      question,
      reason: refusalReason(gate),
      // Per-citation verdicts so a refusal is diagnosable from the log alone,
      // without re-running the (expensive, non-deterministic) model call.
      citations: gate.citations,
    });
  }
  return { result, exitCode: EXIT.OK };
}
