# refine-issue Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a self-contained `refine-issue` skill that runs a product-owner vs senior-engineer debate over an existing GitHub issue, reconciles human comments, adjudicates every proposed change, and updates the issue via `gh` only after the user approves.

**Architecture:** A single `skills/refine-issue/SKILL.md` orchestrates sub-agents directly with the `Agent`/Task tool (no `Workflow`, no `.mjs`), mirroring the refactored `review-draft` skill. Role instructions are inline. A new path-scoped rule `rules/subagent-model-tiers.md` records which model each role uses, referenced from `AGENTS.md`.

**Tech Stack:** Markdown skill authoring for Claude Code (plugin skills under `skills/`), `gh` CLI, the `review-draft` skill (reused), Python 3.13 only for frontmatter-validation checks during the build.

## Global Constraints

Copied verbatim from the spec and repo conventions; every task inherits these:

- Canonical skills root is top-level `skills/` (`.claude-plugin/plugin.json` sets `"skills": "./skills/"`). The new skill goes in `skills/refine-issue/`. Do not touch the stale `.claude/skills/` duplicates.
- The skill is one file: `skills/refine-issue/SKILL.md`. No `.mjs`, no `workflows/` dir, no `references/agents/` files. Roles are inline.
- The skill uses the `Agent`/Task tool, not the `Workflow` tool.
- Sub-agents never talk to the user; only the orchestrator does, at the approval gate.
- No em dashes anywhere in the shipped `SKILL.md` and rule file. No hard-wrapped issue/PR bodies (one line per paragraph) in any body the skill produces.
- `CLAUDE.md` is a symlink to `AGENTS.md`; edit `AGENTS.md` only.
- Rule files live in top-level `rules/` with `paths:` frontmatter that Claude Code auto-loads.
- Model tiers: Product Owner, Senior Engineer, Reviewer, Adjudicator run on Opus; Planner runs on Sonnet. Effort is not set. Dispatch each as a `general-purpose` agent with the `model` param.
- Commit subjects: imperative, 50 characters or less, no `feat:`/`fix:` prefixes (repo uses plain imperative). End commit messages with the `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` trailer.
- Requires Python 3.13 for the validation commands (`pip install -r scripts/requirements.txt pytest` provides PyYAML).

## Before you start

Work on a feature branch, not `main` (repo convention: `<github-username>/<issue-number>-<short-kebab>`; if no issue exists, use a descriptive branch such as `refine-issue-skill`). The spec is at `docs/superpowers/specs/2026-07-07-refine-issue-skill-design.md`; commit it in Task 1 alongside the rule so the pair lands together.

---

### Task 1: Sub-agent model tier rule + AGENTS.md wiring

**Files:**
- Create: `rules/subagent-model-tiers.md`
- Modify: `AGENTS.md:98-108` (the "Architecture and CI" rule list)
- Also commit: `docs/superpowers/specs/2026-07-07-refine-issue-skill-design.md` (the spec, currently uncommitted)

**Interfaces:**
- Consumes: nothing (first task).
- Produces: the file path `rules/subagent-model-tiers.md`, cited by `skills/refine-issue/SKILL.md` in Task 2 and by `AGENTS.md`.

- [ ] **Step 1: Create the tier rule file**

Create `rules/subagent-model-tiers.md` with exactly this content:

```markdown
---
paths:
  - "skills/**"
---

# Sub-agent model tiers

Which Claude model to give a sub-agent when a skill dispatches one via the `Agent`/Task tool.
Auto-loaded by Claude Code when you edit anything under `skills/`. Choose by the kind of work the
sub-agent does. This rule covers model choice only, not effort level.

- **Tier 1, Opus.** Sub-agents that reason at length, hold large context, ask probing questions,
  debate, or make thoughtful judgment calls. Examples: a product-versus-engineering debate,
  reviewing a draft against its sources, adjudicating whether a change is warranted.
- **Tier 2, Sonnet.** Sub-agents doing everyday, well-scoped work: synthesis, drafting from an
  already-decided set of inputs, routine transforms.
- **Tier 3, Haiku.** Sub-agents that only execute an already-decided plan, following instructions
  authored by a higher tier. No open-ended reasoning.

In practice: `review-draft` keeps its parallel reviewers on a cheap tier and its adjudication on
Opus; `refine-issue` runs its debate, review, and adjudication roles on Opus and its planner on
Sonnet. Neither skill sets effort.
```

