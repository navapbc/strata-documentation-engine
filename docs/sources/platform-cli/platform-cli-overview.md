---
id: platform-cli-overview
title: nava-platform CLI overview
source: platform-cli
doc_type: guide
tags: [platform-cli, cli, installation, copier, strata]
related: [platform-cli-mechanism, platform-cli-infra-commands, platform-cli-app-commands]
component_keys: [platform-cli]
summary: What the nava-platform CLI is, how to install it (uv, pipx, Nix, Docker), and the two command groups (infra and app) it exposes.
source_ref:
  repo: https://github.com/navapbc/platform-cli
  ref: e565096992407a70e73e5a85167421f9bd85addb
  paths:
    - README.md
    - nava/platform/cli/main.py
    - nava/platform/cli/commands/infra/__init__.py
    - nava/platform/cli/commands/app.py
    - docs/getting-started/index.md
verified: ok
last_documented: 2026-06-29
---

# nava-platform CLI overview

The `nava-platform` CLI is a command-line tool that simplifies installing,
upgrading, and managing Nava Strata. It is a Python/Typer program that wraps
[Copier](https://copier.readthedocs.io/en/stable/) to install and update the
Nava Platform templates into a project.

## Installation

Choose one installation method. All methods install the tool from the GitHub
repository.

### uv (recommended)

Prerequisite: `git` 2.27+ on your `$PATH`, plus [uv](https://docs.astral.sh/uv/getting-started/installation/)
0.5.8+.

```sh
uv tool install git+https://github.com/navapbc/platform-cli
```

One-off execution without installing:

```sh
uvx --from git+https://github.com/navapbc/platform-cli -- <platform_cli_args>
```

Upgrade / uninstall:

```sh
uv tool upgrade nava-platform-cli
uv tool uninstall nava-platform-cli
```

### pipx

Prerequisites: `git` 2.27+ and Python 3.11+ (the CLI requires Python 3.11+ per
`requires-python = ">=3.11"`; pipx itself only needs Python 3.8+ to run). If you
lack Python 3.11+, let pipx fetch one (see below).

```sh
pipx install git+https://github.com/navapbc/platform-cli
```

If you do not have a new enough Python, let pipx fetch one:

```sh
pipx install --fetch-missing-python --python 3.12 git+https://github.com/navapbc/platform-cli
```

### Nix

No prerequisites beyond [Nix](https://nixos.org/download/) itself.

```sh
nix profile install github:navapbc/platform-cli
```

One-off execution:

```sh
nix run github:navapbc/platform-cli -- <platform_cli_args>
```

### Docker / container

Clone the repository, build the image with `make build`, then either use the
provided wrapper script or run the container directly with the project directory
mounted:

```sh
./bin/docker-wrapper infra install ./my_project_directory

docker run --rm -it -v "$(pwd):/project-dir" nava-platform-cli infra install /project-dir
```

> The `docker-wrapper` script makes assumptions about your environment; review
> its comments before use.

## Quick start

After installation, try the tool on a throwaway directory:

```sh
nava-platform infra install ./just-a-test
```

## Global options

`nava-platform` exposes a top-level callback with a few global options:

- `-v`, `--verbose` — increase verbosity (repeatable; enough `-v`'s prints logs
  to the screen).
- `-q`, `--quiet` — disable all console output.
- `--install-completion` / `--show-completion` — install or print shell
  tab-completion configuration.

## The two command groups

The CLI is organized into two Typer sub-apps:

- **`nava-platform infra ...`** — manage usage of `template-infra`. This template
  provides two parts: a "base" of shared account infrastructure, and a reusable
  "app" part that provides a generic infra shell for running applications. See
  [the infra command reference](./platform-cli-infra-commands.md).
- **`nava-platform app ...`** — manage application templates (for example
  `template-application-rails`). See
  [the app command reference](./platform-cli-app-commands.md).

Under the hood both groups delegate to the same Copier wrapper; see
[how install and update work](./platform-cli-mechanism.md).
