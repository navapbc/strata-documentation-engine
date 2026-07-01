---
name: review-draft
description: Reviews a durable, outward-facing draft (a GitHub issue, a PR description, or a commit-message set) before it is filed. Dispatches review subagents across defined dimensions, adjudicates their findings, and revises. Use before creating an issue or PR, or finalizing commit messages.
---

# Review Draft

Reviews a draft before it ships and returns a revised version. This skill is an orchestrator:
it dispatches review subagents, adjudicates their findings, and applies the ones it agrees with.
It does not file anything; filing stays with the caller after the draft is approved.

## When to use

Before filing any durable, outward-facing artifact:

- a GitHub issue
- a pull request description
- a commit message or a set of commit messages

Skip it for throwaway or internal scratch text that no one else will read.

## Dimensions

Review the draft along these five dimensions. Each is a separate lens; do not collapse them.

1. **Quality.** Accurate, complete, and useful to the reader. Claims are verifiable. Nothing
   misleading. Test-plan items (for a PR) are actually checkable.
2. **Template adherence.** Matches the target template's sections, order, and conventions. For
   issues, the relevant `.github/ISSUE_TEMPLATE/` file. For PRs, `.github/PULL_REQUEST_TEMPLATE.md`.
   For commits, the `.gitmessage` scaffold (imperative subject 50 chars or less, body explains why).
3. **Voice.** Warm but professional, plain language where the audience is mixed, concise by cutting
   filler rather than clipping into fragments, complete sentences, "we" for shared decisions.
4. **Punctuation and formatting.** No em dashes (hard rule). En dashes only for genuine numeric
   ranges. Line wrapping is by artifact: issue and PR bodies must not be hard-wrapped (one line per
   paragraph, since GitHub renders a single newline as a line break); a commit message body should
   wrap at 72 columns. See "Formatting issue and PR bodies" in `CONTRIBUTING.md`.
5. **House style and stated preferences.** Anything the repo's conventions or the requester has
   asked for.

## Steps

### 1. Gather inputs

Identify the draft text, the artifact type (issue / PR / commit), and the matching template file.
Read the template so the review can check adherence against it.

### 2. Dispatch reviewers

Dispatch review subagents in parallel, using a cheap model. Either one reviewer per dimension or a
single focused reviewer covering all five; prefer splitting when the draft is large or high-stakes.
Each reviewer must:

- report findings as a list, each with a location/quote, the issue, a concrete suggested fix, and a
  severity (BLOCKER / MAJOR / MINOR / NIT);
- run a literal em-dash check and report every hit;
- for an issue or PR body, check for hard-wrapped paragraphs (a paragraph broken across several
  short lines) and report each, since GitHub renders those newlines as line breaks;
- end with a one-paragraph verdict.

### 3. Adjudicate

For each finding, decide whether you agree. Do not apply findings blindly. Where you disagree,
record your reasoning and reject the finding rather than applying it. If your platform supports
replying to a reviewer, a brief exchange can resolve genuine ambiguity before you decide. Reject
findings that are wrong or that misread the draft's purpose, and say why.

### 4. Revise and present

Apply the findings you accept. Present the revised draft to the user for approval. Note any finding
you rejected and the reason. Do not file the artifact; that is the caller's step once approved.

## Notes

- Keep reviewers cheap and the adjudication in a more capable model.
- An em dash anywhere is at least a MAJOR finding and must be fixed before filing.
- A hard-wrapped issue or PR body is at least a MAJOR finding: it renders as broken lines on GitHub.
  Reflow each paragraph to a single line before filing.
- This skill complements the "Drafting durable artifacts" convention in `AGENTS.md`.