- [ ] **Step 2: Verify the rule frontmatter parses and scopes to skills**

Run:

```bash
python -c "import yaml; d=yaml.safe_load(open('rules/subagent-model-tiers.md').read().split('---')[1]); assert d.get('paths')==['skills/**'], d; print('RULE_FM_OK')"
```

Expected: prints `RULE_FM_OK`.

- [ ] **Step 3: Add the AGENTS.md pointer**

In `AGENTS.md`, change the "Architecture and CI" intro from "two rule files" to "three rule files" and add a third bullet after the `rules/ci.md` bullet. Replace:

```markdown
Deep reference lives in two rule files under `rules/` at the repo root. Claude Code auto-loads each
when you touch a path its `paths:` frontmatter matches; other tools do not, so open the relevant file
directly when working the paths noted below.

- `rules/architecture.md`: the manifest, skill orchestration, the frontmatter-driven graph,
  and the "never silently drop" invariant. Applies when editing `scripts/`, `tests/`, `sources.md`,
  `skills/generate-strata-docs/`, or anything under `docs/`.
- `rules/ci.md`: the lint pipeline and the doc-generation workflows. Applies when editing
  `.github/workflows/` or doc frontmatter.
```

with:

```markdown
Deep reference lives in three rule files under `rules/` at the repo root. Claude Code auto-loads each
when you touch a path its `paths:` frontmatter matches; other tools do not, so open the relevant file
directly when working the paths noted below.

- `rules/architecture.md`: the manifest, skill orchestration, the frontmatter-driven graph,
  and the "never silently drop" invariant. Applies when editing `scripts/`, `tests/`, `sources.md`,
  `skills/generate-strata-docs/`, or anything under `docs/`.
- `rules/ci.md`: the lint pipeline and the doc-generation workflows. Applies when editing
  `.github/workflows/` or doc frontmatter.
- `rules/subagent-model-tiers.md`: which Claude model to give a sub-agent that a skill dispatches
  via the `Agent`/Task tool. Applies when editing anything under `skills/`.
```

- [ ] **Step 4: Verify the pointer and count**

Run:

```bash
grep -q "rules/subagent-model-tiers.md" AGENTS.md && grep -q "three rule files" AGENTS.md && echo "AGENTS_POINTER_OK"
```

Expected: prints `AGENTS_POINTER_OK`.

- [ ] **Step 5: Verify no em dashes in the rule file**

Run:

```bash
grep -n "—" rules/subagent-model-tiers.md && echo "FOUND_EM_DASH" || echo "NO_EM_DASH_OK"
```

Expected: prints `NO_EM_DASH_OK`.

- [ ] **Step 6: Commit**

