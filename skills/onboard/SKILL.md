---
name: onboard
description: Orients a new developer or agent to this repository. Verifies local setup, explains the two-layer architecture, and confirms the environment is ready to run the pipeline. Use when cloning the repo for the first time.
---

# Onboard

Walks through local setup, verifies the environment, and surfaces anything that needs attention.
This skill does not make automated changes: it reads, checks, and reports.

## Steps

### 1. Orient

Read the following files in order. Do not summarize them back to the user; just load the context:

1. `README.md`: project overview and purpose
2. `AGENTS.md`: architecture, conventions, and the documentation maintenance contract
3. `CONTRIBUTING.md`: branch naming, commit template, PR conventions, and pipeline

After reading, briefly confirm to the user: one sentence on what this repo does and one sentence on
the two layers (generation vs. validation/graph).

### 2. Verify Python

Check that Python 3.13 is available:

```bash
python --version
```

If the version is less than 3.13, surface a clear warning and stop. The scripts will not work on
an older Python. Direct the user to install Python 3.13 (via pyenv, asdf, or their system package
manager).

### 3. Install dependencies

```bash
pip install -r scripts/requirements.txt pytest
```

Report success or any installation errors.

### 4. Run the validation pipeline

Run the full lint and build sequence. Each command must print its `*_OK` sentinel before
proceeding to the next. Stop and report if any step fails.

```bash
python -m scripts.lint_manifest
python -m scripts.lint_docs
python -m scripts.build_graph
```

### 5. Run the tests

```bash
python -m pytest -v
```

Report the pass/fail count. If any tests fail, surface the failures and stop.

### 6. Check the commit template

```bash
git config commit.template
```

If the output is not `.gitmessage`, the template is not configured. Offer to run:

```bash
git config commit.template .gitmessage
```

Ask before running. Do not apply automatically.

### 7. Report

Summarize what was checked and the result of each step. Flag anything that needs the user's
attention. If everything passed, confirm the environment is ready and point the user to:

- `sources.md`: the manifest of source repos the engine documents
- `skills/generate-strata-docs/SKILL.md`: the main generation skill to invoke next
- `.github/ISSUE_TEMPLATE/`: templates to use when filing new work
