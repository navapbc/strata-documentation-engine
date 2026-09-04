---
id: documentai-api-using-the-template
title: Using and deploying the DocumentAI template
source: documentai-api
doc_type: guide
tags: [documentai, copier, nava-platform, deployment, aws, fastapi, docker]
related: [documentai-api-overview, documentai-api-new-project-example]
integrates_with: [template-infra]
summary: How to install the DocumentAI template with the nava-platform CLI, what it scaffolds, how to run it locally, and how to deploy it beside a host app with the Strata AWS infrastructure template.
source_ref:
  repo: https://github.com/navapbc/strata-template-documentai-api
  ref: 753ad50eba97fa5a3489370b7b5d3831c4e0105f
  paths:
    - README.md
    - copier.yml
    - template-only-docs/deployment.md
    - template/.strata-template-documentai-api/{{_copier_conf.answers_file}}.jinja
    - template/.github/workflows/ci-{{app_name}}.yml.jinja
    - template/{{app_name}}/README.md.jinja
    - template/{{app_name}}/Makefile.jinja
    - template/{{app_name}}/local.env.example.jinja
    - template/{{app_name}}/pyproject.toml
    - template/{{app_name}}/Dockerfile
    - template/{{app_name}}/docker-compose.yml.jinja
    - template/{{app_name}}/src/documentai_api/config/env.py
    - template/{{app_name}}/src/documentai_api/models/base.py
    - template/{{app_name}}/src/documentai_api/app.py
    - template/{{app_name}}/src/documentai_api/main.py
    - template/{{app_name}}/src/documentai_api/config/constants.py
    - template/{{app_name}}/src/documentai_api/jobs/document_processor/main.py
    - template/{{app_name}}/src/documentai_api/jobs/bda_result_processor/main.py
    - template/docs/{{app_name}}/api-authentication.md
    - template/docs/{{app_name}}/accessing-real-aws-resources-from-docker.md
last_documented: 2026-09-04
verified: ok
---

# Using and deploying the DocumentAI template

## Prerequisites

