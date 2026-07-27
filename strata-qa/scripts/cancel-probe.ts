// Live probe for @cursor/sdk 1.0.24 run cancellation. Run from strata-qa/:
//   npx tsx scripts/cancel-probe.ts
// Everything prints to stderr; this is throwaway evidence, not product code
// (same contract as scripts/smoke.ts). Findings get recorded in NOTES.md.
//
// The question this answers: handler.ts poisons and recycles the Lambda container
// after a timeout because `withTimeout` is a Promise.race that abandons, rather
// than cancels, the underlying agent run. If a run can actually be cancelled, that
// whole mechanism can go.
//
// Three things must all hold for the refactor to be worth doing:
//   [A] agent.send() hands back a Run handle *before* the run finishes, so there is
//       something to cancel while it is still going.
//   [B] run.supports("cancel") is true for a LOCAL run (cancelRun may be cloud-only).
//   [C] cancel() actually kills the child process tree. A status flip to "cancelled"
//       while cursor-agent keeps burning tokens would be strictly worse than today:
//       we would have dropped the recycle that currently contains the orphan.
import { Agent } from "@cursor/sdk";
import type { AgentModeOption, ModelSelection } from "@cursor/sdk";
import { execFileSync } from "node:child_process";

const MODEL: ModelSelection = { id: process.env.PROBE_MODEL ?? "gpt-5.6-luna" };
const READ_ONLY_MODE: AgentModeOption = "plan";
const REPO_ROOT = process.cwd() + "/..";
// Long enough that the run is still going when we cancel: answerable questions
// measured 7-14s end to end.
const CANCEL_AFTER_MS = Number(process.env.PROBE_CANCEL_AFTER_MS ?? 4000);
const SETTLE_MS = 4000;

// Every descendant of this process, walked by ppid rather than matched by name.
// A name filter is worthless here: the first version of this probe grepped for
// "cursor-agent" and reported zero processes even mid-run, which says the pattern
// was wrong, not that nothing was spawned. Walking the tree cannot miss a child
// whatever the SDK decides to call it.
function descendants(): string[] {
  try {
    const out = execFileSync("ps", ["-Ao", "pid=,ppid=,comm="], { encoding: "utf8" });
    const rows = out
      .split("\n")
      .map((l) => l.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/))
      .filter((m): m is RegExpMatchArray => m !== null)
      .map((m) => ({ pid: Number(m[1]), ppid: Number(m[2]), comm: m[3] }));

    const found: string[] = [];
    let frontier = [process.pid];
    while (frontier.length) {
      const next: number[] = [];
      for (const row of rows) {
        if (frontier.includes(row.ppid)) {
          found.push(`${row.pid} ${row.comm}`);
          next.push(row.pid);
        }
      }
      frontier = next;
    }
    return found;
  } catch {
    return ["<ps failed>"];
  }
}

