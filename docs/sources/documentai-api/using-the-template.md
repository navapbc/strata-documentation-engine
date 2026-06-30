---
id: documentai-api-using-the-template
title: Using and deploying the DocumentAI template
source: documentai-api
doc_type: guide
tags: [documentai, copier, nava-platform, deployment, aws, fastapi, docker]
related: [documentai-api-overview, documentai-api-new-project-example]
integrates_with: [template-infra]
summary: How to install the DocumentAI template with the nava-platform CLI, run it locally, and deploy it as a sidecar using the Strata AWS infrastructure template.
source_ref:
  repo: https://github.com/navapbc/strata-template-documentai-api
  ref: a8170b5ad1dedf652b65e93949c410a941a1d5e4
  paths:
    - README.md
    - copier.yml
    - template-only-docs/deployment.md
    - template/{{app_name}}/README.md.jinja
    - template/{{app_name}}/Makefile.jinja
    - template/{{app_name}}/local.env.example.jinja
    - template/{{app_name}}/pyproject.toml
    - template/{{app_name}}/docker-compose.yml.jinja
    - template/docs/{{app_name}}/api-authentication.md
verified: ok
last_documented: 2026-06-29
---

# Using and deploying the DocumentAI template

## Prerequisites

- The [`nava-platform` CLI](https://github.com/navapbc/platform-cli) (installs/updates the template).
- For local development of the generated app (`template/{{app_name}}/README.md.jinja`):
  Python 3.11+, [`uv`](https://docs.astral.sh/uv/), Docker & Docker Compose, and Make.

## Installing the template

The template is copier-based but is installed through the `nava-platform` CLI rather than
`copier` directly. From your project's root, for an app to be called `<APP_NAME>`
(README.md "Installation"):

```sh
nava-platform app install --template-uri https://github.com/navapbc/strata-template-documentai-api . <APP_NAME>
```

To update an already-installed copy to a newer template version:

```sh
nava-platform app update . <APP_NAME>
```

### Variables the template prompts for

The template's `copier.yml` declares exactly two answerable variables:

- `app_name` (string) — the name of the app. Must match `^[a-z0-9\-_]+$` (lowercase letters,
  digits, dashes, underscores; not empty).
- `app_local_port` (int, default `8000`) — the port used for local development.

`copier.yml` also sets `_subdirectory: template`, so only the `template/` tree is rendered into
the generated project; `template-only-docs/` and the repo's own top-level files are
template-author material and are **not** copied into your project.

### What the `template/` tree scaffolds

After rendering, `{{app_name}}` is substituted with your chosen name (shown here as the
placeholder `{{app_name}}`). The generated project contains:

- `template/{{app_name}}/` — the Python/FastAPI application (`src/documentai_api/`), its
  `Dockerfile`, `docker-compose.yml`, `Makefile`, `pyproject.toml`, and tests.
- `template/docs/{{app_name}}/` — project docs (API authentication, writing tests, accessing
  real AWS resources from Docker) and the architecture diagram.
- `template/.github/workflows/ci-{{app_name}}.yml` — a generated CI workflow.

## The application stack

Grounded in `template/{{app_name}}/pyproject.toml`: a Python 3.11+ service built on **FastAPI**
+ **uvicorn**, using **boto3** to talk to AWS (S3, DynamoDB, Bedrock Data Automation), with
`pypdf`, `pdf2image`, `opencv-python-headless`, and `python-magic` for document handling, and
**Typer** for the background-job CLIs. Dependencies are managed with `uv` (lockfile
`uv.lock`).

`pyproject.toml` `[project.scripts]` defines four entry points:

- `documentai_api` — runs the FastAPI server (`documentai_api.main:main`).
- `document_processor` — the S3-triggered upload-processing job.
- `bda_result_processor` — the S3-triggered BDA-output-processing job.
- `export-openapi` — exports the OpenAPI spec.

## Running it locally

From `template/{{app_name}}/README.md.jinja` and `Makefile.jinja`. The Makefile picks Docker
vs. native based on the `RUN_CMD_APPROACH` env var (`local` = native, otherwise Docker).

Docker-based (recommended):

```bash
make init          # setup-env (copies local.env.example -> .env) + docker compose build
make start         # docker compose up --renew-anon-volumes --detach
make run-logs      # start, then follow logs
```

Native:

```bash
make init-local                 # setup-env + uv sync --all-extras --frozen
export RUN_CMD_APPROACH=local
make start-local                # uv run documentai_api
```

The API is served at `http://localhost:{{app_local_port}}`. Other useful targets: `make check`
(format + lint + test + test-audit), `make test`, `make lint`, `make format`,
`make openapi-spec`.

### Local environment

`make setup-env` copies `local.env.example` to `.env` if absent. `local.env.example.jinja`
seeds local values including `API_AUTH_INSECURE_SHARED_KEY=local-dev-key`, the BDA ARNs/region,
the DynamoDB table name, and the `DOCUMENTAI_INPUT_LOCATION` / `DOCUMENTAI_OUTPUT_LOCATION` S3
locations. To use real AWS resources from the container, mount `~/.aws` per
`template/docs/{{app_name}}/accessing-real-aws-resources-from-docker.md`.

### Authentication

API endpoints require an `API-Key` header (header name and the shared-key check live in
`src/documentai_api/config/constants.py` and `app.py`). The key comes from the
`API_AUTH_INSECURE_SHARED_KEY` env var; locally it is preconfigured in `local.env.example`.
This is an intentionally simple single shared-key scheme — see
`template/docs/{{app_name}}/api-authentication.md`, which marks it as not suitable for
production multi-user systems.

## Deploying it as a sidecar

This template is meant to be deployed **beside a host application** using the
[Strata AWS infrastructure template](https://github.com/navapbc/template-infra). The exact
steps live in `template-only-docs/deployment.md`; the key points:

1. Install both this template and the infra-app template with `nava-platform` using the same
   `<APP_NAME>`.
2. In `infra/<APP_NAME>/app-config/main.tf`, set `has_database = false` and
   `enable_document_data_extraction = true` to turn on the infra template's **Document Data
   Extraction** module.
3. Wire the service's `file_upload_jobs` (in `env-config/file_upload_jobs.tf`) so the
   `document_processor` job triggers on the module's **input** bucket and the
   `bda_result_processor` job triggers on its **output** bucket.
4. Provision a **DynamoDB** metadata table (the deployment doc supplies a full
   `documentai_api.tf` with the table, GSI, KMS key, and IAM policy) and add `dynamodb` to
   `aws_services`.
5. Inject the service env vars the app expects (`AWSEnvConfig` in
   `src/documentai_api/config/env.py`): `BDA_PROJECT_ARN`, `BDA_PROFILE_ARN`, `BDA_REGION`,
   `DOCUMENTAI_DOCUMENT_METADATA_TABLE_NAME`, `DOCUMENTAI_DOCUMENT_METADATA_JOB_ID_INDEX_NAME`,
   `DOCUMENTAI_INPUT_LOCATION`, `DOCUMENTAI_OUTPUT_LOCATION`. The deployment doc aliases the
   module's standard `DDE_*` outputs onto these names.
6. Add `API_AUTH_INSECURE_SHARED_KEY` as a generated secret in the app's env-config.
7. Configure custom domains and HTTPS support per the infra template docs.

The deployment doc's "General" section also lists the minimum resources if you are not using
the infra template: a container runtime for the server and background jobs, S3 bucket(s), an
S3-event trigger for the jobs, a DynamoDB table, and a Bedrock Data Automation project.

## Using the API once deployed

From `template/{{app_name}}/README.md.jinja` and `app.py`:

```bash
# Async upload — returns immediately with a jobId to poll
curl -X POST http://localhost:{{app_local_port}}/v1/documents \
  -H "API-Key: your-key" \
  -F "file=@/path/to/document.pdf" \
  -F "category=income"

# Sync upload — waits for processing to complete
curl -X POST "http://localhost:{{app_local_port}}/v1/documents?wait=true&timeout=120" \
  -H "API-Key: your-key" \
  -F "file=@/path/to/document.pdf" \
  -F "category=income"
```

Poll for results at `GET /v1/documents/{job_id}` (add `?include_extracted_data=true` to
include extracted fields). `GET /v1/schemas` lists supported document types and
`GET /v1/schemas/{document_type}` returns a type's field schema. `GET /health` and `GET /config`
are public (no API key).
