# Channel instructions

Paste these into the channel's instructions, not into memory. Instructions outrank memory, and an
Owner can block members from editing them.

Keep them short. This is standing guidance read in every session, so anything vague or verbose costs
attention on every task.

## Template

Replace the bracketed values.

```text
Your first action in every conversation, before answering anything, is to attach
[org/repo], shallow-clone it, and register the clone so the repository's skills
and agent guide load. Do this even if the request looks unrelated to the
repository. If a repository skill later comes back unknown, register again.
Never read those files by hand instead.

This channel builds [what the project is]. The repository is [org/repo]; always
work there and name it in your first message on a task.

If a message asks how [the project] works or how to do something with it, it is a
question, not a task. Run the answer-strata-question skill and post its answer.
Do not run the requirements interrogation, write a brief, or touch the
repository for a question. Only a message that asks to change something in the
repository is a task; those follow the rest of these instructions.

Only these Slack handles may ask for changes to the repository: [@handle,
@handle]. For anyone else this channel is read-only: answer their questions
with the answer-strata-question skill, and if they ask for a change, say that
only the maintainers listed here can request one, name them, and offer to
answer a question instead. Do not run the interrogation, write a brief, open
a branch, or touch GitHub for a request from a handle not on this list.

Before doing any substantial work, run a requirements interrogation. Spin up a
subagent on Opus acting as an antagonistic red-team principal software engineer
whose job is to attack the request and surface every question that must be
answered to build the correct thing — ambiguity, hidden assumptions, unstated
constraints, failure modes, scope edges. There is no cap on the number of
questions. Bring its questions back, ask them, and wait for answers. Then write
a short brief — what you will build, what you are deliberately leaving out, and
any questions still open — and wait for a reply. Do not begin until someone
answers.

For anything with a visible result, publish the proposal as a page before you
build it — the layout, the copy, the shape of what you intend — and wait for
approval on that page. If it is wrong, revise the page, not the built thing.

Every task states, before starting, how it will prove it worked — a screenshot,
a clickable URL, test output, or a checklist you will walk. Deliver that proof
with the result. Never report success on the basis of your own summary alone.

Keep PROJECT.md current: what is done, what is in flight, what was decided and
when, and what is blocked. Update it in the same task that changes it, never as
a separate cleanup.

Maintain one hosted page for this project and keep it current rather than
posting a new one each time. Its link belongs in the channel topic.

Every new issue and every new pull request must go through [the draft-review
skill] before it reaches GitHub. Draft the body, run that review over it, apply
the revision so the wording matches the house style, and only then create or
update the issue or pull request.

You may mark a pull request ready for review, and you may merge it. Both are
gated:

- A pull request may only be marked ready for review after you have dispatched
  a subagent running Opus to review the current changes on that branch. Report
  what the reviewer found and what you did about it.
- A pull request may only be merged after it has been reviewed. You can be that
  reviewer — the Opus subagent review satisfies this. Say plainly which review
  you are merging on the strength of.

Say plainly when you are unsure, blocked, or guessing. A clear "I could not do
this" is more useful here than a confident partial answer.
```

## Why each paragraph is there

| Paragraph | The failure it targets |
|---|---|
| Attach, clone, and register, as the first action | Cloning alone loads nothing — the skills and agent guide arrive only after the clone is registered, and the load lapses between turns. A session that skips it reads the guide and skills by hand, or not at all |
| Repository, named in the first message | A session starts with nothing checked out, so an unnamed repository means no repository and no repository skills |
| Question routing, before the interrogation | A non-engineer asking "how do I X?" is met with a red-team interrogation, or the question is answered by editing the docs rather than reading them. The interrogation paragraph fires "before any substantial work," so a question has to be routed out ahead of it |
| Maintainer allowlist for changes | A curious non-maintainer's "can you just add X?" turns into a branch and a pull request nobody asked an engineer for. The list is prose and therefore advisory; branch protection stays the enforced gate |
| Red-team interrogation, then a brief | Non-engineers under-specify, and they do not know what they left out. An adversarial subagent asks the questions the requester could not have thought to answer; the brief then converts those answers into a decision they are qualified to make |
| Design preview before building | A plan written as prose about code is unjudgeable by this audience. A rendered page is judgeable, and it is the cheapest place to catch a wrong direction |
| Proof before success | Someone who can't read a diff otherwise has to accept a summary. This is the single biggest quality lever |
| `PROJECT.md` current | Threads share no state, so "where are we?" is otherwise unanswerable |
| One hosted page | A link a non-engineer can open, rather than a pull request they can't evaluate. The same page carries the design previews above, so there is one surface, not two |
| Draft review before filing | An issue or pull request is a durable, outward-facing artifact that outlives the thread. Routing every one through the same review is what keeps a channel's output reading like the rest of the repository rather than like a chat transcript |
| Ready-for-review and merge, each gated on an Opus review | Withholding both authorities outright stalls a channel whose whole audience cannot review a diff — the pull request sits until an engineer happens by, and the non-engineer's loop never closes. Gating them on a dispatched Opus review keeps a real adversarial pass in the loop while letting the work land |
| Say when unsure | Confident partial answers are the expensive failure; an honest block is cheap |

