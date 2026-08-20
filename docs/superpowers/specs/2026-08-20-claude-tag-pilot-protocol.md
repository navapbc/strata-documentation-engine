# Claude Tag pilot protocol — non-engineer project channel

- **Date:** 2026-08-20
- **Status:** ready to run, pending preconditions
- **Audience under test:** non-engineers building a project or demo via Claude Tag in Slack
- **Shape:** Phase 0 engineer-led capability check, then Phase 1 non-engineer pilot
- **Goal:** learn which failure modes are real and severe, so a distributable kit packages only
  what demonstrably worked
- **Pilot project:** a live, browsable site built from this repository's existing knowledge base
  (`docs/INDEX.md`, `docs/graph.json`, `docs/sources/` — nine documented sources)
- **Kit under test:** `claude-tag-kit/`

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

Scoped to internal work, so retention and Grid topology are out of scope here rather than blocking;
`claude-tag-kit/SETUP.md` records both for anyone who later reuses the kit on client work.

1. A **public** channel, with Claude invited and its scope set to the New version. Public because a
   hosted page's visibility follows the channel, and being seen is the point of an adoption pilot.
   The content here is a public repository's public documentation, so the memory-leak risk that
   would otherwise argue for private is negligible. Check for Slack guests: Claude is off by default
   in any channel containing one.
2. `navapbc/strata-documentation-engine` granted in a bundle attached **to that channel only**.
3. A **per-channel spend limit** set before the first mention, so cost is measured rather than
   discovered.
4. **Phase 1 only:** a **non-engineer driver.** If an engineer drives, the pilot learns nothing
   about the audience.
5. **Phase 1 only:** an engineer available as spot-checker — not to do the work, but to
   independently judge whether accepted output was actually correct. Hypothesis 2 cannot be measured
   without this.
6. `claude-tag-kit/SETUP.md` walked end to end, with every step that was wrong, missing, or
   confusing recorded. The guide is under test alongside the flow.

## Deliverable and phases

The pilot builds something real rather than an exercise: this repository already generates an
agent-queryable knowledge base but has no human-browsable surface, so the site is genuinely useful
output. That matters — a driver doing real work surfaces real failure modes.

The kit targets demos and internal tools, and these have different success tests. A demo succeeds if
it convinces once; an internal tool succeeds if it survives and keeps working. **This pilot builds an
internal tool** — people will use the site to find things — which is the harder case and the better
one to test against.

**Phase 0 — capability check, engineer-led.** Two engineers establish whether the loop works at
all, and produce the hosted page. Explicitly *not* measured against the hypotheses below: engineers
compensate for exactly the things those hypotheses test, so running them here would return false
negatives. Phase 0's real output is a working flow and a corrected `claude-tag-kit/SETUP.md` — two
engineers walking that guide will find its errors faster than anyone else.

Verify each of these, and record what broke:

- Channel instructions are actually in effect — Claude writes a brief before working, and refuses to
  begin until answered. If it dives straight in, the instructions are not reaching the session.
- Naming the repository in the first message clones it, and `.claude/skills/` and `CLAUDE.md` load
  on the following turn.
- Python 3.13 and `scripts/requirements.txt` install in the sandbox. There is no setup script, so
  this happens per session on `CLAUDE.md` guidance — confirm it works and note how long it takes.
- `lint_manifest`, `lint_docs`, and `build_graph` run and print their sentinels.
- A hosted page gets created, and a *later thread* updates that same page rather than posting a new
  one.
- `PROJECT.md` written in one thread is picked up by a second thread.
- Cost per task, from the per-channel usage page.

**Phase 1 — non-engineer pilot.** The hypotheses, the log, and the decision rule below. Runs only
against a flow Phase 0 showed to work; measuring a non-engineer's experience of a broken flow teaches
nothing about non-engineers.

**Phase 2 — GitHub Pages.** A real public URL. The repository is public so Pages is free, but three
constraints apply and none can be widened: a repository admin must enable Pages (it is off today),
the workflow must trigger on `push` or `pull_request` because Claude cannot `workflow_dispatch`, and
the `github-pages` environment must carry no protection rules because Claude cannot approve a pending
deployment.

Pull Phase 2 forward into Phase 0 if the capability check goes smoothly — a clickable public URL is a
better deliverable for the non-engineer phase than a claude.ai-hosted page. Otherwise leave it last,
since adding deploy infrastructure to a flow that does not yet work only obscures which part failed.

## The scaffold

### Channel instructions

Use the pilot version in `claude-tag-kit/channel-instructions.md`, set at the channel scope. This is
the pilot's main instrument: it encodes the intake-brief and evidence-first discipline as prose,
testing hypotheses 1 and 2 with nothing built.

Leave **Channel member edits** unblocked for this pilot and record any edits members make. What they
change is a finding — it shows where the instructions read as friction rather than help.

### State file

A committed `PROJECT.md` in the repository is the state store for the pilot — deliberately the
simplest thing that could work. Sections: Done, In flight, Decisions (dated), Blocked.

### Living page

Ask Claude once to create a hosted page rendering the knowledge base and `PROJECT.md`, and to keep it
current, then link it in
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

**One deferred check, worth scheduling.** Because the pilot builds an internal tool rather than a
demo, ask again a month after the pilot ends: is the site still current, is anyone still using it,
and did it survive without the channel? A tool that decays the moment attention moves on is a finding
about the kit, not about the driver — and it is invisible inside a two-week window.

## What would falsify the whole idea

Worth stating up front so the pilot can genuinely fail rather than being talked into success.

- The driver stops using the channel unprompted. Adoption is the goal; disuse is the verdict.
- Cost per useful outcome is high enough that the spend limit binds before the project finishes.
- Output quality is good enough natively that the scaffold only adds latency — in which case the
  right deliverable is a one-page habits guide, not a kit.
- The proof requirement gets satisfied with proofs that look convincing and are not, meaning
  non-engineers cannot verify even with evidence in hand. That is the outcome that would send this
  back to needing an engineer in the loop, and it is better to learn it in a pilot.
