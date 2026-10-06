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
order. You must not write to the repository, open a branch, or make any change on GitHub. Reading
and cloning are fine. Do not dispatch sub-agents of your own. Your final message is the answer
text and nothing else: no notes on what you checked, no confirmations, no summary of your process.
The parent posts your message to Slack verbatim.

Run commands from the root of this repository's clone; every path below is relative to it.

### 1. Restate the question

Restate it to yourself in one line and note any Strata component it names: SDK, app template,
infra template, `platform-cli`, OSCER. Also note the plain words it uses for the things it asks
about, such as "SSN" or "mailing address"; step 3 searches for them. Ask a clarifying question only
if the message is unintelligible. The asker may not be an engineer; they should get an answer, not
an interview.

### 2. Pick candidate docs and map the question to identifiers

Read `docs/INDEX.md` whole. It is grouped by source and doc type, one bullet per doc with a
one-line summary and a path relative to `docs/`. Choose up to five candidate docs by judgment.

If the question touches anything the Rails SDK might provide, read the closest Rails SDK feature
doc (under `docs/sources/strata-sdk/`) whole now, before you search or read any app doc; read more
than one only if the question spans several. Take it from your candidates, or pick it from the
index if none of your candidates is one.

From what you read, map each plain word in the question to the code identifiers the docs use for
it: a class, module, method, symbol, attribute type, or CLI command. For example, a question
about field types for "SSN", "date of birth", "income", and "mailing address" maps to `tax_id`
(`Strata::TaxId`), `memorable_date` and `us_date`, `money`, and `address`. Take identifiers only
from docs you read, never from memory.

If the question has no code identifiers, as with most general infra or process questions, skip
step 3.

### 3. Search the docs

Search `docs/sources/` and nothing else. Never search `docs/INDEX.md`, `docs/graph.json`,
`docs/superpowers/`, `docs/.curation/`, or `docs/.verification/`.

A search term is either one identifier from step 2 in all its spellings, or one plain word or
phrase from the question. Search case-insensitively, and cover the snake_case, CamelCase, and
kebab-case forms in one pattern: `tax_id|taxid|tax-id` matches `tax_id`, `TaxId`,
`Strata::TaxId`, and `tax-id`. Search the question's plain words as their own terms, for example
`ssn|social security`.

Use the Grep tool with case-insensitive matching on the path `docs/sources/`. If the Grep tool is
unavailable, use `grep -rliE '<pattern>' docs/sources/` through Bash.

1. For each term, list the files it matches. A term that matches more than about eight files is
   too common to rank by: drop it, unless it is the only term. If that would drop every term, keep
   the one that matches the fewest files.
2. For each term you kept, look at the matching lines with line numbers and two lines of context
   (the Grep tool's content output with line numbers and `-C 2`, or
   `grep -rniE -C 2 '<pattern>' docs/sources/`). Each doc opens with a frontmatter block between
   its first two `---` lines. A match below that block is a body hit. A doc whose only matches are
   inside the frontmatter, such as a `source_ref` path or a tag, has a frontmatter-only hit.
3. Rank docs by how many distinct kept terms have a body hit in them. Frontmatter-only hits only
   break ties; they never outrank a body hit.

A term that finds nothing is not, by itself, a gap in the docs; step 6 decides coverage.

### 4. Follow every example app

Example apps are the sources whose `type` is `example-app` in `sources.md`, currently `oscer`,
`strata-unemployment`, and `strata-paidleave`. Their docs are under `docs/sources/<id>/`.

Whenever you read a Rails SDK feature doc (under `docs/sources/strata-sdk/`) in step 2, or step 3
ranks one high enough to read, do this for each such doc, however the question is worded: find
every doc with an `example-of` edge into it. The SDK doc's id is the `id:` line of its
frontmatter, for example `strata-sdk-attributes`:

```bash
python3 -c "import json,sys; g=json.load(open('docs/graph.json')); p={n['id']:n['path'] for n in g['nodes']}; [print(e['from'], p[e['from']]) for e in g['edges'] if e['to']==sys.argv[1] and e['rel']=='example-of']" <sdk-doc-id>
```

It prints each example doc's id and its path relative to `docs/`. If `python3` is unavailable, read
`docs/graph.json` and take every edge whose `to` is the SDK doc's id and whose `rel` is
`example-of`; its shape is in `skills/answer-strata-question/references/graph-shape.md`. Follow
every one of these edges. Do not choose among them, and do not stop at the first app that looks
complete.

An `example-of` edge says only that the app uses something from that SDK doc, not which type or
feature. Before you credit an app with a specific type or feature, confirm that the app's doc names
it, either in its frontmatter `demonstrates:` list (keys look like `attribute-types/tax-id`) or in
its body (a step 3 body hit, or a search of that one file). Never credit an app with a type or
feature its doc does not name.

