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

This started as a harness design for an engineering team, aimed at engineering risk: escalation
through workflow files, unreviewed diffs, credential scope. For a non-engineer building a demo, that
is not what goes wrong. What goes wrong is wasted effort and false confidence, and a draft pull
request — that design's deliverable — is a dead end for someone who will never read a diff. The
design was removed rather than kept as a deferred document; it is recoverable from git history if an
engineering-focused harness is ever wanted, and rebuilding it against a fresh reading of the
platform would beat inheriting assumptions from a scope we did not pursue.

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
2. `navapbc/strata-documentation-engine` granted **from both directions**: the Claude GitHub App
   configured on the GitHub organization with access to the repository, and an Eden ticket to add
   that repository to a bundle attached **to that channel only**. Start this first. The second half
   is a ticket rather than a console click, so it sets the pilot's earliest start date.
3. The same Eden ticket also asks for the channel's **Claude Tag version** set to **New** and a
   **per-channel spend limit** in place before the first mention, so cost is measured rather than
   discovered. Bundle these into one request rather than discovering them one at a time; each
   round-trip costs another lead time.
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
- Claude will render a *proposed* change as a page and hold for approval before building it, rather
  than rendering only finished work.
- `PROJECT.md` written in one thread is picked up by a second thread.
- Cost per task, from the per-channel usage page.
- How long the Eden ticket in preconditions 2 and 3 took, end to end, and whether one ticket
  covered everything or a second was needed. That lead time belongs in `claude-tag-kit/SETUP.md` so
  the next person plans around it instead of discovering it.
- Whether Claude's own error messages were specific enough to say which side of the grant was
  missing. `SETUP.md` tells the reader to ask in the channel rather than guess; confirm that
  actually works before a non-engineer depends on it.

**Phase 1 — non-engineer pilot.** The hypotheses, the log, and the decision rule below. Runs only
against a flow Phase 0 showed to work; measuring a non-engineer's experience of a broken flow teaches
nothing about non-engineers.

There is no third phase. GitHub Pages was scoped as one and is dropped: it needs a repository admin
to enable it, a workflow on `push` or `pull_request` because Claude cannot `workflow_dispatch`, and a
`github-pages` environment with no protection rules because Claude cannot approve a pending
deployment — and after all that it delivers a URL that a Claude-published hosted page already
delivers to this audience. Adding deploy infrastructure to a flow whose value is still unproven only
obscures which part failed.

What replaces it is a gate rather than a destination, and it costs nothing to add. Claude renders the
*proposed* change as a page first — layout, copy, the shape of the thing — and waits for approval
before building it. This is a strictly better instrument than the prose brief for the audience under
test: a non-engineer can judge a rendered page, and cannot judge a paragraph describing code they
will never read. It is also the cheapest possible correction point, since a wrong direction is caught
before the work rather than after it.

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

Rebar is the obvious alternative and is deliberately not used here. Substituting it now would spend
the finding this pilot exists to produce, and would import problems a per-thread sandbox cannot
solve. Rebar carries identity across runs in git-ignored files — `.env-id`, an op-cert signing key
and its public half, `.ensure-applied` — and a Claude Tag sandbox keeps nothing between sessions and
offers nowhere to hold a mode-`0600` private key. So every session mints a fresh environment
identity, orphaning prior attestations; rebar warns and proceeds rather than failing, which means
this degrades quietly rather than loudly. Its *store* would work unchanged — events are globally
unique, union-merging, and deterministically replayed, and claim safety comes from UUID fork
resolution rather than actor identity, so threads sharing one service identity still cannot double
claim. It is the identity layer that does not survive, plus a per-session install cost.

So state the tripwire in advance, rather than deciding after the fact whether the file "felt" like
enough. The flat file has failed, and rebar is justified, if any of these shows up in the log:

- Two threads write conflicting state and a person has to reconcile `PROJECT.md` by hand.
- A decision recorded in `PROJECT.md` is contradicted by a later thread that had read it.
- The driver stops trusting the file — asks a person instead of reading it — for reasons other than
  not knowing it exists.

None of those appearing across the logged tasks is evidence *for* the flat file, and it should be
reported as such rather than passed over in silence.

### Design preview and living page

One hosted page, doing two jobs, with no build at all.

**As a gate.** Before any substantial change, Claude renders the proposal as a page and waits for
approval. What the driver approves or rejects at this step is the pilot's most direct read on
hypothesis 1 — and rejections here are the valuable rows, because each one is a wrong direction that
cost nothing.

**As the deliverable.** The same page renders the knowledge base and `PROJECT.md`, kept current
rather than reposted, linked from the channel topic.

### Preview deploy — recorded, not built

Out of scope for the pilot and worth keeping on the record, because the pilot's own zero-build rule
forbids it and the idea will come back.

Claude cannot `workflow_dispatch` or approve a held run, but it *can* trigger `push` and
`pull_request` workflows by opening a pull request, so a per-pull-request preview deploy would turn
"Claude opened a PR" into a clickable URL. The blocker is state rather than triggers: a demo app
backed by a database needs migrations run against each preview environment, and there is no answer
yet for who runs them or what happens when one fails half-applied. A preview serving a
half-migrated schema is worse than no preview, since it looks authoritative. Resolve that before
building this.

## What to record

One row per task, in a spreadsheet the driver owns. Ten tasks is a usable sample; twenty is better.

| Field | Why |
|---|---|
| What was asked, verbatim | Distinguishes vague asks from precise ones |
| Did the brief change the scope | Hypothesis 1 |
| Was a design preview approved as-is, revised, or rejected | Hypothesis 1, and the cheapest correction point in the flow |
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
| 1 | Non-engineers under-specify, and a forced brief plus a rendered design preview fixes it | Briefs change scope before work starts, or previews get revised or rejected | Both are rubber-stamped and add only latency |
| 2 | They cannot tell whether it worked, and evidence-first fixes it | Driver and spot-checker verdicts diverge often; the gap narrows once proof is required | Verdicts agree, so the discipline is unnecessary |
| 3 | Context is re-explained because threads share nothing | Frequent re-explaining, or Claude working from stale context | Channel memory and thread history suffice |
| 4 | Decisions evaporate and get re-decided differently | Observed contradictions of earlier decisions | The decision log in `PROJECT.md` is never actually consulted |
| 5 | Nobody can answer "where are we" unaided | Driver cannot answer it without asking Claude | The hosted page answers it and gets used |
| 6 | Setup friction blocks adoption | Admin round-trips *beyond* the two structural ones — the GitHub App grant and the Eden ticket — before a first result | Nothing beyond those two, and both clear quickly |

A flat `PROJECT.md` is itself under test, against the tripwire stated under **State file** above.
Judge it against those three conditions rather than against a general impression, and report their
absence as evidence for the flat file rather than passing over it.

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