```bash
git add rules/subagent-model-tiers.md AGENTS.md docs/superpowers/specs/2026-07-07-refine-issue-skill-design.md
git commit -m "Add sub-agent model tier rule" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: The refine-issue skill

**Files:**
- Create: `skills/refine-issue/SKILL.md`

**Interfaces:**
- Consumes: `rules/subagent-model-tiers.md` (Task 1) for the per-role model assignment; the `review-draft` skill (existing) for the Step 6 style pass; the `gh` CLI.
- Produces: the `refine-issue` skill, invocable by name. No code symbols; downstream Task 3 validates it end to end.

- [ ] **Step 1: Create the skill file**

Create `skills/refine-issue/SKILL.md` with exactly this content:

````markdown
---
name: refine-issue
description: Refines an existing GitHub issue for sprint readiness by running a product-owner versus senior-engineer debate over it, reconciling human comments, adjudicating every proposed change, and updating the issue via gh only after you approve. Use to pressure-test an issue's goals, scope, and feasibility before a team commits to it in a sprint.
---

# Refine Issue

Takes one existing GitHub issue and pressure-tests it before a sprint commits to it. This skill is
an orchestrator: it dispatches sub-agents that debate the issue, reconciles the human comments
already on it, adjudicates each proposed change, plans a refined issue, and updates the issue via
`gh` only after you approve. It runs entirely in this file using the `Agent`/Task tool. It does not
use the `Workflow` tool. Sub-agents never talk to the user; only you, the orchestrator, do, at the
approval gate.

## When to use

Use on an existing issue that is about to enter a sprint and needs sharpening: unclear goals, fuzzy
scope, unstated acceptance criteria, or unverified technical feasibility. Skip it for a throwaway or
an already-refined issue.

You need the issue number or URL and write access via `gh`.

## Model tiers

Dispatch each role with the model named below, per `rules/subagent-model-tiers.md`:

- Product Owner, Senior Engineer, Reviewer, Adjudicator: Opus (they reason, debate, and judge).
- Planner: Sonnet (it assembles an already-decided result).

Dispatch each role as a `general-purpose` agent, setting the `model` param. Effort is not set.

## Roles

Each role's full instructions are below. When you dispatch a role, inline that role's instructions,
the issue (title, body, comments), and the running debate transcript into the sub-agent's prompt.
Every role ends its reply with a structured findings list, described under its heading. Roles return
data, not prose for the user.

### Product Owner (Opus)

You are the product owner. Bring the goals, the whys and the whats, and the user value. Your job is
to make the issue express the outcome it should achieve and why it matters, not how to build it.

Do:
- State the user or business outcome the issue should deliver, and who benefits.
- Turn vague requirements into concrete, testable acceptance criteria.
- Push for scope that serves the outcome; call out gold-plating and missing must-haves.
- Respond to the senior engineer's prior turn in the transcript: concede good points, defend the
  ones that matter for user value.

Do not specify implementation, estimate effort, or let scope creep pass unchallenged.

End your reply with a list of proposed changes and open questions. For each proposed change give:
origin (product-owner); target (title, body-section, acceptance-criteria, or open-question); current
(what the issue says now, or "none"); proposed (the new text); rationale (why). Then list any probing
questions you could not answer from the issue alone.

### Senior Engineer (Opus)

You are the senior engineer. Argue back. Your job is to make sure the issue is technically sound,
feasible, and complete enough to build.

Do:
- Ask probing technical questions the issue leaves unanswered (data, interfaces, dependencies, edge
  cases, non-functional needs).
- Test feasibility: is what the product owner wants buildable as stated, and at what cost or risk?
- Surface hidden complexity, unknowns, and dependencies on other work.
- Respond to the product owner's prior turn in the transcript: challenge assumptions, propose
  sharper criteria, or agree where they are right.

Do not redesign the whole thing or block on perfection. Aim for buildable and clear.

End your reply with the same structured list: proposed changes (origin senior-engineer, with target,
current, proposed, rationale) and probing questions you could not resolve.

### Reviewer (Opus)

You are the reviewer. You have the issue, its comments, and the full debate transcript. Weight the
issue's existing human comments heavily: humans commented for a reason, and their intent must not be
lost in the refinement.

Do:
- Identify every human comment and what it asks for; check that the debate did not contradict or
  ignore it.
- Flag conflicts between the debate's proposed changes and what humans said.
- Add or adjust proposed changes so the refined issue honors the human comments.

End your reply with a list of proposed changes (origin reviewer, same fields) and a list of conflicts
you found (each: the human comment, the proposed change it conflicts with, and your recommendation).

### Adjudicator (Opus)

You are the adjudicator. You have the issue and every proposed change from the product owner, senior
engineer, and reviewer. Decide each on its merits by re-checking it against the issue. Do not accept
changes blindly.

For each proposed change, return a verdict: accept or reject, plus a why. Reject a change that is
wrong, out of scope, contradicts a human comment, or is not supported by the issue's intent, and say
so. Keep the changes in the order given.

End your reply with the verdict list, one entry per proposed change, in order.

### Planner (Sonnet)

You are the planner. You have the issue and only the accepted changes. Assemble the refined issue.
Change nothing that was not accepted.

Produce:
- refined_title: the issue title, unchanged unless a change targeted it.
- refined_body: the full refined issue body in GitHub markdown, one line per paragraph (no hard
  wrapping), no em dashes. Fold the accepted changes into the existing structure. Add an "Open
  Questions" section listing every unresolved probing question.
- change_summary: a short markdown summary of what changed and why, for a comment on the issue.
- open_questions: the list of unresolved questions, also embedded in the body.

End your reply with these four fields, each clearly labeled.

## Steps

### 1. Fetch the issue

Read the issue and its comments:

```bash
gh issue view <number> --json number,title,body,comments,labels,author,url
```

Note which comments are human-authored (the comment author is not a bot). Keep the full issue and
comments as context for every dispatch.

### 2. Run the debate loop

Run a bounded debate, default 2 rounds. Maintain a shared transcript holding each turn's argument
and its proposed changes. Each round:

1. Dispatch the Product Owner (Opus, general-purpose), inlining the Product Owner instructions, the
   issue, the comments, and the transcript so far. Append its output to the transcript.
2. Dispatch the Senior Engineer (Opus, general-purpose) the same way, including the Product Owner's
   turn. Append its output to the transcript.

After the last round, collect every proposed change from both roles.

### 3. Reconcile with human comments

Dispatch the Reviewer (Opus, general-purpose) with the issue, the comments, and the full transcript.
Add its proposed changes to the collected set and keep its conflict list.

### 4. Adjudicate

Dispatch the Adjudicator (Opus, general-purpose) with the issue and the full set of proposed changes.
Collect a verdict per change. Keep the accepted set and the rejected set with reasons.

### 5. Plan the refined issue

Dispatch the Planner (Sonnet, general-purpose) with the issue and the accepted changes only. Collect
refined_title, refined_body, change_summary, and open_questions.

### 6. Style-check the body

Run the `review-draft` skill on refined_body as an issue draft. Apply the findings you accept. This
enforces house style, no em dashes, and no hard-wrapped paragraphs.

### 7. Present and ask permission

Show the user the refined title and body, the change summary, the open questions, and every rejected
change with its reason. Ask for explicit permission to apply the changes to the issue. Do not write
anything yet.

### 8. Apply, only after approval

On approval, write the refined body and the summary to temporary files and run:

```bash
gh issue edit <number> --title "<refined_title>" --body-file <body.md>
gh issue comment <number> --body-file <summary.md>
```

Pass the body and comment via files so multi-line markdown survives the shell. On denial, write
nothing and stop.

## Notes

- Sub-agents never talk to the user. Only the orchestrator prompts, at Step 7.
- Never drop a finding silently: rejected changes are shown with reasons, and unresolved questions
  become an Open Questions section in the body and are surfaced at the gate.
- If a sub-agent's output is unreadable, re-dispatch it once, then surface the failure rather than
  guessing.
- This skill complements `create-issue`, which files new issues, and reuses `review-draft` for the
  style pass.
````

- [ ] **Step 2: Verify the skill frontmatter parses**

Run:

```bash
python -c "import yaml; d=yaml.safe_load(open('skills/refine-issue/SKILL.md').read().split('---')[1]); assert d['name']=='refine-issue' and d.get('description'); print('SKILL_FM_OK')"
```

Expected: prints `SKILL_FM_OK`.

- [ ] **Step 3: Verify all five roles and all eight steps are present**

Run:

```bash
grep -c "^### Product Owner\|^### Senior Engineer\|^### Reviewer\|^### Adjudicator\|^### Planner" skills/refine-issue/SKILL.md
```

Expected: prints `5`.

Then run:

```bash
grep -c "^### [1-8]\. " skills/refine-issue/SKILL.md
```

Expected: prints `8`.

- [ ] **Step 4: Verify no em dashes and the Workflow tool is not used**

Run:

```bash
grep -n "—" skills/refine-issue/SKILL.md && echo "FOUND_EM_DASH" || echo "NO_EM_DASH_OK"
grep -qi "Workflow(" skills/refine-issue/SKILL.md && echo "FOUND_WORKFLOW" || echo "NO_WORKFLOW_OK"
```

Expected: prints `NO_EM_DASH_OK` then `NO_WORKFLOW_OK`.

- [ ] **Step 5: Commit**

```bash
git add skills/refine-issue/SKILL.md
git commit -m "Add refine-issue skill" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: End-to-end dry-run validation

