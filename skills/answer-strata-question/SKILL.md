---
name: answer-strata-question
description: Answers a question about how Strata works or how to do something with it, from the verified Strata docs. Use whenever a Slack message asks a question about Strata rather than requesting a change to this repository.
---

# Answer a Strata question

Answers one question from the verified Strata docs in this repository's clone. This skill never
writes: no edits, commits, branches, issues, or pull requests. Doc gaps become tasks only when a
listed maintainer asks for one in the channel.

## How the parent session runs this skill

1. Dispatch exactly one sub-agent. Set its model to Sonnet. Open its prompt with the line
   `Work at medium effort.` and then paste the whole of "Sub-agent instructions" below, followed
   by the question verbatim under a heading `## The question`.
2. Post the text the sub-agent returns without rewriting it. No second pass, no summary, no
   preamble.
3. Do not answer the question yourself, and do not dispatch a second sub-agent for any reason.
4. Each follow-up question in a thread runs this skill again from step 1. Do not carry an earlier
   answer forward as fact.

## Sub-agent instructions

You answer one question about Strata from the docs in this repository's clone. Work the steps in
order. You must not write to the repository, open a branch, or touch GitHub in any way. Do not
dispatch sub-agents of your own.

### 1. Restate the question

Restate it to yourself in one line and note any Strata component it names: SDK, app template,
infra template, `platform-cli`, OSCER. Ask a clarifying question only if the message is
unintelligible. The asker may not be an engineer; they should get an answer, not an interview.

### 2. Pick candidate docs

Read `docs/INDEX.md` whole. It is grouped by source and doc type, one bullet per doc with a
one-line summary and a path relative to `docs/`. Choose up to five docs by judgment.

Then read `docs/graph.json` (its shape is in `references/graph-shape.md`, next to this file). For
each chosen doc, find its node by `path`, collect every node one edge away in either direction,
and add any whose title looks relevant. Cap the whole reading set at about eight docs.

### 3. Read the chosen docs

Read each file under `docs/` at the path from the index. Note which doc supports which claim as you
go; every claim in the answer needs a link.

### 4. Decide coverage

- The docs answer the question: go to step 6.
- The docs answer part of it: answer the covered part from the docs, name the uncovered part
  plainly, and take only that part through step 5.
- The docs do not answer it: take the whole question through step 5.

### 5. Fall back to source

Find the relevant repository in `sources.md`: the table has columns `id`, `type`, `repo`, `ref`,
`subpaths`, `notes`, and `repo` is a GitHub URL. Shallow-clone it once into a temporary directory:

```bash
git clone --depth 1 --branch <ref> <repo> /tmp/strata-source-<id>
```

- Clone succeeds: answer the uncovered part from the code. Label every code-derived statement
  "from the code, not the docs" and link the file:
  `<repo>/blob/<ref>/<path-in-repo>`.
- Clone fails: do not retry. Say which kind of failure it was, access denied or anything else,
  in one plain sentence. Say the docs do not cover the question and link `<repo>` so the asker can
  look or ask a maintainer.

### 6. Write the answer

Direct and Slack-length. Follow each factual claim with a link to the doc on `main`:

```text
https://github.com/navapbc/strata-documentation-engine/blob/main/docs/<path from the index>
```

No preamble, and do not restate the question in the reply. If step 5 ran, keep the code-derived
statements labeled as such.

### 7. Offer the handoff

Only if the answer surfaced a gap or a possible doc error, end with exactly this line:

```text
If this should be in the docs, a maintainer can ask for it here and an engineer can pick it up.
```

Otherwise end after the last claim.

### Hard rules

- No edits, commits, branches, issues, or pull requests.
- No general-knowledge answers about Strata. Docs, then code, then "not covered."
- You are the only sub-agent. Do not fan out.
- Links point at `main`, never at a pinned commit. A stale link is acceptable; the answer
  reflects `main` at clone time.
- Answer only the question in front of you. Earlier answers in the thread are not facts.
