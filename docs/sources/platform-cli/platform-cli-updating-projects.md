---
id: platform-cli-updating-projects
title: Updating a project and avoiding conflicts
source: platform-cli
doc_type: guide
tags: [platform-cli, update, merge-conflicts, template-infra, application-template]
related: [platform-cli-overview, platform-cli-mechanism, platform-cli-infra-commands, platform-cli-app-commands, platform-cli-legacy-migration]
manages: [template-infra, template-application-rails]
summary: How to keep a project current with its upstream Strata templates using the infra and app update commands, and how to reduce merge conflicts when you do.
source_ref:
  repo: https://github.com/navapbc/platform-cli
  ref: 5ed1286af74c16bd0be9132655dbe3b31b4b001b
  paths:
    - docs/guides/updating.md
    - docs/guides/avoiding-conflicts-on-update.md
    - nava/platform/cli/commands/app.py
    - nava/platform/cli/commands/common.py
    - nava/platform/cli/commands/infra/__init__.py
    - nava/platform/cli/commands/infra/update_command.py
    - nava/platform/templates/infra_template.py
    - nava/platform/templates/errors.py
last_documented: 2026-09-04
verified: ok
---

# Updating a project and avoiding conflicts

A key reason to use the Strata templates is not only getting off the ground, but
staying up to date with features and developments that land upstream. The CLI is
designed to make that easier; the rest is up to how you structure your project.

## Before you start

- **The project repo must be clean.** You cannot update a project repo that is
  dirty — one with untracked files or pending changes according to Git. A
  dedicated [git worktree](https://git-scm.com/docs/git-worktree) separate from
  your main development tree is a convenient way to keep one clean (stashing
  changes or keeping a second clean clone works too).
- **Updates target the latest released version** of the relevant template unless
  you say otherwise with `--version <your target>`.
- **Update frequently.** Conflicts are easier to resolve in smaller chunks;
  frequent updates from upstream avoid the worst situations.

## Infra templates

The one-shot form:

```sh
nava-platform infra update .
```

This attempts to update the "base" template and then each "app" instance in
sequence, committing each successful phase. It can run into merge conflicts that
need to be resolved manually; when that happens the tool bails with guidance to
run the update in parts.

To drive the pieces yourself, first update the infrastructure base:

```sh
nava-platform infra update-base .
```

Then the infrastructure for each application:

```sh
nava-platform infra update-app --all .
```

Drop `--all` if you would rather choose the order to update the applications
(the CLI then prompts you to pick, or updates the single app if there is only
one). Note that `--all` requires `--commit`, which is the default for
`update-app`.

## Application templates

```sh
nava-platform app update . <APP_NAME>
```

If the app has exactly one non-`template-infra` template installed, the CLI uses
it; otherwise it prompts you to choose which template to update.

## Avoiding conflicts in the first place

The templates workflow is effectively some structure around copying source
files. That gives projects a lot of flexibility — customize freely, and see
exactly what changes between versions — but it also raises the chance of merge
conflicts on update. Some are resolved automatically by logic in the CLI, and
Git can tease apart much of the rest, but both template maintainers and template
users can head some off.

### For template maintainers

Follow the
[template technical design principles](https://github.com/navapbc/template-infra/blob/main/template-only-docs/template-technical-design-principles.md).
Where possible, isolate template-owned files and configuration in separate files
that get imported into the proper runtime location. That gives users a way to
layer customization on top without editing files the template may touch on
update.

### For infra template users

Avoid creating `/infra/modules/` directories with very generic names. Upstream
may eventually ship generic functionality (or a generic interface) for that use
case, and you would then be blocked on updating until every conflict is
resolved. For a project-specific take on, say, "notifications", name the module
`<PROJECT_NAME>_notifications/` rather than `notifications/`.

### For application template users

There is no good general advice here yet — conflicts are hard to avoid given the
nature of applications. But keep in mind which files are tracked upstream.

## When an update goes sideways

- Resolve the merge conflicts, commit, and pick the update back up from where it
  left off with the more granular commands (`infra update-base`, then
  `infra update-app`).
- `--force` re-applies the template without the smart-update algorithm; see
  [how install and update work](./platform-cli-mechanism.md) for what that
  changes.