- The [`nava-platform` CLI](https://github.com/navapbc/platform-cli), which installs and updates
  the template.
- For local development of the generated app (`template/{{app_name}}/README.md.jinja`):
  Python 3.12+, [`uv`](https://docs.astral.sh/uv/), Docker and Docker Compose, and Make. The AWS
  CLI is optional, for poking at real AWS resources during development.

## Installing the template

The template is copier-based, but the supported install path is the `nava-platform` CLI, not
`copier copy`. From your project's root, for an app to be called `<APP_NAME>` (README
"Installation"):

```sh
nava-platform app install --template-uri https://github.com/navapbc/strata-template-documentai-api . <APP_NAME>
```

Then follow `<APP_NAME>/README.md` to set the application up locally, and — if you are using the
Strata infrastructure template — the deployment steps below.

To move an already-installed copy to a newer version of the template:

```sh
nava-platform app update . <APP_NAME>
```

### Variables the template prompts for

`copier.yml` declares exactly two answerable variables:

| Variable | Type | Default | Constraint |
| --- | --- | --- | --- |
| `app_name` | str | (required) | Must match `^[a-z0-9\-_]+$` — non-empty, lowercase letters, digits, dashes, underscores |
| `app_local_port` | int | `8000` | The port used for local development of `app_name` |

`copier.yml` also sets `_subdirectory: template`, so only the `template/` tree is rendered into
your project. `template-only-docs/` and the repository's own top-level files are template-author
material and are **not** copied into a generated project.

The answers copier records are written to the path the `nava-platform` CLI configures, via the
answers-file template the repo ships at
`template/.strata-template-documentai-api/{{_copier_conf.answers_file}}.jinja`. The comment in
`copier.yml` explains why the destination is not hard-coded as
`_answers_file: .strata-template-documentai-api/{{app_name}}.yml`: copier does not currently
support a templated `_answers_file` ([copier-org/copier#1868](https://github.com/copier-org/copier/issues/1868)).

### What the `template/` tree scaffolds

Rendering substitutes your chosen name for `{{app_name}}` (shown below as the placeholder, never
as a literal directory):

- `template/{{app_name}}/` — the Python/FastAPI application (`src/documentai_api/`) with its
  `Dockerfile`, `docker-compose.yml`, `Makefile`, `pyproject.toml`, `uv.lock`, `local.env.example`,
  and `tests/`.
- `template/docs/{{app_name}}/` — project docs (`api-authentication.md`, `writing-tests.md`,
  `accessing-real-aws-resources-from-docker.md`) plus the architecture diagram source
  (`diagrams/architecture.mmd`) and its rendered `media/architecture.png`.
- `template/.github/workflows/ci-{{app_name}}.yml.jinja` — a per-app CI workflow that renders to
  `.github/workflows/ci-<app_name>.yml`. It scopes itself to changes under `<app_name>/**`, and
  runs `make build` then `make format` / `make lint` in a lint job and `make test-audit` +
  `make test-coverage` in a test job.

Note the docs live *beside* the app directory, at `docs/<app_name>/`, not inside it.

## The application stack

From `template/{{app_name}}/pyproject.toml`: a `requires-python = ">=3.12"` service built on
**FastAPI** + **uvicorn**, using **boto3** for AWS (S3, DynamoDB, Bedrock Data Automation),
**pydantic-settings** for env config, **Typer** for the background-job CLIs, **tenacity** for BDA
retries, and `pypdf`, `pdf2image`, `opencv-python-headless`, `numpy`, and `python-magic` for
document handling. Dependencies are managed by `uv` against the committed `uv.lock`; `mypy` runs in
`strict = true` mode over `src`, and `ruff` handles format and lint at a 100-character line length.
The `Dockerfile` builds `dev` and `release` stages from `ghcr.io/astral-sh/uv:python3.14-trixie-slim`
and installs the OS packages the document tooling needs (`libmagic1`, `poppler-utils`,
`libopencv-dev`).

`pyproject.toml` `[project.scripts]` defines the four entry points, and these names are what you
invoke both locally and as deployed task commands:

| Script | Target | What it is |
| --- | --- | --- |
| `documentai_api` | `documentai_api.main:main` | the FastAPI server |
| `document_processor` | `documentai_api.jobs.document_processor.main:app` | S3-triggered upload-processing job |
| `bda_result_processor` | `documentai_api.jobs.bda_result_processor.main:app` | S3-triggered BDA-output-processing job |
| `export-openapi` | `documentai_api.cli.export_openapi:app` | writes the OpenAPI spec to stdout |

## Running it locally

From `template/{{app_name}}/README.md.jinja` and `Makefile.jinja`. The Makefile chooses Docker or
native execution from the `RUN_CMD_APPROACH` environment variable: `local` runs commands directly,
anything else (including unset) wraps them in `docker compose run --rm <app_name>`.

Docker-based (the README's recommended path):

```bash
make init          # setup-env, then docker compose build
make start         # docker compose up --renew-anon-volumes --detach
make run-logs      # start, then follow the app's logs
make stop          # docker compose down
```

Native:

```bash
make init-local                 # setup-env, then uv sync --all-extras --frozen
export RUN_CMD_APPROACH=local
make start-local                # uv run --frozen documentai_api
```

The API is served at `http://localhost:{{app_local_port}}`. `docker-compose.yml.jinja` maps
`{{app_local_port}}` on the host to `8000` in the container, but the server binds to whatever `HOST`
and `PORT` your `.env` sets (`main.py` passes `config.host` / `config.port` to uvicorn), and
`local.env.example` seeds `HOST=localhost` and `PORT={{app_local_port}}`. For the Docker path, set
`HOST=0.0.0.0` and `PORT=8000` in `.env` so the container listens where the port mapping expects;
the seeded values are what the native path wants. Other targets: `make check`
(`format lint test test-audit`), `make test`, `make test-coverage`, `make test-parallel`,
`make test-audit`, `make lint` (ruff + `uv lock --check` + mypy), `make format`, `make login`
(shell into the running container), `make openapi-spec` (writes `../docs/<app_name>/openapi.json`),
and `make architecture-diagram` (re-renders the mermaid diagram to PNG). `make help` lists the
documented targets; `architecture-diagram` carries no `##` comment, so it never shows up there.

Note that `pyproject.toml` sets `addopts = "-m 'not audit'"`, so the audit-logging tests are
excluded from a normal `make test` run and only execute under `make test-audit`. That is why CI and
`make check` call both.

### Local environment

`make setup-env` copies `local.env.example` to `.env` only if `.env` does not already exist — an
existing `.env` is never overwritten. `local.env.example.jinja` seeds working local values:
`HOST=localhost`, `PORT={{app_local_port}}`, `API_AUTH_INSECURE_SHARED_KEY=local-dev-key`,
`LOG_FORMAT=human-readable`, `ENVIRONMENT=local`, `IMAGE_TAG=local`,
placeholder BDA project/profile ARNs and region, the DynamoDB table and `jobId-index` names, and
the `DOCUMENTAI_INPUT_LOCATION` / `DOCUMENTAI_OUTPUT_LOCATION` S3 URIs.

The env contract itself is `src/documentai_api/config/env.py`: `AWSEnvConfig` requires
`BDA_PROJECT_ARN`, `BDA_PROFILE_ARN`, `DOCUMENTAI_DOCUMENT_METADATA_TABLE_NAME`,
`DOCUMENTAI_DOCUMENT_METADATA_JOB_ID_INDEX_NAME`, `DOCUMENTAI_INPUT_LOCATION`, and
`DOCUMENTAI_OUTPUT_LOCATION`, and defaults `BDA_REGION` to `us-east-1` and
`MAX_BDA_INVOKE_RETRY_ATTEMPTS` to `3`. `AppEnvConfig` requires `API_AUTH_INSECURE_SHARED_KEY` and
`ENVIRONMENT`, and defaults `HOST` to `127.0.0.1` and `PORT` to `8000`. Both read `.env` and ignore
unknown keys, so a missing required variable fails at startup, not at request time.

To exercise real AWS resources from the container, mount `~/.aws` read-only and pass through
`AWS_PROFILE` as described in `template/docs/{{app_name}}/accessing-real-aws-resources-from-docker.md`.

### Authentication

Protected endpoints require an `API-Key` header (`APIConfig.AUTH_KEY_HEADER_NAME` in
`config/constants.py`); `verify_api_key` in `app.py` compares it against
`API_AUTH_INSECURE_SHARED_KEY` with `secrets.compare_digest`. A missing key or a mismatch is a 401;
an unset environment variable is a 500 ("API key not configured"). `GET /`, `GET /health`, and
`GET /config` are public.

This is deliberately a single shared "skeleton key". `template/docs/{{app_name}}/api-authentication.md`
marks it as suitable for demos, internal tools, and dev/staging only — **not** for production
systems with multiple users, per-user permissions, or compliance requirements. In hosted
environments the key lives in SSM Parameter Store at
`/{app_name}-{env}/api-auth-insecure-shared-key`, and rotating it means updating the secret and
redeploying so the server re-reads it.

## Deploying it beside a host application

The template is meant to be deployed alongside a host application using the
[Strata AWS infrastructure template](https://github.com/navapbc/template-infra). The authoritative
steps, with full Terraform, are in `template-only-docs/deployment.md`; the shape of it:

1. Install both this template and the infra-app template with `nava-platform`, using the same
   `<APP_NAME>`.
2. In `infra/<APP_NAME>/app-config/main.tf`, set `has_database = false` and
   `enable_document_data_extraction = true` to turn on the infra template's **Document Data
   Extraction** (DDE) module. It works out of the box; read the DDE docs before tuning blueprints,
   because the update process matters after initial setup.
3. In `infra/<APP_NAME>/app-config/env-config/file_upload_jobs.tf`, register the two jobs:
   `document_processor` on the DDE module's **input** bucket with `path_prefix = "input/"`, and
   `bda_result_processor` on its **output** bucket with `path_prefix = "processed/"`.
4. Add `dynamodb` to `aws_services` in `infra/project-config/aws_services.tf`, and add
   `infra/<APP_NAME>/service/documentai_api.tf` — the deployment doc supplies it complete: the
   metadata table keyed on `fileName` with a `jobId-index` GSI and TTL, a KMS key for
   encryption at rest, point-in-time recovery, and an IAM policy granting the table and index.
5. Wire that file's outputs into `infra/<APP_NAME>/service/main.tf` by appending
   `local.documentai_api_environment_variables` to `extra_environment_variables` and the DynamoDB
   policy to `extra_policies`.
6. Add `API_AUTH_INSECURE_SHARED_KEY` to `secrets` in
   `infra/<APP_NAME>/app-config/env-config/environment_variables.tf` with
   `manage_method = "generated"`.
7. Configure custom domains and HTTPS support per the infra template's own docs.

Step 4 also does the env-var translation this service still needs: the DDE module publishes
`DDE_INPUT_LOCATION`, `DDE_OUTPUT_LOCATION`, `DDE_PROJECT_ARN`, and `DDE_PROFILE_ARN`, and the
supplied Terraform aliases them onto the `DOCUMENTAI_*` / `BDA_*` names in `config/env.py`,
appending `/input` and `/processed` to the two locations. Upstream issues
[#52](https://github.com/navapbc/strata-template-documentai-api/issues/52) and
[#53](https://github.com/navapbc/strata-template-documentai-api/issues/53) track teaching the app
to read the `DDE_*` names directly and to derive the region from `BDA_PROFILE_ARN`.

Two gotchas when copying that Terraform:

- The `extra_policies` snippet references `aws_iam_policy.dynamodb_read_write.arn`, but the
  resource the same document defines is `aws_iam_policy.documentai_api_dynamodb_read_write`. Use
  the name you actually declared.
- The two jobs take their positional arguments in **opposite** orders, and the documented
  `task_command`s reflect that: `["document_processor", "<object_key>", "<bucket_name>"]` versus
  `["bda_result_processor", "<bucket_name>", "<object_key>"]`. Both match the Typer signatures in
  `jobs/document_processor/main.py` and `jobs/bda_result_processor/main.py`; swapping them will
  fail at runtime, not at plan time.

If you are not using the infra template, `template-only-docs/deployment.md` lists the minimum you
must provide yourself: a container runtime for the server and the background jobs, S3 bucket(s), an
S3-event trigger that runs the jobs on object creation under specific prefixes, a DynamoDB table,
and a Bedrock Data Automation project.

## Using the API

From `template/{{app_name}}/README.md.jinja` and `src/documentai_api/app.py`:

```bash
# Async upload (default) — returns immediately with a jobId to poll
curl -X POST http://localhost:{{app_local_port}}/v1/documents \
  -H "API-Key: your-key" \
  -F "file=@/path/to/document.pdf" \
  -F "category=income"

# Sync upload — polls internally and returns the finished result
curl -X POST "http://localhost:{{app_local_port}}/v1/documents?wait=true&timeout=120" \
  -H "API-Key: your-key" \
  -F "file=@/path/to/document.pdf" \
  -F "category=income"
```

The endpoints, per `app.py` and the `/config` response:

- `POST /v1/documents` — upload. `category` is an optional form field; `X-Trace-ID` is an optional
  request header and is echoed back on the response (one is generated if you omit it). `wait=false`
  is the default; when `wait=true` the handler polls DynamoDB every 5 seconds up to `timeout`
  seconds (the parameter's default in code is `180`, chosen to absorb ECS cold starts and BDA
  processing time, even though the docstring says 120) and returns a `failed` status on timeout
  rather than an error. That poll loop waits on `ProcessStatus.is_completed`, which does **not**
  include `blurry_document_detected` or `password_protected` — both of which already have a final
  response written to the record by `insert_initial_ddb_record`. A `wait=true` upload of a blurry or
  locked document therefore burns the whole timeout and comes back `failed`, where a `GET` on the
  job id would have returned the real reason at once. Prefer async upload plus polling.
- `GET /v1/documents/{job_id}` — status and results; add `?include_extracted_data=true` to rebuild
  the response with extracted fields. Unknown job ids are 404.
- `GET /v1/schemas` and `GET /v1/schemas/{document_type}` — the document types and field schemas
  read from your BDA project's custom blueprints, cached for 60 minutes.
- `GET /`, `GET /health`, `GET /config` — public. `/config` reports the version, image tag,
  environment, supported file types, and the endpoint map.

All response bodies are serialized in camelCase (`models/base.py` applies pydantic's `to_camel`
alias generator), so expect `jobId` and `jobStatus`, not `job_id` and `job_status`. CORS is wide
open in `app.py` (`allow_origins=["*"]`) — tighten it before exposing the service beyond a trusted
network.

File limits worth designing around. The generated README states images (JPEG, PNG, TIFF) up to
5 MB and PDFs up to 500 MB, matching `BDA_MAX_IMAGE_SIZE_BYTES` (5 MiB) and
`BDA_MAX_DOCUMENT_FILE_SIZE_BYTES` (500 MiB) in `ConfigDefaults`. The code disagrees on one point:
`is_file_too_large_for_bda` in `jobs/document_processor/main.py` applies the image limit only to
`image/jpeg` and `image/png`, and gives `image/tiff` the 500 MiB document limit — so trust the code
over the README for TIFF. Files longer than 5 pages are trimmed to the first 5 by
`invoke_bedrock_data_automation` (logged, and re-uploaded under a `_truncated` suffix, not
rejected); documents must not be password-protected; and a document needs more than 50 alphanumeric
characters before it counts as a document at all.

For the interactive endpoint list, the generated app serves FastAPI's `/docs`; for a checked-in
artifact, `make openapi-spec` writes `docs/<app_name>/openapi.json`. (The generated README links
that spec as `../{{app_name}}/docs/openapi.json`, which does not match where the Makefile writes
it — use the Makefile's path.)