A skill cannot be unit-tested; this task exercises it against a real issue up to the approval gate and confirms it writes nothing on denial. It is interactive.

**Files:**
- None created or modified (validation only; if the run surfaces a fix, apply it to `skills/refine-issue/SKILL.md` and re-run, then commit the fix with a `Fix ...` subject).

**Interfaces:**
- Consumes: the committed `skills/refine-issue/SKILL.md` (Task 2) and `rules/subagent-model-tiers.md` (Task 1).
- Produces: confidence that the skill runs, dispatches the five roles on the right models, reaches the gate, and respects denial. No artifacts.

- [ ] **Step 1: Pick a safe target issue and record its current state**

Choose an existing open issue you may read. Record its current body and last-updated time so you can prove nothing changed:

```bash
gh issue view <number> --json title,body,updatedAt
```

Expected: prints the issue JSON. Keep this output.

- [ ] **Step 2: Invoke the skill and stop at the approval gate**

In a Claude Code session, invoke the `refine-issue` skill on `<number>`. Watch that it: fetches the issue (Step 1), runs the two-round debate dispatching Product Owner then Senior Engineer on Opus (Step 2), dispatches the Reviewer and Adjudicator on Opus (Steps 3 to 4), dispatches the Planner on Sonnet (Step 5), runs `review-draft` on the body (Step 6), then presents the refined title, body, change summary, open questions, and rejected changes and asks permission (Step 7).

