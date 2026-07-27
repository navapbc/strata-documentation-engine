import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import type { AgentSeam } from "./agent.js";
import type { Io, MainDeps } from "./cli.js";
import { main, parseArgs } from "./cli.js";
import { BLOCK, fakeSeam, finished, makeDocsRoot as makeCorpus } from "./fixtures.js";
import { DEFAULT_MODEL, EXIT } from "./run.js";

describe("parseArgs", () => {
  test("question with defaults", () => {
    expect(parseArgs(["how do retries work?"])).toEqual({
      command: "ask",
      question: "how do retries work?",
      model: DEFAULT_MODEL,
      docsRoot: process.cwd(),
      logDir: join(process.cwd(), ".logs", "qa"),
      pretty: false,
      timeoutMs: 60_000,
      maxTotalMs: null,
    });
  });

  test("flags in any order", () => {
    const a = parseArgs(["--model", "sonnet-4", "q", "--docs-root", "/x", "--pretty"]);
    expect(a).toEqual({
      command: "ask",
      question: "q",
      model: "sonnet-4",
      docsRoot: "/x",
      logDir: join("/x", ".logs", "qa"),
      pretty: true,
      timeoutMs: 60_000,
      maxTotalMs: null,
    });
  });

  // The logs follow the corpus, not the shell's cwd: the documented invocation is
  // `--docs-root ..` from strata-qa/, which under a cwd-relative default wrote to
  // strata-qa/.logs/qa rather than the repo-root path the spec describes.
  test("the default log dir tracks --docs-root wherever it appears", () => {
    expect(parseArgs(["q", "--docs-root", "/corpus"]).logDir).toBe(join("/corpus", ".logs", "qa"));
    // Resolved after the whole argv is read, so order cannot matter.
    expect(parseArgs(["--docs-root", "/corpus", "q"]).logDir).toBe(join("/corpus", ".logs", "qa"));
  });

  test("--log-dir wins over the docs-root default, in either order", () => {
    expect(parseArgs(["q", "--docs-root", "/corpus", "--log-dir", "/exp/3"]).logDir).toBe("/exp/3");
    expect(parseArgs(["q", "--log-dir", "/exp/3", "--docs-root", "/corpus"]).logDir).toBe("/exp/3");
  });

  test("eval subcommand", () => {
    expect(parseArgs(["eval"]).command).toBe("eval");
    expect(parseArgs(["eval", "--model", "sonnet-4"]).model).toBe("sonnet-4");
  });

  test("--timeout overrides the default (given in seconds, stored as ms)", () => {
    expect(parseArgs(["q", "--timeout", "90"]).timeoutMs).toBe(90_000);
    expect(parseArgs(["eval", "--timeout", "5"]).timeoutMs).toBe(5_000);
  });

  // Off unless asked for: --timeout already bounds each agent call, and a default
  // ceiling here would silently cut off runs that are legitimately slow today.
  test("--max-total-time is off by default and given in seconds", () => {
    expect(parseArgs(["q"]).maxTotalMs).toBeNull();
    expect(parseArgs(["q", "--max-total-time", "300"]).maxTotalMs).toBe(300_000);
  });

  test.each([
    [[], /question .*required/i],
    [["a", "b"], /one question/i],
    [["--model"], /--model needs a value/],
    [["--bogus", "q"], /unknown flag/],
    [["eval", "extra"], /one question|unexpected/i],
    [["q", "--timeout"], /--timeout needs a value/],
    [["q", "--timeout", "0"], /--timeout .*positive/i],
    [["q", "--timeout", "-3"], /--timeout .*positive/i],
    [["q", "--timeout", "abc"], /--timeout .*positive/i],
    [["q", "--log-dir"], /--log-dir needs a value/],
    [["q", "--max-total-time"], /--max-total-time needs a value/],
    [["q", "--max-total-time", "0"], /--max-total-time .*positive/i],
    [["q", "--max-total-time", "abc"], /--max-total-time .*positive/i],
  ])("rejects %j", (argv, re) => {
    expect(() => parseArgs(argv as string[])).toThrow(re);
  });
});

