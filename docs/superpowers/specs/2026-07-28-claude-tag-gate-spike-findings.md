# Findings: can a skill-shipped gate replace the strata-qa Lambda?

Date: 2026-07-28
Status: findings complete, decision open
Issue: #42

## Question

Can a Claude Tag skill that ships deterministic JavaScript gates preserve the grounding guarantee
`strata-qa` enforces today, without deploying the Slack gateway #40 specifies?

The guarantee at stake: `ground()` mechanically checks that every quote appears verbatim in the file
it cites and demotes the model's own verdict when it does not, and `run.ts` calls it unconditionally.
A model cannot claim `answered`; it can only propose it. A skill inverts that control, because the
agent decides whether to invoke the gate.

## Answer

**The port is faithful. The invocation guarantee is not recoverable, only observable.** Everything
that can be moved into code was moved into code and behaves identically to the original. What cannot
be moved is the certainty that the code runs.

## What was built

Under `skills/answer-strata-question/`:

| File | Lines | What it is |
|---|---|---|
| `SKILL.md` | 105 | The three-stage procedure |
| `bin/verify-answer.mjs` | 322 | The gate: `ground()` plus the CLI the Lambda gets from `run.ts` and `cli.ts` |
| `bin/verify-answer.test.mjs` | 404 | 20 cases ported from `grounding.test.ts`, 12 new for the CLI surface |
| `bin/select-candidates.mjs` | 159 | Deterministic candidate selection over `docs/graph.json` |
| `bin/differential.test.mjs` | 182 | Generated differential sweep against the original |
| `bin/reference-bridge.mts` | 32 | Spike scaffolding: runs the original TypeScript `ground()` |

Zero dependencies. No `package.json` under `skills/`, no `node_modules`, nothing added to the
repository's dependency surface. The runner is Node 22's built-in `node --test`.

### Finding 1: the port estimate was wrong by roughly a factor of two

The issue predicted "roughly 155 lines" and flagged that estimate as something the spike would check.
The gate came in at **322**.

The estimate was not wrong about `grounding.ts`, which ported almost verbatim. It was wrong because
it counted only the library. In the Lambda, `run.ts` and `cli.ts` supply answer extraction, the
refusal wording, exit codes, and the corpus plumbing; a standalone script has to carry those itself.
The lesson generalizes: when estimating a port out of a service, count the entry point, not the
function.

## Finding 2: the port is behaviourally identical (the headline)

`golden.json` could not be used here. It holds nine `{question, expect}` fixtures and records no
model answers, so there is nothing to replay through a gate. The harness generates cases from the
real corpus instead, with a fixed seed, and runs each through both implementations, comparing the
entire `GroundingResult`: status, sources, all five counts, and every per-citation flag.

| Seed | Cases | `answered` | `no_match` | `low_confidence` | Disagreements |
|---|---|---|---|---|---|
| 20260728 | 5000 | 2921 | 995 | 1084 | **0** |
| 1 | 5000 | 2896 | 1015 | 1089 | **0** |
| 99991 | 5000 | 2872 | 1020 | 1108 | **0** |
| 424242 | 5000 | 2924 | 1004 | 1072 | **0** |

20,000 generated cases, zero disagreements. The generator mutates both quotes (verbatim, rewrapped,
unicode-swapped, markdown-stripped, typo'd, truncated, blank, fabricated) and paths (`docs/` prefix,
`./` prefix, `#anchor`, `:12` and `:12:40` suffixes, padding, fabricated), and deliberately cites the
same document twice so the per-document gate is exercised rather than assumed.

**The harness was verified to fail.** A passing differential test proves nothing unless it can
detect a wrong port, so the exact semantic error the original's comments warn about was injected:
per-quote gating (`quotesVerified < citationsTotal`) in place of per-document gating
(`distinctDocs < docsCited`). The sweep caught **53 of 500** cases and the unit suite caught one.
Both were restored to green afterward.

Reproduce:

```bash
node --test skills/answer-strata-question/bin/differential.test.mjs
CASES=5000 SEED=1 node --test skills/answer-strata-question/bin/differential.test.mjs
```

## Finding 3: candidate selection narrows the corpus, and refuses some questions for free

`graph.json` indexes 56 documents, against 135 markdown files under `docs/`. Selecting from the graph
therefore excludes `.verification`, `.curation`, and `superpowers` **by data structure**, which is the
same exclusion `.dockerignore` performs for the image and for the same stated reason: extra search
space is the main cost driver, and a design spec must never be cited as a source.

Measured across the nine golden questions:

| | Lexical matches of 56 | At `--limit 8` |
|---|---|---|
| Range | 0 to 28 | 0 to 8 |
| Mean | 17.0 | 7.1 |
| Corpus excluded | 70 percent | 87 percent |

