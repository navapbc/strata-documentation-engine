---
id: platform-cli-infra-commands
title: nava-platform infra command reference
source: platform-cli
doc_type: guide
tags: [platform-cli, infra, template-infra, commands, cli]
related: [platform-cli-overview, platform-cli-mechanism, platform-cli-app-commands, platform-cli-updating-projects, platform-cli-legacy-migration]
manages: [template-infra]
summary: Reference for the nava-platform infra command group (install, add-app, update, update-base, update-app, migrate-from-legacy, info) that installs and updates template-infra.
source_ref:
  repo: https://github.com/navapbc/platform-cli
  ref: 5ed1286af74c16bd0be9132655dbe3b31b4b001b
  paths:
    - nava/platform/cli/commands/infra/__init__.py
    - nava/platform/cli/commands/infra/install_command.py
    - nava/platform/cli/commands/infra/update_command.py
    - nava/platform/cli/commands/infra/info_command.py
    - nava/platform/cli/commands/infra/add_app_command.py
    - nava/platform/cli/commands/infra/migrate_from_legacy_command.py
    - nava/platform/cli/commands/common.py
    - nava/platform/projects/infra_project.py
    - nava/platform/projects/get_app_names_from_infra_dir.py
    - docs/guides/updating.md
    - docs/guides/adding-an-app.md
    - docs/guides/new-project.md
last_documented: 2026-09-04
verified: ok
---

# `nava-platform infra` command reference

The `infra` group manages a project's use of `template-infra`. That template has
two parts: a **base** of shared account infrastructure, and a reusable **app**
part that provides a generic infra shell for running applications.

Options shared by multiple commands (availability varies — see individual command synopses):

- `--template-uri` — path or URL to the infra template (can be a local clone).
  Its default differs by command: `install` and `add-app` default to the
  `template-infra` repo on GitHub, while `update`, `update-base`, `update-app`,
  and `info` instead derive the template from the existing project (its
  recorded `_src_path` in `.template-infra/base.yml`), only needing an explicit
  URI when that derivation is unavailable. (`migrate-from-legacy` uses a
  separate `--origin-template-uri` flag, which does default to the GitHub repo.)
- `--version` — branch, tag, commit hash, or `HEAD`; defaults to the latest tag.
- `--data VARIABLE=VALUE` — pass a template parameter without being prompted
  (repeatable).
- `--commit` — commit changes with a standard message when able.
- `--answers-only` — update the answers file without changing the version.
  Applies only to `update`, `update-base`, and `update-app`.
- `--force` — ignore the smart-update algorithm. Applies only to `update`,
  `update-base`, and `update-app`.

## `infra install`

```sh
nava-platform infra install [--commit] [--template-uri URI] [--version V] [--data K=V] PROJECT_DIR
```

Installs `template-infra` into `PROJECT_DIR`: the base template first, then one
infra app instance per app name. App names are derived from the sub-directories
of the project's `infra/` directory (excluding `accounts`, `modules`,
`networks`, `project-config`, and `test`). If none can be derived and none is
given via `--data app_name=...`, you are prompted for one. `--commit` defaults
to false. Example from a new project:

```sh
nava-platform infra install --commit --data app_name=<APP_NAME> .
```

## `infra add-app`

```sh
nava-platform infra add-app [--commit] [--template-uri URI] [--data K=V] PROJECT_DIR APP_NAME
```

Adds the infrastructure skeleton for an additional application `APP_NAME` to an
existing project, then regenerates the base template's network config so it
imports every app's config module. It installs the app part at the template
version the project is already on. `--commit` defaults to true.

## `infra update`

```sh
nava-platform infra update [--template-uri URI] [--version V] [--data K=V] [--answers-only] [--force] PROJECT_DIR
```

Updates base and application infrastructure. This effectively runs `update-base`
followed by `update-app --all`, automatically committing each successful phase
so progress is saved (you can squash the commits afterward). If merge conflicts
occur it fails with guidance to run `update-base` and `update-app` separately
and resolve conflicts manually.

## `infra update-base`

```sh
nava-platform infra update-base [--commit] [--template-uri URI] [--version V] [--data K=V] [--answers-only] [--force] PROJECT_DIR
```

Updates only the base (shared) infrastructure, then re-renders the network
config with the project's current app names. `--commit` defaults to true.

## `infra update-app`

```sh
nava-platform infra update-app [--all] [--commit] [--template-uri URI] [--version V] [--data K=V] [--answers-only] [--force] PROJECT_DIR [APP_NAME ...]
```

Updates the infrastructure for one or more applications. Known apps are read
from the project's `.template-infra/app-*.yml` answers files. `--commit`
defaults to true.

- `--all` attempts to update every known app; it cannot be combined with
  `--no-commit` (committing is required, and `--commit` is already the default),
  and you may not also pass app-name arguments.
- Without `--all`: if exactly one app exists it is updated automatically; if
  several exist and none are named, you are prompted to choose; named apps that
  do not exist in the project produce an error.

`--answers-only` here is how you flip a project-level template answer without
moving versions, for example after standing up your first dev environment:

```sh
nava-platform infra update-app --answers-only --data app_has_dev_env_setup=true . <APP_NAME>
```

## `infra migrate-from-legacy`

```sh
nava-platform infra migrate-from-legacy [--commit] [--origin-template-uri URI] PROJECT_DIR
```

Converts a project that used the old `.template-version` file into the CLI's
`.template-infra/` answers-file format, producing `base.yml` and
`app-<APP_NAME>.yml` files, then deletes the legacy file. Fails if no legacy
version file is found. `--origin-template-uri` defaults to the `template-infra`
repo. `--commit` defaults to false. After migrating, run `infra update` to
perform the actual template update — see
[migrating from a legacy template](./platform-cli-legacy-migration.md).

## `infra info`

```sh
nava-platform infra info [--template-uri URI] PROJECT_DIR
```

Displays the state of `template-infra` in the project: the base template
version, a "Newer versions?" list of the template's `v*`-tagged versions at or
above the project's current version (the current version itself included),
checked against the project's recorded template source — pass `--template-uri`
when that source is not recorded, such as a not-yet-migrated legacy project —
any legacy version info including the "Closest upstream version", a table of
apps and their template versions, and a table of any "possible" apps found
under `infra/` that are not yet using the template.

For a legacy project not yet migrated (no `.template-infra/base.yml` answers
file), `info` instead prints a single "Detected Apps" table of the app names
found under `infra/`, in place of the apps and possible-apps tables.

`PROJECT_DIR` must be an existing directory.
