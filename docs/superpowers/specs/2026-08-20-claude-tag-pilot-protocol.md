# Claude Tag pilot protocol — non-engineer project channel

- **Date:** 2026-08-20
- **Status:** ready to run, pending preconditions
- **Audience under test:** non-engineers building a project or demo via Claude Tag in Slack
- **Goal:** learn which failure modes are real and severe, so a distributable kit packages only
  what demonstrably worked

## Why a pilot instead of a build

The harness design in `2026-08-20-claude-tag-project-harness-design.md` was scoped for an
engineering team and aimed at engineering risk: escalation through workflow files, unreviewed
diffs, credential scope. For a non-engineer building a demo, that is not what goes wrong. What goes
wrong is wasted effort and false confidence, and a draft pull request — that design's deliverable —
is a dead end for someone who will never read a diff.

Rather than redesign on a fresh guess about a different audience, run the flow natively and find out.

**The design rule is zero build.** Everything in the scaffold below is channel instructions, a
committed markdown file, or a request typed into Slack. Nothing is written in Python. Every point
where a native capability proves insufficient becomes a justified item in the kit; anything that
works natively never needs building at all.

A useful side effect: with no rebar in the pilot, the unresolved questions about setup scripts,
per-session installs, and `.env-id` churn do not arise. If a flat file demonstrably breaks under
real use, that finding is what justifies rebar — on evidence rather than on the concurrency estimate
this protocol exists to test.

## Preconditions

Two are blocking. Do not start the pilot before both are confirmed.

1. **Zero Data Retention.** Claude Tag retains channel memory and session transcripts and is
   unavailable to organizations with ZDR enabled. Confirm Nava's Claude organization does not
   require it.
2. **Enterprise Grid topology.** On a Grid whose workspaces pair to different Claude organizations,
   one organization's settings govern the entire grid and restrictions set here may not be enforced.
   Confirm the topology.

Then:

3. A **private** channel, with Claude invited and its scope set to the New version.
4. One repository granted in the bundle attached to that channel and nowhere broader.
5. A **per-channel spend limit** set before the first mention, so cost is measured rather than
   discovered.
6. A **non-engineer driver.** If an engineer drives, the pilot learns nothing about the audience.
7. A **real project with a real deadline.** Toy projects do not surface these failure modes.
8. An engineer available as spot-checker — not to do the work, but to independently judge whether
   accepted output was actually correct. Hypothesis 2 cannot be measured without this.

## The scaffold

### Channel instructions

Set at the channel scope, with **Channel member edits** blocked so they outrank memory and members
cannot erode them. This is the pilot's main instrument: it encodes the intake and evidence
discipline as prose, testing hypotheses 1 and 2 with nothing built.

```text
This channel builds <project>. The repository is <org/repo>; always work there.

Before doing any substantial work, write a short brief and wait for a reply:
what you will build, what you are deliberately leaving out, and up to three
questions you need answered. Do not begin until someone answers.

Every task states, before starting, how it will prove it worked — a screenshot,
a clickable URL, test output, or a checklist you will walk. Deliver that proof
with the result. Never report success on the basis of your own summary alone.

Keep PROJECT.md current: what is done, what is in flight, what was decided and
when, and what is blocked. Update it in the same task that changes it, never
as a separate cleanup.

Maintain one hosted page for this project and keep it current rather than
posting a new one. Put its link in the channel topic.

Say plainly when you are unsure, blocked, or guessing. A clear "I could not do
this" is more useful here than a confident partial answer.

Never mark a pull request ready for review and never merge one.
```

### State file

A committed `PROJECT.md` in the repository is the state store for the pilot — deliberately the
simplest thing that could work. Sections: Done, In flight, Decisions (dated), Blocked.

### Living page

Ask Claude once to create a hosted page rendering `PROJECT.md` and keep it current, then link it in
the channel topic. This tests the highest-value adoption idea with no build at all.

### Preview deploy

If the project can support it, wire the preview deploy to the `pull_request` trigger. Claude Tag
cannot `workflow_dispatch` or approve a held run, but it *can* trigger `push` and `pull_request`
workflows by opening a pull request. That turns "Claude opened a PR" into a clickable URL, which is
the actual deliverable for this audience.

## What to record

One row per task, in a spreadsheet the driver owns. Ten tasks is a usable sample; twenty is better.

| Field | Why |
|---|---|
| What was asked, verbatim | Distinguishes vague asks from precise ones |
| Did the brief change the scope | Hypothesis 1 |
| What proof was delivered | Hypothesis 2 |
| Driver's verdict: worked / partly / no | Perceived quality |
| Spot-checker's verdict, judged independently | Actual quality. The gap between these two columns is the finding. |
| Human effort to fix | Real cost |
| Context re-explained from an earlier thread | Hypothesis 3 |
| Contradicted an earlier decision | Hypothesis 4 |
| Cost, from the per-channel usage page | Cost per useful outcome |

Also record, once: wall-clock time from "we want a channel" to "first useful result," and every step
that needed an admin.

## Hypotheses and their signals

| # | Hypothesis | Signal that confirms it | Signal that kills it |
|---|---|---|---|
| 1 | Non-engineers under-specify, and a forced brief fixes it | Briefs routinely change scope before work starts | Briefs are rubber-stamped and add only latency |
| 2 | They cannot tell whether it worked, and evidence-first fixes it | Driver and spot-checker verdicts diverge often; the gap narrows once proof is required | Verdicts agree, so the discipline is unnecessary |
| 3 | Context is re-explained because threads share nothing | Frequent re-explaining, or Claude working from stale context | Channel memory and thread history suffice |
| 4 | Decisions evaporate and get re-decided differently | Observed contradictions of earlier decisions | The decision log in `PROJECT.md` is never actually consulted |
| 5 | Nobody can answer "where are we" unaided | Driver cannot answer it without asking Claude | The hosted page answers it and gets used |
| 6 | Setup friction blocks adoption | Multiple admin round-trips before first result | Setup is self-service and quick |

A flat `PROJECT.md` is itself under test. Concurrent edits conflicting, or two threads duplicating
work, is the evidence that would justify rebar. Its absence is evidence against.

## Duration and decision rule

Two weeks, or twenty logged tasks, whichever comes first.

Then, per hypothesis: **confirmed and expensive** becomes a kit item; **confirmed but cheap to
handle in prose** ships as channel-instruction boilerplate rather than code; **not confirmed** is
dropped and recorded as dropped, so it is not rediscovered and rebuilt later.

The kit is written only after this, and only from confirmed rows.

## What would falsify the whole idea

Worth stating up front so the pilot can genuinely fail rather than being talked into success.

- The driver stops using the channel unprompted. Adoption is the goal; disuse is the verdict.
- Cost per useful outcome is high enough that the spend limit binds before the project finishes.
- Output quality is good enough natively that the scaffold only adds latency — in which case the
  right deliverable is a one-page habits guide, not a kit.
- The proof requirement gets satisfied with proofs that look convincing and are not, meaning
  non-engineers cannot verify even with evidence in hand. That is the outcome that would send this
  back to needing an engineer in the loop, and it is better to learn it in a pilot.
