# Contributing

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
