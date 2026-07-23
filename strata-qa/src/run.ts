import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentSeam, AgentUsage } from "./agent.js";
import { TimeoutError } from "./agent.js";
import { computeDocsVersion, loadNodePaths } from "./graph.js";
import type { GroundedSource, GroundingCounts, GroundingResult } from "./grounding.js";
import { ground } from "./grounding.js";
import { appendJsonl } from "./log.js";
import { extractAnswer } from "./parse.js";
import { buildPrompt } from "./prompt.js";

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
  logDir?: string;
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
};

function errorResult(
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
  return `partial verification: ${g.grounding.quotesVerified} of ${g.grounding.citationsTotal} citations verified`;
}

function logQuery(logDir: string, question: string, result: QaResult): void {
  appendJsonl(join(logDir, "queries.jsonl"), {
    ts: new Date().toISOString(),
    question,
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
  const { question, model, docsRoot, timeoutMs } = opts;
  const logDir = opts.logDir ?? join(".logs", "qa");

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
  let nodePaths: Set<string>;
  try {
    nodePaths = loadNodePaths(docsRoot);
  } catch (e) {
    return fail(EXIT.DOCS, `docs graph '${join(docsRoot, "docs", "graph.json")}' is malformed: ${String(e)}`);
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
  ): RunOutcome =>
    e instanceof TimeoutError
      ? {
          result: errorResult(model, docsVersion, usage, durationMs),
          exitCode: EXIT.TIMEOUT,
          errorMessage: `${label} timed out after ${e.timeoutMs}ms`,
        }
      : {
          result: errorResult(model, docsVersion, usage, durationMs),
          exitCode: EXIT.TRANSPORT,
          errorMessage: `${label} failed: ${String(e)}`,
        };

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
    logQuery(logDir, question, result);
    return {
      result,
      exitCode: EXIT.PARSE,
      errorMessage: "model output could not be parsed after one repair attempt",
    };
  }

  // Deterministic grounding gate. nodePaths was loaded + validated in preflight.
  const readDoc = (nodePath: string): string | null => {
    try {
      return readFileSync(join(docsRoot, "docs", nodePath), "utf8");
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

  logQuery(logDir, question, result);
  if (result.status === "no_match" || result.status === "low_confidence") {
    appendJsonl(join(logDir, "refusals.jsonl"), {
      ts: new Date().toISOString(),
      question,
      reason: refusalReason(gate),
    });
  }
  return { result, exitCode: EXIT.OK };
}
