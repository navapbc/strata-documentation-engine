import { describe, expect, test } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentRun, AgentSeam } from "./agent.js";
import { DEFAULT_MODEL, main, parseArgs, UsageError } from "./cli.js";

describe("parseArgs", () => {
  test("question with defaults", () => {
    expect(parseArgs(["how do retries work?"])).toEqual({
      command: "ask",
      question: "how do retries work?",
      model: DEFAULT_MODEL,
      docsRoot: process.cwd(),
      pretty: false,
      timeoutMs: 60_000,
    });
  });

  test("flags in any order", () => {
    const a = parseArgs(["--model", "sonnet-4", "q", "--docs-root", "/x", "--pretty"]);
    expect(a).toEqual({
      command: "ask",
      question: "q",
      model: "sonnet-4",
      docsRoot: "/x",
      pretty: true,
      timeoutMs: 60_000,
    });
  });

  test("eval subcommand", () => {
    expect(parseArgs(["eval"]).command).toBe("eval");
    expect(parseArgs(["eval", "--model", "sonnet-4"]).model).toBe("sonnet-4");
  });

  test("--timeout overrides the default (given in seconds, stored as ms)", () => {
    expect(parseArgs(["q", "--timeout", "90"]).timeoutMs).toBe(90_000);
    expect(parseArgs(["eval", "--timeout", "5"]).timeoutMs).toBe(5_000);
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
  ])("rejects %j", (argv, re) => {
    expect(() => parseArgs(argv as string[])).toThrow(re);
  });
});

describe("main", () => {
  function makeDocsRoot(): string {
    const root = mkdtempSync(join(tmpdir(), "strata-qa-cli-"));
    mkdirSync(join(root, "docs", "sources", "s"), { recursive: true });
    writeFileSync(
      join(root, "docs", "graph.json"),
      JSON.stringify({ nodes: [{ id: "a", path: "sources/s/d.md" }], edges: [] }),
    );
    writeFileSync(join(root, "docs", "INDEX.md"), "# i\n");
    writeFileSync(join(root, "docs", "sources", "s", "d.md"), "---\nverified: ok\n---\nAlpha beta gamma.\n");
    return root;
  }

  const BLOCK =
    "```json\n" +
    JSON.stringify({
      status: "answered",
      answer: "Alpha.",
      citations: [{ path: "sources/s/d.md", quote: "Alpha beta" }],
    }) +
    "\n```";

  function noisySeam(): AgentSeam {
    const finished = (text: string): AgentRun => ({
      ok: true,
      text,
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      durationMs: 5,
    });
    return {
      checkAuth: async () => true,
      listModelIds: async () => [DEFAULT_MODEL],
      supportsReadOnlyLockdown: () => true,
      ask: async () => {
        // Simulate SDK noise on both channels the contract must silence.
        console.log("sdk progress noise");
        process.stdout.write("raw stdout noise\n");
        return finished(BLOCK);
      },
      reformat: async () => finished(BLOCK),
    };
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

  test("usage error -> exit 1, message on stderr, nothing on stdout", async () => {
    let out = "";
    let err = "";
    const code = await main([], { out: (s) => (out += s), err: (s) => (err += s) }, noisySeam());
    expect(code).toBe(1);
    expect(out).toBe("");
    expect(err).toMatch(/usage/i);
  });
});
