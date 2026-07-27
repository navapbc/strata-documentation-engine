#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import type { AgentSeam } from "./agent.js";
import { activeRunCount, cancelActiveRuns, createCursorSeam } from "./agent.js";
import { runEval } from "./eval.js";
import type { QaResult } from "./run.js";
import { DEFAULT_MODEL, EXIT, runQa, withInvocationBudget } from "./run.js";

export const DEFAULT_TIMEOUT_MS = 60_000;

// The CLI's writable path, owned here rather than defaulted inside runQa — the
// Lambda's is /tmp/qa and neither edge should inherit the other's.
//
// Anchored at the docs root, not the process cwd. The documented invocation is
// `--docs-root ..` from strata-qa/, so a cwd-relative default put the logs in
// strata-qa/.logs/qa rather than the repo-root path the spec describes — and made
// every cli.test.ts run that calls main() append a fake-seam row there.
export function defaultLogDir(docsRoot: string): string {
  return join(docsRoot, ".logs", "qa");
}

export interface CliArgs {
  command: "ask" | "eval";
  question: string | null;
  model: string;
  docsRoot: string;
  logDir: string;
  pretty: boolean;
  timeoutMs: number;
  // Whole-run ceiling across ask + repair, or null for none. Off by default:
  // --timeout already bounds each agent call, so a default here would cut off runs
  // that are legitimately slow today.
  maxTotalMs: number | null;
}

export class UsageError extends Error {}

const USAGE = `usage: strata-qa "<question>" [--model <id>] [--docs-root <path>] [--log-dir <path>]
                      [--timeout <seconds>] [--max-total-time <seconds>] [--pretty]
       strata-qa eval [--model <id>] [--docs-root <path>] [--log-dir <path>]
                      [--timeout <seconds>] [--max-total-time <seconds>]

  --timeout          bounds ONE agent call (default 60); runQa can make two
  --max-total-time   bounds a whole question, ask + repair together (default none);
                     in eval it applies per fixture
  --log-dir          JSONL destination (default <docs-root>/.logs/qa)
`;

function fail(message: string): never {
  throw new UsageError(message);
}

export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    command: "ask",
    question: null,
    model: DEFAULT_MODEL,
    docsRoot: process.cwd(),
    // A coherent value rather than a sentinel: it is already correct for the default
    // docs root, so the re-resolution below is a refinement and not the one line
    // standing between a future early return and an empty log path.
    logDir: defaultLogDir(process.cwd()),
    pretty: false,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    maxTotalMs: null,
  };
  // Held separately so the docs-root default can be resolved after the whole argv
  // is read: --log-dir and --docs-root may appear in either order.
  let logDir: string | null = null;
  const seconds = (flag: string, raw: string | undefined): number => {
    const value = Number(raw ?? fail(`${flag} needs a value`));
    if (!Number.isFinite(value) || value <= 0) fail(`${flag} needs a positive number of seconds`);
    return value * 1000;
  };
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--model") args.model = argv[++i] ?? fail("--model needs a value");
    else if (a === "--docs-root") args.docsRoot = argv[++i] ?? fail("--docs-root needs a value");
    else if (a === "--log-dir") logDir = argv[++i] ?? fail("--log-dir needs a value");
    else if (a === "--timeout") args.timeoutMs = seconds("--timeout", argv[++i]);
    else if (a === "--max-total-time") args.maxTotalMs = seconds("--max-total-time", argv[++i]);
    else if (a === "--pretty") args.pretty = true;
    else if (a.startsWith("--")) fail(`unknown flag ${a}`);
    else positional.push(a);
  }
  args.logDir = logDir ?? defaultLogDir(args.docsRoot);
  if (positional[0] === "eval") {
    if (positional.length > 1) fail("eval takes no question — exactly one question or 'eval', unexpected extra argument");
    args.command = "eval";
    return args;
  }
  if (positional.length === 0) fail("a question is required");
  if (positional.length > 1) fail("pass exactly one question (quote it)");
  args.question = positional[0];
  return args;
}

export interface Io {
  out: (s: string) => void;
  err: (s: string) => void;
}

// Injected seams, mirroring lambda/handler.ts's HandleEventDeps. Every one has a
// real default; tests override so they neither shell out to git nor depend on
// agent.ts's module-level active-run set.
export interface MainDeps {
  cancelRuns?: () => Promise<boolean>;
  activeRuns?: () => number;
  gitSha?: () => string | undefined;
  newRunId?: () => string;
}

