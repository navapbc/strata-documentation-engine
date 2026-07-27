# Strata Documentation Engine

Generates and self-verifies documentation for the Strata project family from a list of
sources, producing a linked, agent-queryable knowledge base.

## How it works

1. `sources.md` lists each source (`id`, `type`, `repo`, `ref`, optional `subpaths`):
   the SDK, the Rails app template, SDK-consuming apps like OSCER, the `template-infra`
   infrastructure template, and the `platform-cli` (`nava-platform`) tool.
2. The `generate-strata-docs` skill documents each source (one agent per source) using the
   type's profile in `skills/generate-strata-docs/references/profiles/`. The `sdk`,
   `infra-template`, and `platform-cli` documenters distill each source's own `docs/`
   (verifying against code); each doc is tagged with canonical `feature_keys`/`demonstrates`
   from `references/feature-keys.md` and `component_keys`/`manages`/`integrates_with` from
   `references/platform-components.md`.
3. `scripts/build_graph.py` builds `docs/INDEX.md` and `docs/graph.json` from doc frontmatter,
   linking each example to the SDK feature it `demonstrates` (`example-of`), and the CLI/templates
   to the components they `manage` / `integrate with` (`manages` / `integrates-with`).
4. An adjudicated verify→fix loop checks each doc against its source; unresolved docs are
   marked `verified: needs-review` with findings in `docs/.verification/`.
5. A curator reviews the run's distillation logs into `docs/.curation/improvements.md`.

## Running it

- **Locally:** open this repo in Claude Code and invoke the `generate-strata-docs` skill
  (uses your own Claude auth; needs git access to the source repos and Python 3.13).
- **In CI:** the `Generate Strata Docs` Action (manual)
  runs the skill and opens a PR.
  Requires the `ANTHROPIC_API_KEY` and `SOURCES_READ_TOKEN` secrets.

## strata-qa — documentation Q&A CLI

`strata-qa/` is a self-contained TypeScript CLI (isolated from the Python pipeline) that answers a
natural-language question from the generated docs graph via the Cursor SDK, with a deterministic
quote-verified grounding gate: every cited doc must resolve to a `docs/graph.json` node **and**
carry at least one quote found verbatim in it (after markdown/unicode-punctuation normalization),
or the tool refuses. A redundant quote that fails inside an already-verified doc does not demote
the answer; a cited doc with no verified quote does. Default model is `gpt-5.6-luna`.

```bash
cd strata-qa && npm install                      # setup (Node 22)
npm test                                         # vitest units — no live model calls
npm run qa -- "how does OSCER authenticate API requests?" --docs-root ..
npm run qa -- eval --docs-root ..                # score fixtures/golden.json (live model)
```

Live runs need `CURSOR_API_KEY` (a personal or service-account key). Each run prints one JSON object
to stdout, carrying a `runId`; refusals (`no_match`, `low_confidence`) exit 0, operational failures
exit non-zero (auth, model, docs, lockdown, parse, transport, timeout).

| Flag | Effect |
|---|---|
| `--timeout <seconds>` | Bounds ONE agent call (default 60). A question can make two: retrieval, then a tool-less repair if the output will not parse. |
| `--max-total-time <seconds>` | Bounds a whole question, both calls together (default none). In `eval` it applies per fixture. |
| `--log-dir <path>` | JSONL destination (default `<docs-root>/.logs/qa`). Give a tuning experiment its own directory to keep its rows separable. |
| `--model <id>`, `--docs-root <path>`, `--pretty` | Model override, corpus root, human-readable summary on stderr. |

Query and refusal logs land in `<docs-root>/.logs/qa/` (gitignored), one row per question, stamped
with the same `runId` printed on stdout plus a `gitSha` (`git describe --always --dirty`, or
`STRATA_QA_GIT_SHA`) so rows from different code versions stay comparable across runs.

Timed-out runs are cancelled rather than abandoned. If a run cannot be cancelled it is still
spending tokens, which the CLI says so on stderr; `eval` stops scheduling fixtures at that point
and prints `ABORTED after n/N` above the partial table rather than keeping an orphan company for
the rest of the loop.

### Deploying strata-qa as a Lambda

`strata-qa` can run as a container-image AWS Lambda behind an IAM-authed Function URL.
The image bakes the docs and the handler in at build time; the build context is the repo root.
The CLI edge does not ship — `.dockerignore` excludes `cli.ts` and `eval.ts`, which nothing the
handler can reach imports.