Expected: the orchestrator pauses at Step 7 and asks for permission. Each debate turn visibly responds to the prior turn.

- [ ] **Step 3: Deny at the gate**

Decline the permission request.

Expected: the skill writes nothing and stops. No `gh issue edit` or `gh issue comment` runs.

- [ ] **Step 4: Confirm the issue is unchanged**

Run:

```bash
gh issue view <number> --json title,body,updatedAt
```

Expected: `title`, `body`, and `updatedAt` are identical to Step 1. The issue was not modified.

- [ ] **Step 5: Confirm output completeness**

Check the Step 7 presentation contained: a refined title, a refined body with an "Open Questions" section, a change summary, and every rejected change listed with a reason.

Expected: all four present. If any is missing, fix `skills/refine-issue/SKILL.md`, commit with a `Fix refine-issue ...` subject, and re-run this task.

---

## Self-Review

**1. Spec coverage** (against `docs/superpowers/specs/2026-07-07-refine-issue-skill-design.md`):

- Single self-contained `SKILL.md`, no `Workflow`, roles inline (spec §2, §7): Task 2, verified Step 4.
- Skill in `skills/refine-issue/` (spec §2, §11): Task 2 path; global constraints.
- Bounded PO/SE debate loop, default 2 rounds, shared transcript (spec §3): SKILL.md Step 2; validated Task 3 Step 2.
- Reviewer weights human comments (spec §4): Reviewer role; validated by target selection with comments.
- Adjudicator accept/reject with why (spec §4, §6): Adjudicator role.
- Planner assembles accepted only, produces body/summary/open-questions (spec §3, §6): Planner role.
- Per-role model tiers, Opus vs Sonnet, no effort (spec §4, §5): Model tiers section; rule file Task 1.
- Tier rule at `rules/subagent-model-tiers.md`, path-scoped, referenced from `AGENTS.md` (spec §5, §11): Task 1.
- Edit-in-place plus summary comment via `gh` (spec §2, §3 Step 8): SKILL.md Step 8.
- Approval gate owned by main skill; no write before approval (spec §2, §8): SKILL.md Step 7 to 8; validated Task 3 Steps 3 to 4.
- Chain `review-draft` for house style, no em dashes, no hard wrapping (spec §2, §3 Step 6): SKILL.md Step 6.
- Never drop silently: rejected changes shown, open questions surfaced (spec §8): SKILL.md Notes and Step 7; validated Task 3 Step 5.
- Structured findings list output (spec §6): each role's "End your reply with" block.

No gaps found.

**2. Placeholder scan:** No "TBD"/"TODO"/"handle edge cases"/"similar to Task N". The full content of both files is inline; `<number>` and `<refined_title>` are runtime arguments the skill fills, not plan placeholders.

**3. Type consistency:** The field names are consistent across roles and the plan: proposed-change fields (`origin`, `target`, `current`, `proposed`, `rationale`); adjudicator verdict (`accept`/`reject` + `why`); planner outputs (`refined_title`, `refined_body`, `change_summary`, `open_questions`). Target enum values (`title`, `body-section`, `acceptance-criteria`, `open-question`) match between the Product Owner role and the spec §6. The `review-draft` invocation in Step 6 matches the existing skill's issue-draft usage.
