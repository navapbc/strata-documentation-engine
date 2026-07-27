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
//   [C] cancel() actually stops the work. A status flip to "cancelled" while the
//       agent keeps burning tokens would be strictly worse than today: we would
//       have dropped the recycle that currently contains the orphan.
//
// [C] is measured by counting agent events either side of cancel(), NOT by walking
// the process tree. An earlier version did both; in plan mode the local runtime
// spawns no child process at all, so there was never a pid to reap and that signal
// could only ever report INCONCLUSIVE (NOTES.md, "Run cancellation findings").
import { Agent } from "@cursor/sdk";
import { setTimeout as sleep } from "node:timers/promises";
// The production lockdown and option shape, imported rather than restated: a probe
// that certifies its own private copy of `mode` certifies nothing about the seam.
import { buildAgentOptions } from "../src/agent.js";

const MODEL_ID = process.env.PROBE_MODEL ?? "gpt-5.6-luna";
const REPO_ROOT = process.cwd() + "/..";
// Long enough that the run is still going when we cancel: answerable questions
// measured 7-14s end to end.
const CANCEL_AFTER_MS = Number(process.env.PROBE_CANCEL_AFTER_MS ?? 4000);
const SETTLE_MS = 4000;

async function main() {
  const options = buildAgentOptions(MODEL_ID, REPO_ROOT);
  const agent = await Agent.create(options);
  console.error("[0] Agent.create ok, agentId:", agent.agentId);

  // The behavioral test for "did the work actually stop": count agent activity
  // either side of cancel(). A status flip with events still arriving afterwards
  // means the run was abandoned, not cancelled.
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
    { model: options.model, mode: options.mode, onStep: tick, onDelta: tick },
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

  if (!supportsCancel) {
    console.error("[C] SKIPPED — cancel unsupported; the recycle in handler.ts must stay.");
    agent.close();
    return;
  }

  const eventsBeforeCancel = events;
  console.error(`[C] agent events before cancel: ${eventsBeforeCancel}`);

  // [C] Does cancel() stop the work?
  const t1 = Date.now();
  cancelledAt = Date.now();
  await run.cancel();
  console.error(`[C] cancel() resolved in ${Date.now() - t1}ms  status=${run.status}`);

  await sleep(SETTLE_MS);
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

  console.error("\n=== VERDICT ===");
  console.error(`  [A] handle before completion: ${run.status !== "finished" || handleMs < 3000 ? "PASS" : "CHECK"} (${handleMs}ms)`);
  console.error(`  [B] cancel supported locally: ${supportsCancel ? "PASS" : "FAIL"}`);
  console.error(`  [C] events: ${eventsBeforeCancel} before cancel, ${eventsAfterCancel} after`);
  console.error(
    `      ${eventsBeforeCancel === 0 ? "INCONCLUSIVE — no events even while running" : eventsAfterCancel === 0 ? "PASS — work stopped" : "FAIL — work continued past cancel()"}`,
  );
}

main().catch((e) => {
  console.error("PROBE FAILED:", e);
  process.exit(1);
});
