---
id: platform-cli-app-commands
title: nava-platform app command reference
source: platform-cli
verified: ok
doc_type: guide
tags: [platform-cli, app, application-template, commands, cli]
related: [platform-cli-overview, platform-cli-mechanism, platform-cli-infra-commands]
manages: [template-application-rails, template-application-nextjs, template-application-flask]
summary: Reference for the nava-platform app command group (install, update, migrate-from-legacy) that installs and updates application templates such as template-application-rails, template-application-nextjs, and template-application-flask.
source_ref:
  repo: https://github.com/navapbc/platform-cli
  ref: 57d5d5c6c4626e0bd13ed81b469c91c2533498f0
  paths:
    - nava/platform/cli/commands/app.py
    - nava/platform/cli/commands/common.py
    - docs/adding-an-app.md
    - docs/getting-started/new-project.md
    - docs/getting-started/migrating-from-legacy-template.md
last_documented: 2026-07-21
---

# `nava-platform app` command reference

The `app` group manages a project's use of application templates — for example
`template-application-rails` from
[the Platform](https://github.com/navapbc/platform/). Unlike the `infra` group,
the `app` group has no default template URI: you supply one with
`--template-uri`.

Common options (all three subcommands):

- `--commit` — commit changes with a standard message when able.

Options for `install` and `update` only:

- `--template-uri` — path or URL to the template source (a local clone path is
  accepted). Required for `install`; optional for `update` (if omitted, the CLI
  looks up the installed template automatically).
- `--version` — branch, tag, commit hash, or `HEAD`; defaults to the latest tag.
- `--data VARIABLE=VALUE` — pass a template parameter (repeatable).
- `--template-name` — override the template name when it cannot be derived from
  the repository name (for example, a local checkout under a different
  directory name).

## `app install`

```sh
nava-platform app install --template-uri TEMPLATE_URI [--commit] [--version V] [--data K=V] [--template-name NAME] PROJECT_DIR APP_NAME
```

Installs an application template into `PROJECT_DIR` as application `APP_NAME`.
`--commit` defaults to false. Example adding a Rails app to a project that
already uses `template-infra`:

```sh
nava-platform infra add-app --commit . my-super-awesome-app
nava-platform app install --template-uri gh:navapbc/template-application-rails --commit . my-super-awesome-app
```

> The `app install` step may conflict on `<APP_NAME>/Makefile`, since the infra
> and application templates each ship a copy. Typically accept the application
> template's version.

## `app update`

```sh
nava-platform app update [--template-uri URI] [--version V] [--data K=V] [--commit] [--template-name NAME] [--answers-only] [--force] PROJECT_DIR APP_NAME
```

Updates the application named `APP_NAME` based on its template. `--commit`
defaults to true. If `--template-uri` is omitted, the CLI looks up the
template(s) installed for that app (excluding `template-infra`); when exactly one
is found it is used automatically, otherwise you are prompted to choose.
Supports `--answers-only` and `--force` as described in
[the install/update mechanism](./platform-cli-mechanism.md).

## `app migrate-from-legacy`

```sh
nava-platform app migrate-from-legacy --origin-template-uri TEMPLATE_URI [--legacy-version-file FILE] [--commit] PROJECT_DIR APP_NAME
```

Migrates an application that was set up with an older (pre-Platform-CLI) template
into the Platform CLI's answers-file format. `--commit` defaults to true.

- `--origin-template-uri` — path or URL to the legacy template used to set up the
  project (a local clone is allowed).
- `--legacy-version-file` — relative path to the old version file. For
  application templates this is commonly one of
  `.template-flask-version`, `.template-nextjs-version`, or
  `.template-application-rails-version`, though a project may have renamed it.

After migrating, run `nava-platform app update . <APP_NAME>` to apply the
template. You may need to restore some project-root files (such as `README.md`
or `.github/pull_request_template.md`) afterward.
