# Spec: `refine-issue` multi-agent sprint-refinement skill

- **Status:** Proposed
- **Date:** 2026-07-07
- **Scope of this spec:** the self-contained `refine-issue` orchestrator skill (a single
  `SKILL.md` that drives sub-agents directly via the `Agent`/Task tool, with roles inline), its
  five agent roles, the repo-wide sub-agent **model** tier rule under `rules/`, and the `AGENTS.md`
  wiring. Out of scope (see §9): a `Workflow`/`.mjs` orchestration layer, effort-level control, a
  Haiku executor sub-agent, batch/multi-issue refinement, and any change to `review-draft` (reused
  as-is).
- **Verified against the codebase at:** commit `aef46d3` (post-pull). Alignment notes are in §11.

## 1. Context

The repo drives multi-agent work two ways today:

- **`Workflow`-based** (`generate-strata-docs`): two `.mjs` `Workflow` passes (`run-1-document`,
  `run-2-verify-fix`), documented in `rules/architecture.md`. Deterministic control flow, one
  `general-purpose` agent per source, agent role specs under `references/agents/`.
- **`SKILL.md`-driven** (`review-draft`): a single self-contained `SKILL.md` that dispatches
  review sub-agents directly (no `Workflow`, no `.mjs`, no separate agent files), with role
  instructions inline, adjudicates the findings, and revises. It keeps reviewers on a **cheap
  model** and adjudication on a **more capable** one.

`refine-issue` follows the **`review-draft` precedent**: self-contained `SKILL.md`, sub-agents
dispatched via the `Agent`/Task tool, roles inline, no `Workflow`.

What is missing is a **refinement** step for the *input* to the docs pipeline: a GitHub issue.
Today an issue is written (optionally via `create-issue` + `review-draft`) and filed, but there is
no adversarial pass that pressure-tests the issue's goals, feasibility, and completeness before a
team commits to it in a sprint. `refine-issue` takes an existing issue, runs a
product-versus-engineering debate over it, reconciles human comments already on the issue,
adjudicates every proposed change, and produces a refined issue plus an audit-trail summary,
updating the issue via `gh` only after the user approves. This is a generation-layer artifact
(non-deterministic, Claude-driven).

## 2. Decisions

