---
id: rules-engine-catala-using-the-template
title: Using and deploying the Catala rules-engine template
source: strata-template-rules-engine-catala
doc_type: guide
tags: [catala, copier, nava-platform, fastapi, docker, poetry, rules-engine]
related: [rules-engine-catala-overview, rules-engine-catala-new-project-example]
integrates_with: [template-infra]
summary: How to install the Catala rules-engine template with the nava-platform CLI, what it scaffolds, and how to compile Catala rules, run the FastAPI app locally, and add new rule modules.
source_ref:
  repo: https://github.com/navapbc/strata-template-rules-engine-catala
  ref: 60d6db4a50d50efc31b93f9aa2572bab77bb8cec
  paths:
    - README.md
    - copier.yml
    - template/{{app_name}}/README.md.jinja
    - template/{{app_name}}/Makefile.jinja
    - template/{{app_name}}/Dockerfile
    - template/{{app_name}}/docker-compose.yml.jinja
    - template/{{app_name}}/pyproject.toml
    - template/{{app_name}}/local.env.jinja
    - template/{{app_name}}/catala/clerk.toml
    - template/{{app_name}}/src/api.py
    - template/{{app_name}}/src/modules/__init__.py
    - template/docs/{{app_name}}/getting-started.md.jinja
    - template/docs/{{app_name}}/writing-rules-in-catala.md.jinja
    - template/docs/{{app_name}}/adding-modules.md.jinja
    - template/.github/workflows/ci-{{app_name}}.yml.jinja
verified: ok
last_documented: 2026-06-29
---

# Using and deploying the Catala rules-engine template

## Prerequisites

- The [`nava-platform` CLI](https://github.com/navapbc/platform-cli) (installs/updates the
  template).
