---
id: platform-cli-mechanism
title: How install and update work (Copier wrapper)
source: platform-cli
doc_type: guide
tags: [platform-cli, copier, update, answers-file, mechanism]
related: [platform-cli-overview, platform-cli-infra-commands, platform-cli-app-commands, platform-cli-updating-projects]
manages: [template-infra, template-application-rails]
summary: The CLI wraps Copier to install templates at their latest git tag, records answers in .template-<name>/<app>.yml files, and performs a 3-way update; the target project repo must be clean.
source_ref:
  repo: https://github.com/navapbc/platform-cli
  ref: 5ed1286af74c16bd0be9132655dbe3b31b4b001b
  paths:
    - docs/reference/how-templates-work.md
    - docs/guides/updating.md
    - nava/platform/templates/template.py
    - nava/platform/templates/template_name.py
    - nava/platform/templates/state.py
    - nava/platform/templates/infra_template.py
    - nava/platform/copier_worker.py
    - nava/platform/cli/commands/common.py
    - nava/platform/cli/commands/infra/__init__.py
    - nava/platform/cli/commands/infra/update_command.py
    - nava/platform/cli/commands/app.py
last_documented: 2026-09-04
verified: ok
---

# How install and update work

The CLI's template handling is largely a wrapper around
[Copier](https://copier.readthedocs.io/en/stable/), with tweaks that support
easier-to-reason-about file exclusions and answers files stored in
`.<TEMPLATE_NAME>/` subdirectories. Copier's own
[basic concepts](https://copier.readthedocs.io/en/stable/#basic-concepts) and
[how updates work](https://copier.readthedocs.io/en/stable/updating/#how-the-update-works)
are the underlying reference.

## Install

When you install a template `template-foo` for app `bar`:

1. The `template-foo` repository is cloned to a local temporary directory. By
   default the **latest tagged version** in the repository is checked out
   (prereleases excluded); override with the `--version` flag.
2. The template's `copier.yml` is read, providing the template's configuration
   and parameters — for example the questions to ask the user.
3. Any template parameters not supplied via `--data` are prompted for
   interactively.
4. A `.template-foo/` directory is created at the top level of the project with a
   `bar.yml` inside, recording the template version used and the answers for the
   `bar` instance of the template.
5. The files in the local clone are iterated over and copied into the project,
   with templated files populated from the provided answers.

## Update

On update of `template-foo`:

1. `template-foo` is cloned to a temporary directory.
2. The template version *currently used by the project* is used to render a
   fresh instance with the project's current parameters — effectively a clean
   copy of the project as if it had just been created from the template.
3. That clean copy is compared against the actual current project and the diff
   recorded, capturing any changes made outside the template process so they can
   be re-applied later.
4. The latest tagged version (or the value of `--version`) is applied to the
   project, prompting for any new parameters, with special handling for deleted
   files and similar cases.
5. The `.template-foo/bar.yml` answers file is updated with answers to new
   parameters and the new template version.
6. The previously recorded diff of manual changes is applied.

If the version that would be installed is the one the project already records,
the CLI prints `Already up to date (<version>)` and stops — unless you pass
`--force`, or `--answers-only` together with `--data`.

## Answers files and project state

Each template instance's state lives in a per-repository directory at the
project root, named `.<repo name>`, holding one YAML answers file per instance.
The file records Copier's `_commit` (the template version, as a `git describe`
string) and `_src_path` (where the template came from) alongside the template's
own answers — which is how the update and `info` commands can find the template
again without being told.

A single repository can hold more than one logical template. `template-infra`
is the notable case: the CLI treats it as `template-infra:base` (shared account
infrastructure) and `template-infra:app` (the per-application infra shell), so a
project using it has `.template-infra/base.yml` plus one
`.template-infra/app-<APP_NAME>.yml` per app. For a template with a single
instance per project, the answers file is just named for the instance.

The two parts are separated by **pre-render** source exclusions — a tweak this
CLI adds on top of Copier, whose own exclusion logic only matches paths after
rendering. The base part excludes the template's `*{{app_name}}*` paths; the app
part excludes everything *except* those paths and the state directory. Paths
matching `*template-only*` are excluded from both.

## Version resolution (`--version`)

The `--version` option accepts a branch, tag, commit hash, or `HEAD` (for the
latest commit). When omitted it defaults to the latest tag: the default
resolves to the latest non-prerelease tag and `HEAD` to `origin/HEAD`. The CLI
re-checks out an already-cloned template itself when the requested ref changes.
For general use, stick to released versions; `--version HEAD` is there for
trying unreleased template content.

## The dirty-repo constraint

You cannot update a project repo that is "dirty" — that is, one with untracked
files or pending changes according to Git. Because of this, it can be useful to
run updates from a dedicated
[git worktree](https://git-scm.com/docs/git-worktree) separate from your main
development tree (or to stash changes, or keep a separate clean clone).

## Commit behavior

Many commands accept `--commit`, which commits the resulting changes with a
standard message (`Install`/`Update` `<template id>` at/to version `<version>`,
prefixed with the app name unless the app name matches the template name — the
`is_singular_instance` case). If the project is not a Git repository, the CLI
warns and prints the message it would have used. Defaults vary by command:

- **Install** commands (`infra install`, `app install`) default to *not*
  committing — except `infra add-app`, which defaults to committing.
- **Update** commands default to committing each successful phase so progress is
  saved (you can squash the commits afterward). `infra update-base`,
  `infra update-app`, and `app update` accept a `--commit`/`--no-commit` toggle
  (defaulting to commit); `infra update` always commits each phase and has no
  commit toggle (it just runs `update-base` then `update-app --all`).
  `infra update-app --all` cannot be combined with `--no-commit`, since commit
  is on by default and the `--all` path fails if you turn it off.
- **Migrate** commands differ from each other: `app migrate-from-legacy`
  defaults to committing, while `infra migrate-from-legacy` defaults to *not*
  committing.

A commit attempt that finds merge conflicts in the project raises instead of
committing, which is what surfaces the "resolve conflicts and run the update in
parts" guidance from `infra update`.

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
- `--force` — ignore the "smart" update algorithm. Instead of Copier's 3-way
  update, the template is re-applied as a plain overwriting copy, which discards
  the smart logic but can catch things a regular update misses.