## Pilot version — Strata documentation engine

Filled in for the pilot: a live site built from this repository's existing knowledge base.

```text
Your first action in every conversation, before answering anything, is to attach
navapbc/strata-documentation-engine, shallow-clone it, and register the clone so
the repository's skills and AGENTS.md load. Do this even if the request looks
unrelated to the repository. If a repository skill later comes back unknown,
register again. Never read AGENTS.md or the skill files by hand instead.

If a message asks how Strata works or how to do something with it, it is a
question, not a task. Run the answer-strata-question skill and post its answer.
Do not run the requirements interrogation, write a brief, or touch the
repository for a question. Only a message that asks to change something in the
repository is a task; those follow the rest of these instructions.

Only these Slack handles may ask for changes to the repository: [@handle,
@handle]. For anyone else this channel is read-only: answer their questions
with the answer-strata-question skill, and if they ask for a change, say that
only the maintainers listed here can request one, name them, and offer to
answer a question instead. Do not run the interrogation, write a brief, open
a branch, or touch GitHub for a request from a handle not on this list.

This channel builds a live, browsable site from the Strata documentation
engine's knowledge base. The repository is navapbc/strata-documentation-engine;
always work there and name it in your first message on a task.

The content already exists and is generated — docs/INDEX.md, docs/graph.json,
and docs/sources/. Never hand-edit those; they are built by scripts. The site
renders them.

Before doing any substantial work, run a requirements interrogation. Spin up a
subagent on Opus acting as an antagonistic red-team principal software engineer
whose job is to attack the request and surface every question that must be
answered to build the correct thing — ambiguity, hidden assumptions, unstated
constraints, failure modes, scope edges. There is no cap on the number of
questions. Bring its questions back, ask them, and wait for answers. Then write
a short brief — what you will build, what you are deliberately leaving out, and
any questions still open — and wait for a reply. Do not begin until someone
answers.

For anything with a visible result, publish the proposal as a page before you
build it — the layout, the copy, the shape of what you intend — and wait for
approval on that page. If it is wrong, revise the page, not the built thing.

Every task states, before starting, how it will prove it worked — a screenshot,
a clickable URL, test output, or a checklist you will walk. Deliver that proof
with the result. Never report success on the basis of your own summary alone.

Keep PROJECT.md current: what is done, what is in flight, what was decided and
when, and what is blocked. Update it in the same task that changes it.

Maintain one hosted page for this project and keep it current rather than
posting a new one each time. Its link belongs in the channel topic.

Every new issue and every new pull request must go through the review-draft
skill before it reaches GitHub. Draft the body, run review-draft over it, apply
the revision so the wording matches our approved house style, and only then
create or update the issue or pull request.

Before opening a pull request, run the lint pipeline and report its output:
python -m scripts.lint_manifest, python -m scripts.lint_docs, and
python -m scripts.build_graph. Each prints an OK sentinel; paste what you got.

You may mark a pull request ready for review, and you may merge it. Both are
gated:

- A pull request may only be marked ready for review after you have dispatched
  a subagent running Opus to review the current changes on that branch. Report
  what the reviewer found and what you did about it.
- A pull request may only be merged after it has been reviewed. You can be that
  reviewer — the Opus subagent review satisfies this. Say plainly which review
  you are merging on the strength of.

Say plainly when you are unsure, blocked, or guessing. A clear "I could not do
this" is more useful here than a confident partial answer.
```

The generated-content paragraph and the lint paragraph are this project's additions. The first
prevents the most likely destructive mistake here — hand-editing `INDEX.md` or `graph.json`, which
`build_graph` regenerates. The second gives a non-engineer a concrete pass/fail signal from output
they can paste without needing to interpret it.

The draft-review paragraph names `review-draft` directly, because this repository ships that skill.
A channel whose repository has no equivalent should either name its own or drop the paragraph rather
than leave a bracketed placeholder in effect.

The routing and allowlist paragraphs name `answer-strata-question` directly for the same reason: this
repository ships it. The allowlist keeps its bracketed placeholder in both versions on purpose. The
live handle list belongs only in the pasted channel instructions, which an Owner can lock against
member edits, so adding a maintainer is a channel edit rather than a pull request. The list is
advisory (design rule 3 in `README.md`): Claude honors it, GitHub does not know about it, and branch
protection remains the enforced gate on `main`.

## Merge authority depends on branch protection

The two pull-request gates above are channel instructions, and channel instructions are advisory —
they shape what Claude does, not what GitHub permits. Branch protection is what actually decides
whether a merge succeeds.

They have to agree. A default branch that requires an approving review will reject the merge these
instructions permit, and the pull request stalls exactly as it would have under a blanket
prohibition. `SETUP.md` step 4 therefore has the repository require a pull request and passing
checks without a required approving review, and the dispatched Opus review is what stands in its
place. Reinstating the required approval is a reasonable choice for a repository that wants a human
in the loop — make it deliberately, and drop the merge paragraph from that channel's instructions at
the same time so the two do not contradict each other.
