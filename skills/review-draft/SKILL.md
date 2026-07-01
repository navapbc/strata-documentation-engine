---
name: review-draft
description: Reviews a durable, outward-facing draft (a GitHub issue, a PR description, or a commit-message set) before it is filed. Runs a deterministic review workflow — an Opus reviewer finds issues across five dimensions, then Sonnet agents adjudicate the findings and revise. Use before creating an issue or PR, or finalizing commit messages.
---

# Review Draft

Reviews a draft before it ships and returns a revised version. This skill is an **orchestrator**:
it runs a deterministic `Workflow` that reviews, adjudicates, and revises, then presents the
result. It does not file anything; filing stays with the caller after the draft is approved.
Subagents never talk to the user.

## When to use

Before filing any durable, outward-facing artifact:

- a GitHub issue
- a pull request description
- a commit message or a set of commit messages

Skip it for throwaway or internal scratch text that no one else will read.

## What it checks

The reviewer applies five dimensions; each is a separate lens. The authoritative rubric lives in
`references/agents/reviewer.md`.

1. **Quality.** Accurate, complete, useful; claims verifiable; test-plan items checkable.
2. **Template adherence.** Matches the target template's sections, order, and conventions.
3. **Voice.** Warm but professional, plain language, complete sentences, "we" for shared decisions.
4. **Punctuation.** No em dashes (hard rule); en dashes only for genuine numeric ranges.
5. **House style and stated preferences.** Repo conventions and anything the requester asked for.

Each finding carries a severity: BLOCKER / MAJOR / MINOR / NIT. An em dash anywhere is at least a
MAJOR finding and must be fixed before filing.

## Steps

### 1. Gather inputs

Identify the draft text, the artifact type (`issue` / `pr` / `commit`), and the matching template
file path (`.github/ISSUE_TEMPLATE/<...>.md`, `.github/PULL_REQUEST_TEMPLATE.md`, or `.gitmessage`).
If the draft lives in a file, read it.

### 2. Run the review workflow

Resolve `<REFS>` = absolute path to `skills/review-draft/references`. Read
`workflows/review-draft.mjs` and call:

```
Workflow({ script: <contents of review-draft.mjs>,
           args: { refs_dir: "<REFS>", draft: "<draft text>",
                   artifact_type: "issue" | "pr" | "commit",
                   template_path: "<template path or empty>" } })
```

The workflow runs three phases: an **Opus** reviewer at **high** effort finds issues across the
five dimensions, a **Sonnet** adjudicator at **medium** effort confirms or rejects each finding,
and a **Sonnet** reviser at **medium** effort applies only the confirmed findings. It short-circuits
when the reviewer finds nothing or the adjudicator confirms nothing.

Commit to the `Workflow` tool with **no fallback**: if `Workflow` is unavailable in the runtime,
stop and escalate — do not silently substitute another dispatch.

### 3. Present results

The workflow returns `revised_draft`, `applied` (confirmed findings that were applied), `rejected`
(findings the adjudicator rejected, each with a `why`), the reviewer `verdict`, and any `em_dashes`
hits. Present the revised draft to the user for approval, and note every rejected finding and the
reason it was rejected. Do not file the artifact; that is the caller's step once approved.

## Notes

- The reviewer runs on Opus at high effort; the adjudicator and reviser run on Sonnet at medium
  effort.
- An em dash anywhere is at least a MAJOR finding and must be fixed before filing.
- This skill complements the "Drafting durable artifacts" convention in `AGENTS.md`.
