# Answering Strata questions from Slack through Claude Tag

- **Date:** 2026-09-02
- **Status:** approved design, awaiting implementation plan
- **Issue:** #40 (reframed around this design); #42 closes as superseded
- **Channel:** `#strata-claude-tag`, already configured to attach, clone, and register this repository
- **Audience:** two groups sharing one channel. Non-maintainers, who ask questions about Strata and
  have no write access to the repository. Engineers, who work on the repository and pick up doc gaps
  the questions expose.
- **Deliverable:** one repository skill, two channel-instruction paragraphs (question routing and a
  maintainer allowlist), one verification probe

## Why Claude Tag

An earlier approach (`strata-qa/`, on branches `baonguyenNava/30-strata-qa-cli` and
`baonguyenNava/40-strata-qa-slack-bot`) answered questions from a TypeScript Lambda that called the
Cursor API through its own Slack bot. Claude Tag already provides the Slack connection, the GitHub
connection, the clone of this repository, and access control over who may post in the channel. A
separate bot, API key, and Lambda duplicate all of that. Nothing from `strata-qa/` is on `main`, and
this design references none of it.

Access control is in scope, split along the two audiences. Anyone Claude Tag lets post in the
channel may ask a question. Only Slack handles on a maintainer list in the channel instructions may
ask for a change to the repository; for everyone else the channel is read-only and the only thing
Claude runs is the question-answering skill. The list is prose, so it is an advisory gate (kit design
rule 3: nothing important lives only in prose). The enforced backstops stay where they are: branch
protection on `main` and the single GitHub identity Claude Tag writes with.

## Design rules

1. **Zero code.** The skill is prose. Retrieval is Claude reading `docs/INDEX.md` and choosing docs
   by judgment. The graph is small enough (roughly sixty docs) to fit in context whole; a
   deterministic retriever in `scripts/` is deferred until the doc set grows past a few hundred.
2. **Docs, then code, then "not covered."** Every answer traces to a verified doc or, failing
   that, to a labeled source file. The skill never answers about Strata from general knowledge.
3. **A question is never met with an interrogation.** The kit's requirements interrogation exists
   for build tasks. Routing a question out before that rule fires is the whole job of the channel
   instruction.
4. **The skill never writes.** No edits, commits, branches, issues, or PRs. Doc gaps become tasks
   only when a listed maintainer asks for them to.
5. **Writes are gated on the sender, questions are not.** A change request from a handle not on
   the maintainer list gets a plain "this channel is read-only for you" plus an offer to answer
   questions, never the task flow. A question from anyone gets an answer.
6. **Sonnet at medium effort answers.** Reading a small doc set and drafting a cited answer is
   tier 2 work under `rules/subagent-model-tiers.md`. Opus stays reserved for the kit's
   interrogation and review gates.

## The skill: `answer-strata-question`

### Location and shape

`skills/answer-strata-question/SKILL.md`, a single prose file in the style of `onboard`, plus
`skills/answer-strata-question/references/graph-shape.md` describing the node fields (`id`,
`title`, `source`, `doc_type`, `tags`, `path`) and the edge list in `docs/graph.json`, so the
skill does not depend on the reader knowing `build_graph`.

The `skills/` directory is symlinked whole into `.claude/skills` and `.agents/skills`, so adding the
directory is enough for Claude Tag to load it once the repository is registered.

### Model

A skill cannot change the model of the session it runs in, so the skill dispatches exactly one
sub-agent on Sonnet at medium effort and that sub-agent runs steps 1 through 7 below. The parent
session posts the returned answer verbatim: no rewriting, no second pass, no further fan-out. The
dispatch names the model explicitly and asks for medium effort in its prompt; if the runtime exposes
no effort control, the model choice is the binding half and the effort request is best-effort.

This is the only sub-agent in the design. It exists to pin the model, not to parallelize.

### Description