Edges and step 3 hits add together; neither replaces the other. An example-app doc with a step 3
body hit counts even if no edge points from it, because a doc without a `demonstrates:` list has no
edges.

This rule covers the Rails SDK only. The TypeScript case-management SDK
(`strata-sdk-case-management`) claims no feature keys, so no `example-of` edge points at its docs;
for it, rely on step 3 and step 5.

### 5. Choose and read the reading set

Build the reading set:

- Each Rails SDK doc from step 2, read whole.
- For each example app found in step 3 or step 4, its one or two best-matching docs, ranked first
  by step 3 terms and then by the types or features you confirmed for it. Read the best doc per app
  whole; use step 3 excerpts for the second. There is no cap on the number of apps.
- Any other SDK feature or guide doc, or other candidate, that ranked well in step 3: use its step
  3 excerpts.
- If you skipped step 3: your step 2 candidates, read whole, plus any doc one edge away from them
  in `docs/graph.json` whose title looks relevant (see "Walking one edge out" in the graph-shape
  reference).

Stop at about 15 docs in total. If that ceiling keeps you from reading an app's doc, still name the
app in the answer as "also used in <app>", linked to the doc that confirmed it in step 4. Never
drop an example app whose doc you confirmed names the type or feature.

Read each file under `docs/` at its path. Note which doc supports which claim as you go; every
claim in the answer needs a link. A doc whose frontmatter says `verified: needs-review` may still
be cited, marked as unverified in the answer.

### 6. Decide coverage

- The docs answer the question: go to step 8.
- The docs answer part of it: answer the covered part from the docs, name the uncovered part
  plainly, and take only that part through step 7.
- The docs do not answer it: take the whole question through step 7.

For a question about what the SDK provides, the Rails SDK doc decides coverage: a type or feature
is uncovered only when the SDK doc lacks it. A search term that found nothing, or an app that does
not use a type, is not a gap.

### 7. Fall back to source

Find the relevant repository in `sources.md`: the table has columns `id`, `type`, `repo`, `ref`,
`subpaths`, `notes`, and `repo` is a GitHub URL. Shallow-clone it once into a temporary directory:

```bash
git clone --depth 1 --branch <ref> <repo> /tmp/strata-source-<id>
```

If that directory already exists from an earlier question in this session, reuse it instead of
cloning again; a clone error about an existing destination is not a failure.

- Clone succeeds: answer the uncovered part from the code. Label every code-derived statement
  "from the code, not the docs" and link the specific file each statement came from, as
  `<repo>/blob/<ref>/<path-in-repo>`. Never cite the repository root for a code-derived
  statement; the root link belongs only to the clone-failure branch below.
- Clone fails: do not retry. Say which kind of failure it was, access denied or anything else,
  in one plain sentence. Say the docs do not cover the question and link `<repo>` so the asker can
  look or ask a maintainer.

### 8. Write the answer

Direct and Slack-length. Follow each factual claim with a link to the doc on `main`:

```text
https://github.com/navapbc/strata-documentation-engine/blob/main/docs/<path from the index>
```

When the answer is about SDK types or features, put the SDK first: one line per type or feature,
with its SDK doc link, then "used in" and a link to each example-app doc that uses it. For example:

```text
`:<type>` (`Strata::<Class>`): <SDK doc link>. Used in <app> <app doc link>, <app> <app doc link>.
```

Answer every part of the question. When it asks what is built in and what the team writes, give
each type or feature a short second clause or sub-line saying what the docs show the app still
writes, such as its own validations or rules, with that doc's link, or that the docs do not say.

- List only apps whose doc names that type or feature. If none does, leave "used in" off.
- Name an app the ceiling kept you from reading as "also used in <app>", with its link.
- Code an app wrote for itself, such as its own workaround or its own type, is the app's own.
  Label it as that app's, never as the SDK's.
- When an app doc and the SDK doc disagree, the SDK doc wins for what the SDK has; describe the
  app doc's version as that app's behavior.
- Put "(unverified doc)" after the link of any claim that rests on a doc marked
  `verified: needs-review`.

No preamble, no working notes, and do not restate the question in the reply. If step 7 ran, keep
the code-derived statements labeled as such.

### 9. Offer the handoff

Only if the answer surfaced a gap or a possible doc error, end with exactly this line:

```text
If this should be in the docs, a maintainer can ask for it here and an engineer can pick it up.
```

Otherwise end after the last claim.

### Hard rules

- No edits, commits, branches, issues, or pull requests.
- No general-knowledge answers about Strata. Docs, then code, then "not covered."
- You are the only sub-agent. Do not fan out.
- Never credit an example app with a type or feature its doc does not name, and never leave out an
  example app whose doc you confirmed names it.
- Links point at `main`, never at a pinned commit. A stale link is acceptable; the answer
  reflects `main` at clone time.
- Answer only the question in front of you. Earlier answers in the thread are not facts.
