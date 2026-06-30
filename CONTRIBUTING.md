# Contributing

## Contribution workflow

The short version of how a change moves through this repo:

1. **Start from an issue.** File one with the template that fits the work (epic, story, bug,
   technical-task, spike, or chore). The `create-issue` skill walks you through choosing a template,
   wording it for its audience, reviewing it, labeling it, and filing it.
2. **Branch.** Use the naming shape in [Branching](#branching) below.
3. **Make your changes.** Keep commits terse and explain why, not what. Wire up the commit template
   (see [Commit message template](#commit-message-template)).
4. **Review, then open a draft PR.** Run the `review-draft` skill on the PR description, then open
   the PR as a draft and fill in the template (see [Opening pull requests](#opening-pull-requests)).
   The `create-pr` skill walks you through branch naming, the review, and opening the PR.
5. **Mark ready.** Move the PR out of draft once it is self-reviewed and CI passes.

Run `review-draft` before any durable artifact goes up: an issue, a PR description, or a commit
message set. It checks quality, template adherence, voice, punctuation, and house style. The rest of
this document covers each step in detail.

## Local setup

### Python

Requires Python 3.13.

```bash
pip install -r scripts/requirements.txt pytest
```

### Commit message template

This repo ships a `.gitmessage` file that scaffolds commit messages with the expected format and a few guiding comments. Wire it up once per clone:

```bash
git config commit.template .gitmessage
```

After this, `git commit` (without `-m`) will open your editor pre-populated with the template. The comment lines (`#`) are stripped from the final message.

## Branching

Use the team's standard branch shape:

```
<your-github-username>/<issue-number>-<short-kebab-description>
```

Example: `jeffhorn/42-add-github-templates`

If the branch lives in a different repo than the originating issue, prefix the branch description with the originating project:

```
jeffhorn/oscer-42-short-description
```

## Opening pull requests

Open all pull requests as drafts initially. Mark ready for review when the work is complete and self-reviewed.

## Running the pipeline

```bash
python -m scripts.lint_manifest   # validate sources.md
python -m scripts.lint_docs       # validate doc frontmatter
python -m scripts.build_graph     # write docs/INDEX.md and docs/graph.json
```

Run these in order before pushing. CI runs them on every relevant change. If `build_graph` produces a diff in `docs/INDEX.md` or `docs/graph.json`, commit the regenerated files or CI will fail.

## Tests

```bash
python -m pytest -v
```