```bash
# First deploy — CURSOR_API_KEY creates the Secrets Manager secret
AWS_REGION=<region> CURSOR_API_KEY=<personal-or-service-account-key> ./strata-qa/deploy.sh

# Every deploy after that. The key is NOT needed and the stored secret is untouched.
AWS_REGION=<region> ./strata-qa/deploy.sh

# Rotate the stored key, deliberately
AWS_REGION=<region> ROTATE_SECRET=1 CURSOR_API_KEY=<new-key> ./strata-qa/deploy.sh
```

`deploy.sh` creates the ECR repo and the secret, creates the execution role, deploys the
function from the image, caps reserved concurrency, and prints the Function URL. Writing
the secret is opt-in after the first deploy (`ROTATE_SECRET=1`) so that a redeploy from a
shell holding a stale `CURSOR_API_KEY` cannot overwrite a working key.

Images are tagged by commit (`IMAGE_TAG` defaults to `git rev-parse HEAD`, suffixed
`-dirty` for an uncommitted tree) and the function is deployed from that immutable tag, so
its configuration records which code is answering questions and earlier images stay
addressable — the script prints the `update-function-code` command to roll back to one.
`latest` is pushed too, as a moving pointer for `docker pull`. An ECR lifecycle policy
keeps the `ECR_KEEP_IMAGES` (default 10) most recent images. Since a function's
architecture is fixed at creation, the script fails fast when `ARCH` disagrees with an
existing function rather than after a full build and push.

Invoke it with a SigV4-signed `POST` whose JSON body is `{"question": "..."}` (optional
`model`, `requestId`, `replyTo`); the response body is the `QaResult` JSON the CLI emits
plus `requestId`, and `error` on failures. Refusals return HTTP 200. Auth is `AWS_IAM`
and no resource policy is attached, so the calling identity needs
`lambda:InvokeFunctionUrl` on the function in its own IAM policy — without it the
Function URL answers 403 before the handler ever runs.

Config via env vars, split by who owns them. `deploy.sh` sets the per-deploy ones on the
function: `AGENT_TIMEOUT_MS` (default 90000) and `CURSOR_API_KEY_SECRET_ID`. The
container-shape ones are image `ENV`s in the Dockerfile, so a local `docker run` and the
deployed function agree: `DOCS_ROOT` (`/opt/qa-root` — deliberately not the task root,
since it becomes the retrieval agent's cwd and the task root also holds `node_modules`),
`QA_LOG_DIR` (`/tmp/qa` — the only writable path), and `HOME` (`/tmp`). `QA_MODEL` (default `gpt-5.6-luna`) and
`QA_ALLOWED_MODELS` (comma-separated allowlist for caller-supplied `model`) are read if
set, but `deploy.sh` does not set them — and because `update-function-configuration`
replaces the whole env map, a hand-set value is cleared on the next deploy.

`AGENT_TIMEOUT_MS` bounds each agent call — the whole call, from opening the agent through
waiting on the run, on one shared deadline — but not the request: `runQa` can make two (the
retrieval call, then a repair) and the handler retries once on an auth failure, so per-call
bounds do not add up to a request bound. The handler bounds the invocation separately from
the Lambda context's remaining time, which is what guarantees a clean 504 instead of a
hard kill with no response body.

Two behaviours worth knowing. `docsVersion` is a `sha256:` hash rather than a git SHA
(the image has no `.git`; `STRATA_QA_GIT_SHA` carries the commit). And a question that
times out returns 504 and cancels the run, which normally leaves the container healthy
for the next request; only work that cannot be cancelled forces the container to be
recycled — a run the SDK refuses to cancel, or a timeout landing before the run handle
exists at all — and then the next invocation pays a cold start.

## Developing

```bash
pip install -r scripts/requirements.txt pytest
python -m pytest -v
python -m scripts.lint_manifest
python -m scripts.lint_docs
```

Opening the repo in Claude Code loads local `PreToolUse` reminder hooks (`scripts/hooks/`, registered
in `.claude/settings.json`) that nudge `gh pr create` / `gh issue create` toward the create-pr /
create-issue skills and list the staged set before `git commit`. They only remind, never block; see
`rules/architecture.md`.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the contribution workflow, branch naming, commit
conventions, and the issue and PR templates. `AGENTS.md` is the canonical guide for both human
contributors and AI agents.