// Which code produced a log row. `--always --dirty` in one call rather than
// rev-parse: during a retrieval-tuning loop the interesting edits are uncommitted,
// so a bare sha would label two materially different runs identically.
//
// STRATA_QA_GIT_SHA wins when set — the same variable the image bakes in
// (Dockerfile), so a row's provenance field means the same thing at both edges.
function resolveGitSha(): string | undefined {
  const fromEnv = process.env.STRATA_QA_GIT_SHA?.trim();
  if (fromEnv) return fromEnv;
  try {
    // stdio: git's own stderr must not leak into our stdout contract.
    const sha = execFileSync("git", ["describe", "--always", "--dirty"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return sha || undefined;
  } catch {
    // Not a checkout, or no git on PATH. Provenance is a nicety; absence is fine.
    return undefined;
  }
}

// The stdout contract: exactly one JSON object per invocation. The SDK's local
// runtime may print progress to console.* or process.stdout directly; both are
// rerouted to stderr for the duration of the run.
function silenceStdout(err: (s: string) => void): () => void {
  const original = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
    write: process.stdout.write.bind(process.stdout),
  };
  const toErr = (...parts: unknown[]) => err(parts.map(String).join(" ") + "\n");
  console.log = toErr;
  console.info = toErr;
  console.warn = toErr;
  console.error = toErr;
  process.stdout.write = ((chunk: string | Uint8Array) => {
    err(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
    return true;
  }) as typeof process.stdout.write;
  return () => {
    console.log = original.log;
    console.info = original.info;
    console.warn = original.warn;
    console.error = original.error;
    process.stdout.write = original.write;
  };
}

function prettySummary(r: QaResult): string {
  const lines: string[] = [
    `status: ${r.status}`,
    ...(r.answer !== null ? [`answer: ${r.answer}`] : []),
    ...(r.sources.length ? ["sources:"] : []),
    ...r.sources.map((s) => `  - ${s.path} (verified: ${s.verified})`),
    `grounding: ${r.grounding.distinctDocs}/${r.grounding.docsCited} cited doc(s) verified, ${r.grounding.quotesVerified}/${r.grounding.citationsTotal} quotes matched`,
    `model: ${r.model}  docs: ${r.docsVersion.slice(0, 12)}`,
    `cost: ${r.usage?.totalTokens ?? "?"} tokens  latency: ${r.durationMs ?? "?"} ms`,
  ];
  return lines.join("\n") + "\n";
}

export async function main(
  argv: string[],
  io: Io,
  seam: AgentSeam = createCursorSeam(),
  deps: MainDeps = {},
): Promise<number> {
  const {
    cancelRuns = cancelActiveRuns,
    activeRuns = activeRunCount,
    gitSha = resolveGitSha,
    newRunId = randomUUID,
  } = deps;
  let args: CliArgs;
  try {
    args = parseArgs(argv);
  } catch (e) {
    io.err(`${e instanceof Error ? e.message : String(e)}\n${USAGE}`);
    return EXIT.USAGE;
  }

  if (args.command === "eval") {
    const fixturesPath = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "golden.json");
    return runEval(
      {
        fixturesPath,
        model: args.model,
        docsRoot: args.docsRoot,
        timeoutMs: args.timeoutMs,
        logDir: args.logDir,
        maxTotalMs: args.maxTotalMs,
        gitSha: gitSha(),
      },
      seam,
      io.out,
      // The same seams as the ask path. runEval calls newRunId once per fixture
      // rather than once per process, which is why the id is minted down there.
      { activeRuns, cancelRuns, newRunId },
    );
  }

  const runId = newRunId();
  const restore = silenceStdout(io.err);
  let outcome;
  try {
    // The budget wraps runQa as a whole, because that is the unit --max-total-time
    // names: ask plus the repair call runQa may add on top of it.
    outcome = await withInvocationBudget(
      () =>
        runQa(
          {
            question: args.question as string,
            model: args.model,
            docsRoot: args.docsRoot,
            timeoutMs: args.timeoutMs,
            logDir: args.logDir,
            runId,
            gitSha: gitSha(),
          },
          seam,
        ),
      args.maxTotalMs,
      args.model,
    );
  } finally {
    // Anything still in flight is a run whose own cancel did not work, or one the
    // budget above abandoned before send() yielded a handle. Try to stop it — the
    // handler's EXIT.TIMEOUT branch does exactly this, and here it matters because
    // the process may live on for a whole eval loop while the orphan keeps spending
    // (~190k tokens a question, NOTES.md).
    //
    // Asked directly of the agent module rather than inferred from EXIT.TIMEOUT:
    // since runs became cancellable most timeouts leave nothing behind at all.
    if (activeRuns() > 0) {
      const stopped = await cancelRuns();
      io.err(
        stopped
          ? "note: the abandoned agent run was cancelled\n"
          : "warning: the abandoned agent run could not be cancelled and is still running; " +
              "it will keep spending tokens until this process exits\n",
      );
    }
    // A run that is still going may emit late progress to stdout, which would corrupt
    // our single JSON line, so the silencing stays in place. io.out writes to the real
    // stdout captured before silencing, so the result lands there either way.
    if (activeRuns() === 0) restore();
  }

  // runId rides alongside the result rather than inside QaResult, the same way the
  // handler attaches its requestId in toHttpResponse: it identifies the run, it is
  // not part of the answer. gitSha deliberately stays log-only — provenance is for
  // comparing rows after the fact, not for the caller reading one answer.
  io.out(JSON.stringify({ ...outcome.result, runId }) + "\n");
  if (outcome.errorMessage) io.err(`error: ${outcome.errorMessage}\n`);
  if (args.pretty) io.err(prettySummary(outcome.result));
  return outcome.exitCode;
}

// Real entrypoint. True under `tsx src/cli.ts` and `node dist/cli.js`; false when
// vitest imports this module (argv[1] is the vitest binary), so tests never exit.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Bind the real stdout writer now, before main's silenceStdout can reroute the
  // global process.stdout.write. This keeps io.out a stable sink to the true
  // stdout even while silencing is active (the timeout path never restores it).
  const realStdoutWrite = process.stdout.write.bind(process.stdout);
  main(process.argv.slice(2), {
    out: (s) => {
      realStdoutWrite(s);
    },
    err: (s) => process.stderr.write(s),
  })
    .then((code) => process.exit(code))
    // Backstop: any unexpected throw still exits non-zero (never a silent unhandled
    // rejection), preserving the "operational failures exit non-zero" contract.
    .catch((e) => {
      process.stderr.write(`fatal: ${String(e)}\n`);
      process.exit(EXIT.TRANSPORT);
    });
}