The description is what Claude Tag matches on and so carries the routing trigger alongside the
channel instruction:

> Answers a question about how Strata works or how to do something with it, from the verified
> Strata docs. Use whenever a Slack message asks a question about Strata rather than requesting a
> change to this repository.

### Steps

1. **Restate the question** in one line and note any Strata component it names (SDK, app template,
   infra template, `platform-cli`, OSCER). Ask a clarifying question only if the message is
   unintelligible. Non-engineers should get an answer, not an interview.
2. **Pick candidate docs.** Read `docs/INDEX.md` whole and choose up to five docs by judgment. Then
   read `docs/graph.json` and add any doc one edge away from a chosen doc whose title looks
   relevant. Cap the reading set at about eight docs.
3. **Read the chosen docs** from the clone.
4. **Decide coverage.** If the docs answer the question, go to step 6. If they answer part of it,
   answer the covered part and mark the rest as uncovered before falling back.
5. **Fall back to source.** Look up the relevant repository in `sources.md` and shallow-clone it
   once. Answer the uncovered part from the code, with every code-derived statement labeled "from
   the code, not the docs" and linked to the file on GitHub. If the clone fails, report the error
   class plainly (access denied versus anything else), do not retry, and say the docs do not cover
   the question, linking the repository so the asker can look or ask a maintainer.
6. **Write the answer.** Direct, Slack-friendly length, each factual claim followed by a link to
   the doc on `main`:
   `https://github.com/navapbc/strata-documentation-engine/blob/main/docs/sources/<source>/<doc>.md`.
   No preamble and no restating the question in the reply.
7. **Offer the handoff** only when the answer surfaced a gap or a possible doc error: one closing
   line, "If this should be in the docs, a maintainer can ask for it here and an engineer can pick
   it up." This is the cue that flips the thread from question to task, and the allowlist paragraph
   decides whether the follow-up is accepted as one.

### Hard rules stated in the skill

- No edits, commits, branches, issues, or pull requests.
- No general-knowledge answers about Strata. Docs, then code, then "not covered."
- Exactly one sub-agent, Sonnet at medium effort, running the whole pass. No fan-out inside it and
  no rewrite of its answer by the parent.
- Links point at `main`, not at a pinned commit. The docs regenerate on a schedule and a stale link
  is acceptable; the answer reflects `main` at clone time.
- Each follow-up question in a thread runs the skill again rather than carrying an earlier answer
  forward as fact.

## The channel instructions

Two new paragraphs in the template in `claude-tag-kit/channel-instructions.md`, each with a row in
the "Why each paragraph is there" table, and both filled in for the pilot version. After merge, a
channel Owner pastes them into `#strata-claude-tag` and fills in the handle list.

**Placement:** both directly after the "attach, clone, register" paragraph and before the
requirements-interrogation paragraph, routing first, then the allowlist. The interrogation paragraph
says "before doing any substantial work," so a question must be routed out, and a non-maintainer's
change request turned away, before that rule fires.

**Routing paragraph:**

```text
If a message asks how Strata works or how to do something with it, it is a
question, not a task. Run the answer-strata-question skill and post its answer.
Do not run the requirements interrogation, write a brief, or change anything
in the repository for a question. Only a message that asks to change something
in the repository is a task; those follow the rest of these instructions.
```

**Allowlist paragraph:**

```text
Only these Slack handles may ask for changes to the repository: [@handle,
@handle]. For anyone else this channel is read-only: answer their questions
with the answer-strata-question skill, and if they ask for a change, say that
only the maintainers listed here can request one, name them, and offer to
answer a question instead. Do not run the interrogation, write a brief, open
a branch, or touch GitHub for a request from a handle not on this list.
```

The repository copy carries the bracketed placeholder in both the template and the pilot version.
The live list lives only in the pasted channel instructions, which an Owner can lock against member
edits; keeping handles out of the repository means adding a maintainer is a channel edit, not a PR.

