// strata-qa/src/lambda/core.ts
import type { AgentSeam } from "../agent.js";
import { runQa, type RunOutcome } from "../run.js";
import type { QaJob } from "./handler.js";

export interface QaConfig {
  docsRoot: string;
  timeoutMs: number;
  defaultModel: string;
  logDir: string;
  allowedModels: readonly string[];
  // Build provenance, baked in as an image ENV. Resolved by loadConfig with every
  // other env value rather than read from process.env down here, so a test can set
  // it and there is one place that knows where configuration comes from.
  gitSha?: string;
}

const LOGGED_QUESTION_CHARS = 200;

// The HTTP-free seam. The future Slack dispatcher must ACK within 3s and
// therefore cannot reuse a synchronous endpoint — it will ACK, then call this
// on the async side. Keeping HTTP types out of this module is what makes that
// a no-op change here.
export async function handleQuestion(
  job: QaJob,
  seam: AgentSeam,
  config: QaConfig,
  emit: (line: string) => void = (l) => console.log(l),
): Promise<RunOutcome> {
  const outcome = await runQa(
    {
      question: job.question,
      model: job.model ?? config.defaultModel,
      docsRoot: config.docsRoot,
      timeoutMs: config.timeoutMs,
      logDir: config.logDir,
      // The same identity the emitted line below carries, so runQa's JSONL under
      // /tmp joins to CloudWatch instead of being correlated by timestamp.
      runId: job.requestId,
      gitSha: config.gitSha,
    },
    seam,
  );

  // CloudWatch is the queryable log on Lambda; the JSONL files runQa writes go
  // to /tmp and never leave the container. Deliberately omits the answer body:
  // one line per invocation, greppable in Logs Insights.
  emit(
    JSON.stringify({
      ts: new Date().toISOString(),
      requestId: job.requestId,
      question: job.question.slice(0, LOGGED_QUESTION_CHARS),
      model: outcome.result.model,
      status: outcome.result.status,
      exitCode: outcome.exitCode,
      error: outcome.errorMessage,
      grounding: outcome.result.grounding,
      sources: outcome.result.sources.map((s) => s.path),
      docsVersion: outcome.result.docsVersion,
      durationMs: outcome.result.durationMs,
      usage: outcome.result.usage,
      gitSha: config.gitSha,
    }),
  );

  return outcome;
}
