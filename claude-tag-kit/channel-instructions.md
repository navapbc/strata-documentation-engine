# Channel instructions

Paste these into the channel's instructions, not into memory. Instructions outrank memory, and an
Owner can block members from editing them.

Keep them short. This is standing guidance read in every session, so anything vague or verbose costs
attention on every task.

## Template

Replace the bracketed values.

```text
This channel builds [what the project is]. The repository is [org/repo]; always
work there and name it in your first message on a task.

Before doing any substantial work, write a short brief and wait for a reply:
what you will build, what you are deliberately leaving out, and up to three
questions you need answered. Do not begin until someone answers.

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

Say plainly when you are unsure, blocked, or guessing. A clear "I could not do
this" is more useful here than a confident partial answer.

Never mark a pull request ready for review, and never merge one.
```

## Why each paragraph is there

| Paragraph | The failure it targets |
|---|---|
| Repository, named in the first message | A session starts with nothing checked out, so an unnamed repository means no repository and no repository skills |
| Brief before work | Non-engineers under-specify; this converts a vague ask into a decision they are qualified to make |
| Design preview before building | A plan written as prose about code is unjudgeable by this audience. A rendered page is judgeable, and it is the cheapest place to catch a wrong direction |
| Proof before success | Someone who can't read a diff otherwise has to accept a summary. This is the single biggest quality lever |
| `PROJECT.md` current | Threads share no state, so "where are we?" is otherwise unanswerable |
| One hosted page | A link a non-engineer can open, rather than a pull request they can't evaluate. The same page carries the design previews above, so there is one surface, not two |
| Say when unsure | Confident partial answers are the expensive failure; an honest block is cheap |
| Never ready-for-review, never merge | The one authority to withhold. Human review stays human |

## Pilot version — Strata documentation engine

Filled in for the pilot: a live site built from this repository's existing knowledge base.

```text
This channel builds a live, browsable site from the Strata documentation
engine's knowledge base. The repository is navapbc/strata-documentation-engine;
always work there and name it in your first message on a task.

The content already exists and is generated — docs/INDEX.md, docs/graph.json,
and docs/sources/. Never hand-edit those; they are built by scripts. The site
renders them.

Before doing any substantial work, write a short brief and wait for a reply:
what you will build, what you are deliberately leaving out, and up to three
questions you need answered. Do not begin until someone answers.

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

Before opening a pull request, run the lint pipeline and report its output:
python -m scripts.lint_manifest, python -m scripts.lint_docs, and
python -m scripts.build_graph. Each prints an OK sentinel; paste what you got.

Say plainly when you are unsure, blocked, or guessing. A clear "I could not do
this" is more useful here than a confident partial answer.

Never mark a pull request ready for review, and never merge one.
```

The generated-content paragraph and the lint paragraph are this project's additions. The first
prevents the most likely destructive mistake here — hand-editing `INDEX.md` or `graph.json`, which
`build_graph` regenerates. The second gives a non-engineer a concrete pass/fail signal from output
they can paste without needing to interpret it.