- For local development of the generated app (from
  `template/docs/{{app_name}}/getting-started.md.jinja`): Python 3.13+, a Catala-compatible
  Python environment, [poetry](https://python-poetry.org/docs/#installation), and a
  Docker-compatible container runtime (Docker, [Podman](https://podman.io/docs/installation), or
  [Colima](https://github.com/abiosoft/colima)).
- Optionally, the [Catala compiler](https://catala-lang.org/en/install) if you want to compile
  Catala sources locally outside Docker.

## Installing the template

The template is copier-based but is installed through the `nava-platform` CLI, **not** raw
`copier copy`. From your project's root, for an app to be called `<APP_NAME>`
(`README.md` "Installation"):

```sh
nava-platform app install --template-uri https://github.com/navapbc/strata-template-rules-engine-catala . <APP_NAME>
```

To test local changes to the template, point `--template-uri` at a local path instead
(`README.md` "Testing Template Changes"):

```sh
nava-platform app install --template-uri /path/to/strata-template-rules-engine-catala /tmp/test-catala-project test-app
```

`README.md` does not document a distinct update command for this template; the `nava-platform`
CLI's `app update` command is the supported update path for `nava-platform`-installed apps.

### Variables the template prompts for

The template's `copier.yml` declares exactly two answerable variables:

- `app_name` (string) — the name of the app. Validated against `^[a-z0-9\-_]+$` (lowercase
  letters, digits, dashes, and underscores; not empty).
- `app_local_port` (int, default `3001`) — the port used for local development of the app.

`copier.yml` sets `_subdirectory: template`, so only the `template/` tree is rendered into the
generated project; the repo's top-level files (`README.md`, `copier.yml`, `code.json`, etc.) and
`template-only-docs/` are template-author material and are **not** copied into your project.

## What the `template/` tree scaffolds

After rendering, `{{app_name}}` is substituted with your chosen name (shown here as the
placeholder `{{app_name}}`). The generated project contains:

- `template/{{app_name}}/` — the rules-engine application:
  - `catala/src/` — Catala source files (the shipped example is `paidleave.catala_en`), with
    `catala/tests/` holding Catala test scenarios and `catala/clerk.toml` configuring the build.
  - `src/api.py` — the thin FastAPI application; `src/main.py` — the uvicorn entrypoint.
  - `src/modules/` — one router module per Catala domain (ships `paidleave.py`), auto-discovered
    at startup.
  - `src/generated/` — Python output produced by the Catala compiler.
  - `tests/` — Python API tests; `Dockerfile`, `docker-compose.yml`, `Makefile`,
    `pyproject.toml`, and `local.env`.
- `template/docs/{{app_name}}/` — project docs: `getting-started.md`, `writing-rules-in-catala.md`,
  `adding-modules.md`, plus an architectural-decision-records folder under `docs/decisions/`.
- `template/.github/workflows/ci-{{app_name}}.yml` — a generated CI workflow.

## The application stack

Grounded in `template/{{app_name}}/pyproject.toml` and `Dockerfile`: a Python 3.13 service built
on **FastAPI** + **uvicorn**, with **pydantic** / **pydantic-settings** for request/response
models, **gmpy2** and **python-dateutil** supporting the Catala runtime, and **poetry** managing
dependencies. Dev tooling (`[project.optional-dependencies] dev`) is **mypy**, **ruff**,
**pytest** / **pytest-watch**, **coverage**, and **httpx**. The `Dockerfile` is multi-stage
(`base` → `dev` / `release`); `[project.scripts]` defines a `start-server` entry point
(`src.main:main`), which the `release` image runs by default.

## Compiling Catala rules

From `template/docs/{{app_name}}/writing-rules-in-catala.md.jinja` and `Makefile.jinja`. Catala
sources live in `catala/src/` and are built with `clerk`:

```bash
make catala-build   # compile Catala sources to Python via `clerk build`, then copy outputs into src/generated/
make catala-test    # run Catala test assertions via `clerk test`
```

`make catala-build` runs `clerk build` and then copies the generated files into `src/generated/`
(the Makefile notes it must also copy `dates.py` manually to work around Catala compiler
[issue #981](https://github.com/CatalaLang/catala/issues/981)). The compiled Python is imported by
the API layer and is excluded from ruff/mypy/coverage (`pyproject.toml`).

## Running it locally

From `template/docs/{{app_name}}/getting-started.md.jinja`, `README.md.jinja`, and
`Makefile.jinja`. Run everything from inside the `{{app_name}}/` folder.

Docker-based (default):

```bash
make init start   # build the image (init -> build) and start the container (docker compose up --detach)
make run-logs     # follow the running container's logs
make stop         # docker compose down
```

The API docs (Swagger UI) are then at `localhost:{{app_local_port}}/docs`.

Native:

```bash
export PY_RUN_APPROACH=local   # run commands natively instead of in Docker (default is `docker`)
make setup-local               # poetry config virtualenvs.in-project true + poetry install --no-root
```

`PY_RUN_APPROACH` selects whether the `Makefile`'s Python targets run via `poetry run` (`local`)
or `docker compose run ... poetry run` (anything else). Other targets: `make check`
(`format-check` + `lint` + `test`), `make test`, `make test-all` (Catala + Python tests),
`make lint` (ruff + mypy), `make format`, and `make login` (shell into the running container).

### Local environment

`local.env` (rendered from `local.env.jinja`) is loaded by `docker-compose.yml` and seeds
`ENVIRONMENT=local` and `PORT={{app_local_port}}`. Create an `override.env` beside it for personal
overrides (it is loaded but not required). It also documents the optional `LOG_LEVEL` and
`DISABLED_MODULES` variables (see below).

## The module system

`src/api.py` stays thin: it defines a `GET /health` endpoint and then calls
`discover_routers()` from `src/modules/__init__.py`, including every router it yields. Per
`adding-modules.md` and `src/modules/__init__.py`, **any** file in `src/modules/` that exports a
`router` (a FastAPI `APIRouter`) is auto-discovered and mounted at startup — so adding a rule
domain never requires editing `api.py`. Modules are loaded in sorted order by name.

To disable a module without deleting it, set the `DISABLED_MODULES` environment variable to a
comma-separated list of module filenames (without `.py`), e.g. `DISABLED_MODULES=paidleave`. The
discovery code skips any short module name in that set.

## Adding a new rule with endpoints

The end-to-end flow combines `writing-rules-in-catala.md` and `adding-modules.md`:

1. Write/edit rules in a new `.catala_en` file under `catala/src/`.
2. Add a `[[target]]` entry for the new module in `catala/clerk.toml`, and add Catala test
   assertions under `catala/tests/`.
3. Run `make catala-build` to compile to Python (outputs land in `src/generated/`).
4. Create a new module file in `src/modules/` exporting a `router` (an `APIRouter`); no change to
   `api.py` is needed.
5. Add Python API tests under `tests/` and run `make test-all`.

## CI and deployment

The generated workflow `template/.github/workflows/ci-{{app_name}}.yml` runs three jobs on PRs and
on pushes to `main` that touch `{{app_name}}/**` (or the workflow file): **Lint** (`make format-check`, `make lint`), **Test**
(`make build`, `make test-coverage`), and **Catala Tests** (runs `make catala-test` inside the
upstream Catala CI Docker image `registry.gitlab.inria.fr/catala/ci-images:latest-python`).

For deployment, `README.md` directs you to the
[Strata AWS infrastructure template](https://github.com/navapbc/template-infra): the rules-engine
app is intended to run on infrastructure provisioned by `template-infra` (hence this doc
`integrates_with` `template-infra`). The `release` Docker target produces the production image,
running `start-server` by default.