One result is worth calling out. "What is the best pizza topping?" scores **zero** candidates, so the
skill refuses it before reading a document or composing an answer. That refusal costs nothing. The
other three refusal fixtures are topically adjacent to real documents ("the production database
password for OSCER" matches the OSCER docs on every word that matters) and still score 8 candidates,
so they must go to the model and be caught by the gate. Cheap refusals are available only for
questions that are off-corpus, not for questions that are merely unanswerable.

**Selection cannot cause a wrong answer.** It decides only what gets read; `verify-answer.mjs`
independently checks every quote against the same graph. A selector that misses the right document
costs recall, never soundness. That asymmetry is what makes a plain lexical scorer acceptable.

**Recall is unmeasured.** The top-ranked candidate is topically correct for all five answerable
fixtures, and the fixture about the CLI wrapping Copier ranks "How install and update work (Copier
wrapper)" fourth, which is encouraging. But whether the model can actually answer from the top eight
needs a live run, and this spike could not do one.

## Finding 4: control inversion, and what it actually costs

In the Lambda, trusted code wraps the untrusted model. In a skill, the agent calls the trusted code.
That inversion cannot be closed by better JavaScript. It is not closable by the available levers
either: auto mode allow rules permit actions rather than compelling them, and a repository hook
cannot gate the Slack post, because posting is the harness's own output channel and not a tool call
the repository intercepts.

The mitigation built here has two halves:

1. **The gate is the sole producer of the final message.** `verify-answer.mjs` prints the Slack text
   itself. An agent that skips it has no formatted output to post, so skipping is not a shortcut, it
   is a visible departure from the procedure.
2. **Every message carries a verdict line** (`✅ 3/3 quotes verified · 2 docs`). A message without one
   is legibly off-script to any human reading the channel.

This converts prevention into detection. That is a genuine downgrade and should be named as one. It
is also worth being precise about the blast radius: the answer text is released only on `answered`,
exactly as `run.ts` does it, and a test asserts that `low_confidence` and `no_match` never leak the
proposed answer. So the failure mode of a skipped gate is an unverified answer posted with no verdict
line, not a silently corrupted one.

## Finding 5: a skill cannot ship an executable and its tests in one directory

`node --test <dir>` fails on `bin/`, because directory mode executes `verify-answer.mjs` itself; the
CLI guard fires on empty stdin and exits 6. The glob form works:

```bash
node --test "skills/answer-strata-question/bin/*.test.mjs"
```

Minor, but it belongs in any CI wiring, and it is the kind of thing that silently disables a test
suite if nobody notices the runner was passing a directory.

## Recommendation on the duplication

`ground()` now exists twice: `strata-qa/src/grounding.ts` and the ported copy. Resolving that was out
of scope, and the differential harness makes the duplication safe for now by failing the moment the
two diverge. If this direction is adopted, the follow-on story should make the `.mjs` the single
source of truth and have the TypeScript import it, rather than the reverse. The port is dependency
free and the TypeScript is not, so the dependency should point toward the simpler artifact.

If this direction is not adopted, delete `skills/answer-strata-question/` entirely rather than leaving
it as a second implementation nobody runs.

## What this spike could not answer

Each of these needs a live Claude Tag workspace and a Team or Enterprise entitlement:

- **Whether Tag reliably invokes the gate.** The central risk, and the reason this was a spike.
- **Whether the `Workflow` tool exists in Tag sandboxes.** `generate-strata-docs` commits to it with
  no fallback, so this matters beyond the present question.
- **End to end answer quality** against the nine fixtures, and therefore whether the eight-candidate
  cap costs recall.
- **Real per-question cost and latency.**
- **Whether Agent Proxy can sign a request to an IAM-authed Lambda Function URL**, which is the gate
  on the competing option, not on this one.

Confirming the plan entitlement is the cheapest next step and blocks the other four.

## Where this leaves the decision

The evidence supports the narrow claim and not the broad one. Everything mechanical survives the move
out of the Lambda intact, proven against 20,000 cases by a harness demonstrated to detect a wrong
port. Corpus scoping comes out stronger than the Lambda's, because it derives from the graph rather
than from a build-time exclusion list. Deployment surface, Cursor dependency, and corpus staleness all
disappear.

What does not survive is the certainty that the check runs at all, and no amount of further offline
work will recover it. That is now a product judgment rather than an engineering one: whether a
verifier that runs almost always, and whose absence is visible, is good enough for answers this
audience will act on. If it is, this direction is ready for a piloted story and #40's transport should
be replaced. If it is not, the Lambda keeps the gate in its control flow and the SigV4 connection
question becomes the one worth spiking next.
