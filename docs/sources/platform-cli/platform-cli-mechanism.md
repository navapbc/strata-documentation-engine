---
id: platform-cli-mechanism
title: How install and update work (Copier wrapper)
source: platform-cli
verified: ok
doc_type: guide
tags: [platform-cli, copier, update, answers-file, mechanism]
related: [platform-cli-overview, platform-cli-infra-commands, platform-cli-app-commands]
manages: [template-infra, template-application-rails]
summary: The CLI wraps Copier to install templates at their latest git tag, records answers in .template-<name>/<app>.yml files, and performs a 3-way diff on update; the target project repo must be clean.
source_ref:
  repo: https://github.com/navapbc/platform-cli
  ref: 57d5d5c6c4626e0bd13ed81b469c91c2533498f0
  paths:
    - docs/how-it-works.md
    - nava/platform/templates/template.py
    - nava/platform/cli/commands/common.py
    - nava/platform/cli/commands/infra/__init__.py
    - nava/platform/cli/commands/app.py
    - docs/updating.md
last_documented: 2026-07-21
---

# How install and update work

The Platform CLI is largely a wrapper around
[Copier](https://copier.readthedocs.io/en/stable/), with tweaks that support
file exclusions and answers files stored in `.<TEMPLATE_NAME>/` subdirectories.

## Install

When you install a template `template-foo` for app `bar`:

1. The `template-foo` repository is cloned to a local temporary directory. By
   default the **latest tagged version** in the repository is checked out;
   override with the `--version` flag.
2. The template's `copier.yml` is read, providing the template's configuration
   and the questions it can ask.
3. Any template parameters not supplied via `--data` are prompted for
   interactively.
4. A `.template-foo/` directory is created at the top level of the project with a
   `bar.yml` inside, recording the template version used and the answers for the
   `bar` instance of the template.
5. The files in the clone are copied into the project, with templated files
   populated from the answers.

## Update

On update of `template-foo`:

1. `template-foo` is cloned to a temporary directory.
2. The template version *currently used by the project* is used to render a
   fresh instance with the current answers — effectively a clean copy of the
   project as if it had just been generated.
3. That clean copy is diffed against the actual current project, capturing any
   changes made outside the template process so they can be re-applied later.
4. The latest tagged version (or the value of `--version`) is applied to the
   project, prompting for any new parameters, with special handling for deleted
   files and similar cases.
5. The `.template-foo/bar.yml` answers file is updated with answers to new
   parameters and the new template version.
6. The previously captured diff of manual changes is re-applied.

## Version resolution (`--version`)

The `--version` option accepts a branch, tag, commit hash, or `HEAD` (for the
latest commit). When omitted it defaults to the latest tag. Internally, the
default path checks out the latest non-prerelease tag; `HEAD` checks out
`origin/HEAD`.

## The dirty-repo constraint

You cannot update a project repo that is "dirty" — that is, one with untracked
files or pending changes according to Git. Because of this, it can be useful to
run updates from a dedicated
[git worktree](https://git-scm.com/docs/git-worktree) separate from your main
development tree (or to stash changes, or keep a separate clean clone).

## Commit behavior

Many commands accept `--commit`, which commits the resulting changes with a
standard message when able. Defaults vary by command:

- **Install** commands (`infra install`, `app install`) default to *not*
  committing — except `infra add-app`, which defaults to committing.
- **Update** commands default to committing each successful phase so progress is
  saved (you can squash the commits afterward). `infra update-base`,
  `infra update-app`, and `app update` accept a `--commit`/`--no-commit` toggle
  (defaulting to commit); `infra update` always commits each phase and has no
  commit toggle (it just runs `update-base` then `update-app --all`). The
  `infra update-app --all` form requires `--commit`.
- **Migrate** commands differ from each other: `app migrate-from-legacy`
  defaults to committing, while `infra migrate-from-legacy` defaults to *not*
  committing.

## Smart-update flags

- `--answers-only` — do not change the template version; only update the answers
  file. Two constraints apply to all update commands (`app update` and the
  `infra` update commands) that use this flag: (1) at least one `--data` value
  must be supplied — running without `--data` is rejected with `"If 'answers
  only', must specify some data"`; (2) the handling of a simultaneously supplied
  `--version` differs by command: for `app update`, supplying `--version`
  together with `--answers-only` is rejected with an error (`Can not specify a
  version and 'answers only'`); the `infra` update commands instead drop any
  `--version` value when `--answers-only` is set.
- `--force` — ignore the "smart" update algorithm and re-apply the template more
  holistically; useful for catching things a regular update misses.