**Table rows.** Routing: a non-engineer asking "how do I X?" met with a red-team interrogation, or a
question answered by editing the docs rather than reading them. Allowlist: a curious non-maintainer's
"can you just add X?" turning into a branch and a pull request nobody asked an engineer for.

**Routing edge case.** "Why don't the docs mention X?" is a question first. The skill answers it,
including "they don't cover it," and its handoff line invites the follow-up that becomes a task. The
instruction does not need to name this case; the skill's step 7 handles it.

**What the sender gate is and is not.** Claude Tag shows the sender of each message, so the
instruction can read the handle and route on it. It is still prose: Claude honors it, GitHub does
not know about it. Kit design rule 4 in `claude-tag-kit/README.md` currently says a "who sent this"
check cannot be enforced, which is true of enforcement and this design does not claim otherwise; the
rule's wording is amended (see Documentation maintenance) so it stops implying such a check is
pointless as an advisory gate. An ambiguous message fails soft: an answer plus an offer, never an
interrogation.

## Source-access checkpoint

Whether Claude Tag's GitHub connection can clone the private repositories in `sources.md` is
unknown. Nothing else in the design depends on the answer, so this is a probe run after the skill
lands, not a blocker.

**Probe:** in `#strata-claude-tag`, ask a question the docs demonstrably do not cover but the SDK
code would answer. Step 5 attempts the clone.

- **Clone succeeds:** step 5 stays as written.
- **Clone fails for access:** step 5's failure branch already answers correctly. Decide separately
  whether to grant Claude Tag read access to the source repositories or leave the fallback as a
  pointer. The skill text does not change either way.

## Verification

The skill is prose, so its tests are behavioral and run in the channel.

1. **Docs-covered question.** Ask something `docs/INDEX.md` clearly covers. Expect a direct answer
   whose links resolve on `main`, no interrogation, no repository change.
2. **Uncovered question.** The probe above. Expect the source fallback or the "not covered" reply,
   plus the handoff line.
3. **Task disguised as a question.** "Can you update the docs to mention X?" Expect the kit's task
   flow, not the skill.
4. **Follow-up in thread.** Ask a second question in the same thread. Expect the skill to run again.
5. **Change request from an unlisted handle.** From an account not on the list, ask for a doc edit.
   Expect the read-only reply naming the maintainers, an offer to answer a question, and no
   interrogation, branch, or GitHub activity.
6. **Change request from a listed handle.** The same request from a listed account. Expect the
   kit's task flow.
7. **Model pin.** For test 1, confirm from the session's dispatch record that the answer came from
   a single Sonnet sub-agent and that the parent posted it unchanged.

`python -m pytest` and the lint pipeline (`lint_manifest`, `lint_docs`, `build_graph`) stay green;
the change adds no Python.

## Documentation maintenance

- `README.md`: list the new skill.
- `AGENTS.md`: no change; the architecture, commands, and workflow it describes are untouched.
- `claude-tag-kit/channel-instructions.md`: the two paragraphs and table rows above, in the
  template and the pilot version.
- `claude-tag-kit/README.md`: design rule 4 reworded from "a check asking 'who sent this' cannot be
  enforced" to say that such a check is advisory, so the allowlist paragraph and the rule agree.
- `rules/subagent-model-tiers.md`: no change. Sonnet for a scoped read-and-draft pass is already
  tier 2; the effort level is set here because that rule deliberately covers model only.

## Out of scope

- Capturing unanswered questions anywhere (an improvements log, a canvas, an issue). Revisit once
  real questions show what the gaps look like.
- Pinning citation links to a commit SHA.
- A deterministic retriever in `scripts/`.
- Any change to who may post in the channel. This design gates what a poster may ask for, not who
  may post; membership stays with Slack and the channel Owner.
- Enforcing the maintainer list outside prose (a hook, or a per-sender GitHub identity). Branch
  protection remains the enforced gate on `main`.