function report(label: string): number {
  const procs = descendants();
  console.error(`    [ps] ${label}: ${procs.length} descendant(s)${procs.length ? " -> " + procs.join(" | ") : ""}`);
  return procs.length;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.error("[0] baseline");
  const baseline = report("before create");

  const agent = await Agent.create({
    model: MODEL,
    apiKey: process.env.CURSOR_API_KEY,
    mode: READ_ONLY_MODE,
    local: { cwd: REPO_ROOT },
  });
  console.error("[1] Agent.create ok, agentId:", agent.agentId);

  // The behavioral test for "did the work actually stop", independent of process
  // topology: count agent activity either side of cancel(). A status flip with
  // events still arriving afterwards means the run was abandoned, not cancelled.
  let events = 0;
  let cancelledAt = Number.POSITIVE_INFINITY;
  let eventsAfterCancel = 0;
  let lastEventAt = 0;
  const tick = () => {
    events++;
    lastEventAt = Date.now();
    if (lastEventAt > cancelledAt) eventsAfterCancel++;
  };

  // [A] Does send() return before the run completes?
  const t0 = Date.now();
  const run = await agent.send(
    "Read docs/graph.json and docs/INDEX.md, then read every doc under docs/sources/ and " +
      "write a detailed comparison of how each source handles authentication.",
    { model: MODEL, mode: READ_ONLY_MODE, onStep: tick, onDelta: tick },
  );
  const handleMs = Date.now() - t0;
  console.error(`[A] send() returned a Run in ${handleMs}ms  id=${run.id}  status=${run.status}`);
  console.error(`[A] handle arrived before completion: ${run.status === "running" ? "YES" : "NO (status=" + run.status + ")"}`);

  // [B] Is cancel supported on this (local) run?
  const supportsCancel = run.supports("cancel");
  console.error(
    `[B] run.supports("cancel") = ${supportsCancel}` +
      (supportsCancel ? "" : `  reason: ${run.unsupportedReason("cancel")}`),
  );
  console.error(`[B] supports("stream")=${run.supports("stream")} supports("wait")=${run.supports("wait")}`);

  const statuses: string[] = [];
  run.onDidChangeStatus((s) => statuses.push(s));

  await sleep(CANCEL_AFTER_MS);
  const during = report(`after ${CANCEL_AFTER_MS}ms of running`);

  if (!supportsCancel) {
    console.error("[C] SKIPPED — cancel unsupported; the recycle in handler.ts must stay.");
    agent.close();
    return;
  }

  const eventsBeforeCancel = events;
  console.error(`[C] agent events before cancel: ${eventsBeforeCancel}`);

  // [C] Does cancel() reap the process tree and stop the work?
  const t1 = Date.now();
  cancelledAt = Date.now();
  await run.cancel();
  console.error(`[C] cancel() resolved in ${Date.now() - t1}ms  status=${run.status}`);

  await sleep(SETTLE_MS);
  const after = report(`${SETTLE_MS}ms after cancel`);
  console.error(
    `[C] agent events after cancel: ${eventsAfterCancel}` +
      (eventsAfterCancel ? ` (last ${Date.now() - lastEventAt}ms ago — WORK CONTINUED)` : " (silent — work stopped)"),
  );
  console.error(`[C] status transitions observed: ${JSON.stringify(statuses)}`);
  console.error(`[C] final run.status = ${run.status}`);

  // What does wait() do on a cancelled run? handler.ts needs to know whether to
  // expect a rejection or a terminal RunResult.
  try {
    const settled = await run.wait();
    console.error(`[C] wait() after cancel resolved: status=${settled.status} usage=${JSON.stringify(settled.usage)}`);
  } catch (e) {
    console.error(`[C] wait() after cancel REJECTED: ${String(e).slice(0, 200)}`);
  }

  agent.close();
  await sleep(1000);
  const afterClose = report("after agent.close()");

  console.error("\n=== VERDICT ===");
  console.error(`  [A] handle before completion: ${run.status !== "finished" || handleMs < 3000 ? "PASS" : "CHECK"} (${handleMs}ms)`);
  console.error(`  [B] cancel supported locally: ${supportsCancel ? "PASS" : "FAIL"}`);
  console.error(`  [C] processes: baseline=${baseline} during=${during} after=${after} afterClose=${afterClose}`);
  if (during === baseline) {
    console.error("      INCONCLUSIVE — no extra descendant even mid-run, so this signal proves nothing");
  } else {
    console.error(`      ${after <= baseline ? "PASS — back to baseline" : "FAIL — orphan survived cancel()"}`);
  }
  console.error(`  [C] events: ${eventsBeforeCancel} before cancel, ${eventsAfterCancel} after`);
  console.error(
    `      ${eventsBeforeCancel === 0 ? "INCONCLUSIVE — no events even while running" : eventsAfterCancel === 0 ? "PASS — work stopped" : "FAIL — work continued past cancel()"}`,
  );
}

main().catch((e) => {
  console.error("PROBE FAILED:", e);
  process.exit(1);
});