describe("main", () => {
  const makeDocsRoot = () => makeCorpus({ prefix: "strata-qa-cli-" });

  function noisySeam(): AgentSeam {
    return fakeSeam({
      ask: async () => {
        // Simulate SDK noise on both channels the contract must silence.
        console.log("sdk progress noise");
        process.stdout.write("raw stdout noise\n");
        return finished(BLOCK);
      },
    });
  }

  test("stdout carries exactly one JSON object; noise lands on stderr", async () => {
    const root = makeDocsRoot();
    let out = "";
    let err = "";
    const code = await main(
      ["q", "--docs-root", root],
      { out: (s) => (out += s), err: (s) => (err += s) },
      noisySeam(),
    );
    expect(code).toBe(0);
    const parsed = JSON.parse(out); // throws if stdout is not exactly one JSON document
    expect(parsed.status).toBe("answered");
    expect(parsed.schema_version).toBe(1);
    expect(err).toContain("sdk progress noise");
    expect(err).toContain("raw stdout noise");
  });

  test("--pretty adds a human summary on stderr only", async () => {
    const root = makeDocsRoot();
    let out = "";
    let err = "";
    await main(
      ["q", "--docs-root", root, "--pretty"],
      { out: (s) => (out += s), err: (s) => (err += s) },
      noisySeam(),
    );
    expect(() => JSON.parse(out)).not.toThrow();
    expect(err).toContain("status: answered");
    expect(err).toContain("tokens");
  });

  // The reason this suite needed a seam at all: main() owns the log path, so every
  // test that called it appended a fake-seam row to the developer's real
  // strata-qa/.logs/qa (131 lines of them before this landed, NOTES.md:93).
  test("logs land under the corpus, not the process cwd", async () => {
    const root = makeDocsRoot();
    // Compared before/after rather than asserted absent: a developer's own
    // `npm run qa` from strata-qa/ legitimately writes here (cwd IS the docs root
    // when --docs-root is omitted), so presence is not the test's business —
    // whether THIS run appended to it is.
    const cwdLog = join(process.cwd(), ".logs", "qa", "queries.jsonl");
    const before = existsSync(cwdLog) ? readFileSync(cwdLog, "utf8") : null;
    await main(["q", "--docs-root", root], { out: () => {}, err: () => {} }, noisySeam());
    expect(existsSync(join(root, ".logs", "qa", "queries.jsonl"))).toBe(true);
    expect(existsSync(cwdLog) ? readFileSync(cwdLog, "utf8") : null).toBe(before);
  });

  test("--log-dir redirects the JSONL, so one experiment cannot bleed into another", async () => {
    const root = makeDocsRoot();
    const logDir = join(root, "exp-3");
    await main(["q", "--docs-root", root, "--log-dir", logDir], { out: () => {}, err: () => {} }, noisySeam());
    expect(existsSync(join(logDir, "queries.jsonl"))).toBe(true);
    expect(existsSync(join(root, ".logs", "qa", "queries.jsonl"))).toBe(false);
  });

  // The CLI analogue of the handler's invocation budget: --timeout bounds one agent
  // call, and runQa can make two, so a question can outlive --timeout without any
  // single call doing so. NOTES.md measured one at 33 minutes inside an eval loop.
  test("--max-total-time cuts off a question that outlives it", async () => {
    const root = makeDocsRoot();
    let out = "";
    let err = "";
    const seam = fakeSeam({ ask: () => new Promise(() => {}) }); // never settles
    const code = await main(
      ["q", "--docs-root", root, "--max-total-time", "0.05"],
      { out: (s) => (out += s), err: (s) => (err += s) },
      seam,
    );
    expect(code).toBe(EXIT.TIMEOUT);
    expect(JSON.parse(out).status).toBe("error");
    expect(err).toMatch(/exceeded its 50ms budget/);
  });

  test("a question that finishes inside its budget is untouched", async () => {
    const root = makeDocsRoot();
    let out = "";
    const code = await main(
      ["q", "--docs-root", root, "--max-total-time", "30"],
      { out: (s) => (out += s), err: () => {} },
      noisySeam(),
    );
    expect(code).toBe(0);
    expect(JSON.parse(out).status).toBe("answered");
  });

  test("stdout's object and the log row share a runId", async () => {
    const root = makeDocsRoot();
    let out = "";
    await main(["q", "--docs-root", root], { out: (s) => (out += s), err: () => {} }, noisySeam(), {
      gitSha: () => "abc1234",
    });
    const runId = JSON.parse(out).runId;
    expect(runId).toMatch(/[0-9a-f-]{36}/);
    const row = JSON.parse(readFileSync(join(root, ".logs", "qa", "queries.jsonl"), "utf8").trim());
    expect(row.runId).toBe(runId);
    expect(row.gitSha).toBe("abc1234");
  });

  // gitSha is provenance for comparing log rows across code versions, so it belongs
  // in the log and not in the answer object — the same split the handler makes
  // (core.ts logs it; toHttpResponse's body does not carry it).
  test("gitSha stays out of the stdout object", async () => {
    const root = makeDocsRoot();
    let out = "";
    await main(["q", "--docs-root", root], { out: (s) => (out += s), err: () => {} }, noisySeam(), {
      gitSha: () => "abc1234",
    });
    expect("gitSha" in JSON.parse(out)).toBe(false);
  });

  test("an unresolvable gitSha is simply absent, never a crash", async () => {
    const root = makeDocsRoot();
    let out = "";
    const code = await main(
      ["q", "--docs-root", root],
      { out: (s) => (out += s), err: () => {} },
      noisySeam(),
      { gitSha: () => undefined },
    );
    expect(code).toBe(0);
    const row = JSON.parse(readFileSync(join(root, ".logs", "qa", "queries.jsonl"), "utf8").trim());
    expect("gitSha" in row).toBe(false);
  });

  // agent.ts's runBounded cancels its own per-call timeout, so a leftover run means
  // that cancel did not work (supports("cancel") false, cancel() threw, or the wall
  // clock fired before send() yielded a handle at all). The handler answers that with
  // cancelActiveRuns() and recycles on failure; the CLI has no container to recycle,
  // so what it owes the operator is a second attempt and an honest report.
  describe("a run left in flight after the budget abandoned it", () => {
    const timedOut = () => fakeSeam({ ask: () => new Promise(() => {}) });
    const budgeted = (deps: MainDeps, root: string, io: Io) =>
      main(["q", "--docs-root", root, "--max-total-time", "0.05"], io, timedOut(), deps);

    // Leaving stdout silenced is deliberate in production when a run survives, so
    // these tests must undo it themselves or the hijack outlives the test that
    // caused it and later console.log calls vanish into a dead closure.
    const pristine = { log: console.log, write: process.stdout.write };
    afterEach(() => {
      console.log = pristine.log;
      process.stdout.write = pristine.write;
    });

    test("is cancelled, and the success is reported on stderr", async () => {
      const root = makeDocsRoot();
      let err = "";
      let cancelCalls = 0;
      // Drops to zero on a successful cancel, as cancelActiveRuns does for real:
      // that is what lets stdout be restored.
      let inFlight = 1;
      const code = await budgeted(
        {
          activeRuns: () => inFlight,
          cancelRuns: async () => {
            cancelCalls += 1;
            inFlight = 0;
            return true;
          },
        },
        root,
        { out: () => {}, err: (s) => (err += s) },
      );
      expect(code).toBe(EXIT.TIMEOUT);
      expect(cancelCalls).toBe(1);
      expect(err).toMatch(/cancelled/i);
    });

    test("is reported as still running when it cannot be cancelled", async () => {
      const root = makeDocsRoot();
      let err = "";
      const code = await budgeted({ activeRuns: () => 1, cancelRuns: async () => false }, root, {
        out: () => {},
        err: (s) => (err += s),
      });
      expect(code).toBe(EXIT.TIMEOUT);
      // The operator has to know the process is still spending tokens; that is the
      // whole signal, and on the CLI it is theirs to act on (Ctrl-C).
      expect(err).toMatch(/could not be cancelled|still running/i);
    });

    test("does not try to cancel when nothing is in flight", async () => {
      const root = makeDocsRoot();
      let cancelCalls = 0;
      await main(["q", "--docs-root", root], { out: () => {}, err: () => {} }, noisySeam(), {
        activeRuns: () => 0,
        cancelRuns: async () => (cancelCalls += 1) > 0,
      });
      expect(cancelCalls).toBe(0);
    });
  });

  test("usage error -> exit 1, message on stderr, nothing on stdout", async () => {
    let out = "";
    let err = "";
    const code = await main([], { out: (s) => (out += s), err: (s) => (err += s) }, noisySeam());
    expect(code).toBe(1);
    expect(out).toBe("");
    expect(err).toMatch(/usage/i);
  });
});
