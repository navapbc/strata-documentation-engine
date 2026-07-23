#!/usr/bin/env node
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import type { AgentSeam } from "./agent.js";
import { createCursorSeam } from "./agent.js";
import { runEval } from "./eval.js";
import type { QaResult } from "./run.js";
import { EXIT, runQa } from "./run.js";

export const DEFAULT_MODEL = "gpt-5.6-luna";

export const DEFAULT_TIMEOUT_MS = 60_000;

export interface CliArgs {
  command: "ask" | "eval";
  question: string | null;
  model: string;
  docsRoot: string;
  pretty: boolean;
  timeoutMs: number;
}

export class UsageError extends Error {}

const USAGE = `usage: strata-qa "<question>" [--model <id>] [--docs-root <path>] [--timeout <seconds>] [--pretty]
       strata-qa eval [--model <id>] [--docs-root <path>] [--timeout <seconds>]
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
    pretty: false,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--model") args.model = argv[++i] ?? fail("--model needs a value");
    else if (a === "--docs-root") args.docsRoot = argv[++i] ?? fail("--docs-root needs a value");
    else if (a === "--timeout") {
      const raw = argv[++i] ?? fail("--timeout needs a value");
      const seconds = Number(raw);
      if (!Number.isFinite(seconds) || seconds <= 0) fail("--timeout needs a positive number of seconds");
      args.timeoutMs = seconds * 1000;
    } else if (a === "--pretty") args.pretty = true;
    else if (a.startsWith("--")) fail(`unknown flag ${a}`);
    else positional.push(a);
  }
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

export async function main(argv: string[], io: Io, seam: AgentSeam = createCursorSeam()): Promise<number> {
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
      { fixturesPath, model: args.model, docsRoot: args.docsRoot, timeoutMs: args.timeoutMs },
      seam,
      io.out,
    );
  }

  const restore = silenceStdout(io.err);
  let outcome;
  try {
    outcome = await runQa(
      {
        question: args.question as string,
        model: args.model,
        docsRoot: args.docsRoot,
        timeoutMs: args.timeoutMs,
      },
      seam,
    );
  } finally {
    // On a timeout the underlying Agent.prompt is still running (the wall-clock
    // bound rejects but cannot cancel it) and may emit late progress to stdout.
    // Leave stdout rerouted to stderr in that case so an orphaned write can never
    // corrupt our single JSON line; the process exits moments later. io.out writes
    // to the real stdout captured before silencing, so the result still lands there.
    // Every other outcome means the agent settled, so restoring is safe.
    if (outcome?.exitCode !== EXIT.TIMEOUT) restore();
  }

  io.out(JSON.stringify(outcome.result) + "\n");
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
