# Answering Strata questions from Slack through Claude Tag

- **Date:** 2026-09-02
- **Status:** approved design, awaiting implementation plan
- **Issue:** #40 (reframed around this design); #42 closes as superseded
- **Channel:** `#strata-claude-tag`, already configured to attach, clone, and register this repository
- **Audience:** two groups sharing one channel. Non-maintainers, who ask questions about Strata and
  have no write access to the repository. Engineers, who work on the repository and pick up doc gaps
  the questions expose.
- **Deliverable:** one repository skill, one channel-instruction paragraph, one verification probe

## Why Claude Tag

An earlier approach (`strata-qa/`, on branches `baonguyenNava/30-strata-qa-cli` and
`baonguyenNava/40-strata-qa-slack-bot`) answered questions from a TypeScript Lambda that called the
Cursor API through its own Slack bot. Claude Tag already provides the Slack connection, the GitHub
connection, the clone of this repository, and access control over who may post in the channel. A
separate bot, API key, and Lambda duplicate all of that. Nothing from `strata-qa/` is on `main`, and
this design references none of it.

Access control is out of scope. Claude Tag decides who can post in the channel; the skill treats
every message that reaches it as authorized.

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
   only when a person asks for them to.

## The skill: `answer-strata-question`

### Location and shape

`skills/answer-strata-question/SKILL.md`, a single prose file in the style of `onboard`, plus
`skills/answer-strata-question/references/graph-shape.md` describing the node fields (`id`,
`title`, `source`, `doc_type`, `tags`, `path`) and the edge list in `docs/graph.json`, so the
skill does not depend on the reader knowing `build_graph`.

The `skills/` directory is symlinked whole into `.claude/skills` and `.agents/skills`, so adding the
directory is enough for Claude Tag to load it once the repository is registered.

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
   line, "If this should be in the docs, say so and an engineer can pick it up." This is the cue
   that flips the thread from question to task.

### Hard rules stated in the skill

- No edits, commits, branches, issues, or pull requests.
- No general-knowledge answers about Strata. Docs, then code, then "not covered."
- No sub-agents. This is a single-pass read-and-answer task; dispatching adds latency for no gain.
- Links point at `main`, not at a pinned commit. The docs regenerate on a schedule and a stale link
  is acceptable; the answer reflects `main` at clone time.
- Each follow-up question in a thread runs the skill again rather than carrying an earlier answer
  forward as fact.

## The channel instruction

A new paragraph in the template in `claude-tag-kit/channel-instructions.md`, with a matching row in
the "Why each paragraph is there" table. After merge, a channel Owner pastes the paragraph into
`#strata-claude-tag`.

**Placement:** directly after the "attach, clone, register" paragraph and before the
requirements-interrogation paragraph. The interrogation paragraph says "before doing any
substantial work," so a question must be routed out before that rule fires.

**Wording:**

```text
If a message asks how Strata works or how to do something with it, it is a
question, not a task. Run the answer-strata-question skill and post its answer.
Do not run the requirements interrogation, write a brief, or touch the
repository for a question. Only a message that asks to change something in the
repository is a task; those follow the rest of these instructions.
```

**Table row.** The failure it targets: a non-engineer asking "how do I X?" met with a red-team
interrogation, or a question answered by editing the docs rather than reading them.

**Routing edge case.** "Why don't the docs mention X?" is a question first. The skill answers it,
including "they don't cover it," and its handoff line invites the follow-up that becomes a task. The
instruction does not need to name this case; the skill's step 7 handles it.

Routing is by message content, not by sender. Claude Tag controls message ingestion, so a check on
who sent a message cannot be enforced (see design rule 4 in `claude-tag-kit/README.md`). An
ambiguous message fails soft: an answer plus an offer, never an interrogation.

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

`python -m pytest` and the lint pipeline (`lint_manifest`, `lint_docs`, `build_graph`) stay green;
the change adds no Python.

## Documentation maintenance

- `README.md`: list the new skill.
- `AGENTS.md`: no change; the architecture, commands, and workflow it describes are untouched.
- `claude-tag-kit/channel-instructions.md`: the paragraph and table row above.

## Out of scope

- Capturing unanswered questions anywhere (an improvements log, a canvas, an issue). Revisit once
  real questions show what the gaps look like.
- Pinning citation links to a commit SHA.
- A deterministic retriever in `scripts/`.
- Any change to who may post in the channel.