| Decision | Choice |
|---|---|
| Orchestration | **Single `SKILL.md`, no `Workflow`** (matches `review-draft`). The main agent dispatches each role via the `Agent`/Task tool and manages control flow across its own turns. |
| Role instructions | **Inline in `SKILL.md`** (matches `review-draft`), not separate `references/agents/` files. The skill is one file. |
| Debate structure | **Bounded debate loop** — Product Owner ⇄ Senior Engineer exchange over a shared transcript for a fixed number of rounds (default 2), then Reviewer, then Adjudicator, then Planner. |
| Model selection | Per-role **model** pinned via the `Agent` tool's `model` param (Opus vs Sonnet). **Effort is not controlled.** |
| Sub-agent output | Each sub-agent returns a **structured findings list** with defined fields (matching `review-draft`'s list style); the main agent reads and tracks it. Not enforced JSON. |
| What gets updated | **Edit issue body/title in place** (`gh issue edit`) **and** post a **refinement summary comment** (`gh issue comment`) recording what changed, why, and any open questions. |
| Approval gate | The **main skill** presents the plan and open questions and asks the user for permission. Sub-agents never prompt the user. |
| Who executes `gh` | The **main skill runs `gh` directly** after approval. No executor sub-agent. |
| Style pass | The refined body **chains through the `review-draft` skill** before the approval gate (also catches em dashes and hard-wrapped paragraphs, per `CONTRIBUTING.md`). |
| Model tiers | New path-scoped rule `rules/subagent-model-tiers.md` (model-only), referenced from `AGENTS.md`. |
| Skill location & name | `skills/refine-issue/` (canonical skills root per `.claude-plugin/plugin.json` `"skills": "./skills/"`; `generate-strata-docs` lives only there). |
| Unresolved questions | Probing questions the agents cannot answer from the issue alone become an **Open Questions** section in the refined body and are surfaced at the approval gate. Never silently dropped. |

## 3. Orchestration flow (all in `SKILL.md`)

The skill runs as a sequence of steps the main agent performs across its turns. There is no
mid-run pause problem (no `Workflow`), so the approval gate is just another step.

```
Step 1  Fetch: gh issue view <n> --json title,body,comments,labels,author,url
        Capture existing comments, noting which are human-authored (author is not a bot).

Step 2  DEBATE loop (default 2 rounds); the main agent maintains a shared transcript:
          round r: dispatch Product Owner (Opus)  -> proposed changes + questions + argument
                   append to transcript
                   dispatch Senior Engineer (Opus) -> rebuttals + probing Qs + feasibility
                   append to transcript
        Each dispatch's prompt inlines the role instructions, the issue, the comments, and the
        transcript so far.

Step 3  Dispatch Reviewer (Opus): reconcile the debate against the issue's existing
        (human) comments; flag conflicts; may add or adjust proposed changes.

Step 4  Dispatch Adjudicator (Opus): accept/reject each proposed change (with a why),
        re-checking each against the issue. Main agent collects verdicts.

Step 5  Dispatch Planner (Sonnet): from accepted changes only, produce the refined title,
        refined body, change summary, open-questions list, and accepted/rejected lists.

Step 6  Chain review-draft skill on the refined body (artifact type "issue"): house style,
        no em dashes, no hard-wrapped paragraphs.

Step 7  APPROVAL GATE (main skill): present refined title/body + change summary +
        open questions + rejected changes to the user; ask permission to apply.

Step 8  On approval, main skill runs gh directly:
          gh issue edit <n>    --title <t> --body-file <body.md>
          gh issue comment <n> --body-file <summary.md>
        On denial: write nothing.
```

Step 6 invokes the `review-draft` skill as-is (no changes to it).

## 4. Agent roles & model assignment

Five sub-agent roles, each dispatched as a `general-purpose` agent with the `model` param set per
the tier rule (§5). **Role instructions are inline in `SKILL.md`** (matching `review-draft`), not
separate files. Effort is not set.

| Agent | Job | Model |
|---|---|---|
| **Product Owner** | Bring the goals, the whys and whats, user value; clarify requirements; argue for scope that serves the outcome. | Opus |
| **Senior Engineer** | Push back on the PO; ask probing technical questions; test feasibility; surface unknowns, dependencies, and hidden complexity. | Opus |
| **Reviewer** | Read the issue and its comments, **weighting human comments**; reconcile the debate against what humans already said; flag conflicts. | Opus |
| **Adjudicator** | Accept or reject each proposed change by re-checking it against the issue; give a `why`. | Opus |
| **Planner** | Assemble accepted changes into a refined title/body, a change summary, and an open-questions list. Change nothing not accepted. | Sonnet |

No executor sub-agent: the main skill runs `gh` directly (§2). The Haiku tier exists in the rule
for future plan-execution sub-agents; this skill does not need one. This mirrors `review-draft`'s
own split (cheap reviewers, capable adjudication), generalized by the tier rule.

## 5. The tier rule (`rules/subagent-model-tiers.md`)

A new **model** rule, following the repo's `rules/` convention: a top-level file with `paths:`
frontmatter that Claude Code auto-loads when a matching path is edited. Scope it to skill
authoring so it loads whenever a skill is touched:

```
---
paths:
  - "skills/**"
---
```

Tiers (model choice only; the rule does not prescribe effort):

- **Tier 1 — Opus.** Sub-agents that must reason at length, hold large context, ask probing
  questions, debate, or make thoughtful judgment calls (product/engineering debate, review,
  adjudication).
- **Tier 2 — Sonnet.** Sub-agents doing everyday, well-scoped work (synthesis, drafting from a
  decided set, routine transforms).
- **Tier 3 — Haiku.** Sub-agents that only execute an already-decided plan, following
  instructions authored by a higher tier (no open-ended reasoning).

`AGENTS.md` gains a third bullet in its "Architecture and CI" rule list pointing to this file
(edit `AGENTS.md` only; `CLAUDE.md` is a symlink to it).

## 6. Sub-agent output contract

Matching `review-draft`, each role ends its reply with a structured findings list (defined fields
below), which the main agent reads and tracks. Roles return data, not user-facing prose. Strict
JSON is not required; the main agent both dispatches and consumes in one conversation.

- **Proposed change** (from PO / SE turns and the Reviewer): `origin`
  (product-owner | senior-engineer | reviewer), `target`
  (title | body-section | acceptance-criteria | open-question), `current`, `proposed`,
  `rationale`.
- **Debate turn**: a list of proposed changes, a list of probing questions, and a short argument
  paragraph. The argument and running list feed the shared transcript.
- **Adjudicator**: one verdict per proposed change, in order: `accept` or `reject`, plus a `why`.
- **Planner**: the refined title, refined body, change summary, open-questions list, and the
  accepted/rejected lists.

The main agent parses tolerantly: if a sub-agent's output is unreadable, re-dispatch once, then
surface the failure rather than fabricating a result.

## 7. Components (files)

- `skills/refine-issue/SKILL.md` — the entire skill in one file: frontmatter (`name`,
  `description`), when-to-use, the five inline role instructions (§4), the eight-step flow (§3),
  the `gh` fetch command, the per-role `Agent`/Task dispatch (with `model` per §4), the
  `review-draft` chain, the approval gate, and the `gh` edit/comment commands. States that
  sub-agents never talk to the user.
- `rules/subagent-model-tiers.md` — the path-scoped model tier rule (§5).
- `AGENTS.md` — a bullet in the "Architecture and CI" list pointing to the tier rule.

There is **no `.mjs` file**, **no `workflows/` directory**, and **no `references/agents/` files**
for this skill; everything lives in the single `SKILL.md`.

## 8. Invariants (the repo's "never silently drop", applied here)

1. **Sub-agents never talk to the user.** Only the main skill prompts, at the approval gate
   (repo invariant, `rules/architecture.md`).
2. **Nothing dropped silently.** Rejected changes are reported to the user with their `why`
   (mirrors `review-draft`); unresolved probing questions become an Open Questions section in the
   body *and* are surfaced at the gate.
3. **Audit trail preserved.** The refinement summary comment records what changed, why, and open
   questions, so the issue history explains the edit rather than the body silently mutating.
4. **No write before approval.** No `gh` mutation happens until the user approves the plan.
5. **Tolerant parsing, no silent guessing.** If a sub-agent returns unreadable output, the main
   agent re-dispatches once and then surfaces the failure.
6. **`review-draft` unchanged.** Invoked as-is; this skill adds no coupling into it.

## 9. Out of scope (deliberate)

- **`Workflow`/`.mjs` orchestration.** `SKILL.md`-driven by choice (the `review-draft` pattern);
  it trades deterministic control flow, schema validation, parallel fan-out, and resumability for
  a self-contained skill.
- **Effort-level control.** Only model is pinned per role.
- **Haiku executor sub-agent.** The main skill runs `gh` directly.
- **Batch / multi-issue refinement.** One issue per run.
- **Filing new issues.** Refines an existing issue only; use `create-issue` to open one.
- **Changes to `review-draft`, `create-issue`, or the docs pipeline.**

## 10. Acceptance criteria

- Running the skill on an existing issue produces, without filing anything, a refined title/body,
  a change summary, an open-questions list, and a list of rejected changes with reasons.
- The whole skill is one `skills/refine-issue/SKILL.md`: no `Workflow` call, no `.mjs`, no
  `references/agents/` files; roles are inline.
- The PO ⇄ SE debate runs the bounded number of rounds (default 2), each turn visibly responding
  to the prior turn's transcript.
- Each sub-agent is dispatched with the model from §4 and returns a parseable structured list.
- Every proposed change carries an adjudicator `accept`/`reject` verdict with a `why`; only
  accepted changes appear in the refined body.
- The refined body has passed through `review-draft` (house style, no em dashes, no hard-wrapped
  paragraphs) before it is presented.
- The skill asks for explicit permission before any `gh` write, and on approval runs exactly
  `gh issue edit` + `gh issue comment`; on denial it writes nothing.
- `rules/subagent-model-tiers.md` exists with `paths:` frontmatter and the three model tiers, and
  `AGENTS.md` references it.

## 11. Alignment with the current codebase (verification)

Checked against commit `aef46d3`:

- **Skills root is top-level `skills/`.** `.claude-plugin/plugin.json` declares
  `"skills": "./skills/"`; `generate-strata-docs` exists only under `skills/`. The new skill goes
  in `skills/refine-issue/`. (`.claude/skills/` holds stale partial duplicates of some skills and
  is not the canonical location.)
- **`review-draft` is self-contained, no `Workflow`.** Its `skills/review-draft/SKILL.md` is a
  single file that dispatches sub-agents, adjudicates, and revises, with roles inline and a
  cheap-reviewer / capable-adjudicator split. This design mirrors it.
- **Rules live in top-level `rules/` with `paths:` frontmatter** (`architecture.md`, `ci.md`),
  auto-loaded by Claude Code on matching path edits. The tier rule follows this shape.
- **`CLAUDE.md` is a symlink to `AGENTS.md`.** The pointer to the tier rule is added to
  `AGENTS.md`.
- **`review-draft` enforces no em dashes and no hard-wrapped issue/PR bodies** (per
  `CONTRIBUTING.md`); chaining it in Step 6 covers the refined body's formatting.
- **"Sub-agents never talk to the user"** remains a repo invariant (`rules/architecture.md`),
  preserved here.
- **Unaffected:** the Python spine (`scripts/`, `tests/`), the docs pipeline, and CI. This skill
  adds no scripts and no frontmatter, so `lint_*`, `build_graph`, and the graph-freshness CI gate
  are untouched.
