---
id: platform-cli-overview
title: nava-platform CLI overview
source: platform-cli
doc_type: guide
tags: [platform-cli, cli, installation, copier, strata]
related: [platform-cli-mechanism, platform-cli-infra-commands, platform-cli-app-commands, platform-cli-updating-projects, platform-cli-legacy-migration]
component_keys: [platform-cli]
summary: What the nava-platform CLI is, how to install it (uv, Nix, pipx, container), how to get help and read its logs, and the two command groups (infra and app) it exposes.
source_ref:
  repo: https://github.com/navapbc/platform-cli
  ref: 5ed1286af74c16bd0be9132655dbe3b31b4b001b
  paths:
    - docs/getting-started/index.md
    - docs/getting-started/installation.md
    - docs/getting-started/usage.md
    - docs/guides/new-project.md
    - docs/getting-started/help.md
    - nava/platform/cli/main.py
    - nava/platform/cli/config.py
    - nava/platform/cli/logging/__init__.py
    - nava/platform/cli/commands/infra/__init__.py
    - nava/platform/cli/commands/infra/install_command.py
    - nava/platform/cli/commands/app.py
last_documented: 2026-09-04
verified: ok
---

# nava-platform CLI overview

The `nava-platform` CLI is a Python/[Typer](https://typer.tiangolo.com/) tool
that wraps [Copier](https://copier.readthedocs.io/en/stable/) to install and
update the Strata templates in a project. Its own top-level help describes it as
a "tool to help manage using Nava PBC's platform work."

## Installation

Pick one method. The uv, Nix, and pipx methods install the tool from the
GitHub repository; the container method builds an image from a local clone.

### uv

Prerequisite: `git` 2.27+ on your `$PATH`, plus
[uv](https://docs.astral.sh/uv/getting-started/installation/) 0.6.15+.

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

### Nix

No prerequisites beyond [Nix](https://nixos.org/download/) itself — Nix provides
everything else needed.

```sh
nix profile add github:navapbc/platform-cli
```

One-off execution:

```sh
nix run github:navapbc/platform-cli -- <platform_cli_args>
```

Upgrade / uninstall:

```sh
nix profile upgrade platform-cli
nix profile remove platform-cli
```

### pipx

Prerequisites: `git` 2.27+ and Python 3.11+ on your system. (pipx itself needs
Python 3.10+ to run, but the tools it installs are isolated from system Python
packages.)

```sh
pipx install git+https://github.com/navapbc/platform-cli
```

If you do not have a new enough Python, let pipx fetch one:

```sh
pipx install --fetch-missing-python --python 3.12 git+https://github.com/navapbc/platform-cli
```

One-off execution:

```sh
pipx run --spec git+https://github.com/navapbc/platform-cli nava-platform <platform_cli_args>
```

### Container

Prerequisite: Docker (or another container runtime).

Container images are **not currently published**, so you build one yourself:
clone the repository and run `make build`. Then use the wrapper script rather
than a bare `nava-platform` command:

```sh
./bin/docker-wrapper infra install ./my_project_directory
```

(or alias it in your shell). Review the `docker-wrapper` script's comments
first — it makes assumptions about your environment. To run the image directly,
mount the target project into the container:

```sh
docker run --rm -it -v "$(pwd):/project-dir" nava-platform-cli infra install /project-dir
```

### Shell autocompletion

```sh
nava-platform --install-completion   # enable tab completion for your shell
nava-platform --show-completion      # print the configuration to install manually
```

## Verifying the install

```sh
nava-platform --help
```

This confirms the tool is installed and lists the available commands. `--help`
works on every command and sub-command too:

```sh
nava-platform infra --help
nava-platform infra install --help
```

## Starting a new project

The end-to-end sequence for a brand-new project, assuming you already have a
cloud account provisioned with admin access:

1. `git init <MY_PROJECT_DIR>` and `cd` into it.
2. Decide what your first application will be called (`<APP_NAME>` below).
3. Install `template-infra`:

    ```sh
    nava-platform infra install --commit --data app_name=<APP_NAME> .
    ```

    The upstream guide still shows the older trailing-positional form
    (`infra install --commit . <APP_NAME>`); `infra install` now declares only
    the project directory as a positional, so Typer would reject that second
    argument. Pass the app name via `--data app_name=` instead.

4. Install an application template for that app:

    ```sh
    nava-platform app install --commit --template-uri <TEMPLATE_URI> . <APP_NAME>
    ```

5. Follow the "First time initialization" section of the generated
   `/infra/README.md` to create the initial resources and dev environment.
6. With a dev environment in place, enable the features that depend on it:

    ```sh
    nava-platform infra update-app --answers-only --data app_has_dev_env_setup=true . <APP_NAME>
    ```

To add an application to an existing project instead, see
[the infra command reference](./platform-cli-infra-commands.md) (`infra add-app`)
and [the app command reference](./platform-cli-app-commands.md)
(`app install`).

## Global options

The top-level Typer callback exposes:

- `-v` / `--verbose` — increase verbosity; repeatable. One `-v` adds extra
  inline detail where a command has any to share (not all do); repeating it
  further also sends the log stream to your screen, and a third `-v` turns on
  the CLI's audit logging.
- `-q` / `--quiet` — disable all console output.

The top-level command also accepts `--install-completion` /
`--show-completion` (provided by Typer, not declared by the callback) — see
shell tab completion, above.

## Logs

The CLI always writes structured JSON logs to a file on your system (unless
`LOG_TO_FILE` is set false), whether or not you also print them with `-v` flags.
The exact location varies by platform and configuration, but by default:

- Linux: `~/.local/share/state/nava-platform-cli/log/log.json`
- macOS: `~/Library/Logs/nava-platform-cli/log.json`

If you hit an error using the tool — or find an error in its documentation — the
[project's GitHub issues](https://github.com/navapbc/platform-cli/issues) are
the place to search for it or file a new one.

## The two command groups

The CLI is organized into two Typer sub-apps:

- **`nava-platform infra ...`** — manage a project's use of `template-infra`.
  That template provides two parts: a "base" of shared account infrastructure,
  and a reusable "app" part that provides a generic infra shell for running
  applications. See [the infra command reference](./platform-cli-infra-commands.md).
- **`nava-platform app ...`** — manage application templates (for example
  `template-application-rails`). See
  [the app command reference](./platform-cli-app-commands.md).

Both groups delegate to the same Copier wrapper; see
[how install and update work](./platform-cli-mechanism.md). To stand up a whole
project (infra plus apps) you need a cloud (AWS/Azure) account provisioned with
admin access first — the infra templates need a concrete environment to do
anything useful. To just try an application template locally, the Strata
application templates carry their own install commands in their READMEs.

Once you have a project, see [updating a project](./platform-cli-updating-projects.md)
for staying current with upstream, and
[migrating from a legacy template](./platform-cli-legacy-migration.md) if your
project still uses the pre-CLI install/update scripts.
