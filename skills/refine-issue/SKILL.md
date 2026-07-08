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
Add its proposed changes to the collected set. Carry its conflict list forward: pass it to the
Adjudicator in Step 4, and surface any conflict that stays unresolved at the gate in Step 7 so
nothing is dropped silently.

### 4. Adjudicate

Dispatch the Adjudicator (Opus, general-purpose) with the issue, the full set of proposed changes,
and the Reviewer's conflict list. Collect a verdict per change. Keep the accepted set, the rejected
set with reasons, and any conflict the adjudication left unresolved.

### 5. Plan the refined issue

Dispatch the Planner (Sonnet, general-purpose) with the issue and the accepted changes only. Collect
refined_title, refined_body, change_summary, and open_questions.

### 6. Style-check the body

Run the `review-draft` skill on refined_body as an issue draft. Apply the findings you accept. This
enforces house style, no em dashes, and no hard-wrapped paragraphs.

### 7. Present and ask permission

Show the user the refined title and body, the change summary, the open questions, every rejected
change with its reason, and any unresolved human-comment conflict. Ask for explicit permission to
apply the changes to the issue. Do not write anything yet.

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
