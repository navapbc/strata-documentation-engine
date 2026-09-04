---
id: documentai-api-new-project-example
title: "Example: scaffolding a new DocumentAI API project"
source: documentai-api
doc_type: example
tags: [documentai, example, copier, nava-platform, scaffold]
related: [documentai-api-using-the-template, documentai-api-overview]
summary: A concrete walk-through of installing the DocumentAI template into a project, the answers given to each prompt, the resulting tree, and a first local smoke test.
source_ref:
  repo: https://github.com/navapbc/strata-template-documentai-api
  ref: 753ad50eba97fa5a3489370b7b5d3831c4e0105f
  paths:
    - README.md
    - copier.yml
    - template/.strata-template-documentai-api/{{_copier_conf.answers_file}}.jinja
    - template/.github/workflows/ci-{{app_name}}.yml.jinja
    - template/{{app_name}}/README.md.jinja
    - template/{{app_name}}/Makefile.jinja
    - template/{{app_name}}/local.env.example.jinja
    - template/{{app_name}}/docker-compose.yml.jinja
    - template/{{app_name}}/src/documentai_api/app.py
    - template/{{app_name}}/src/documentai_api/main.py
    - template/{{app_name}}/Dockerfile
    - template/{{app_name}}/src/documentai_api/config/env.py
    - template/{{app_name}}/src/documentai_api/models/base.py
    - template/{{app_name}}/pyproject.toml
last_documented: 2026-09-04
verified: ok
---

# Example: scaffolding a new DocumentAI API project

A worked example of installing the DocumentAI template and what you get back. The commands come
from the repository `README.md` and the generated app's `Makefile`; the variable values are an
illustrative choice for an app named `doc-intake`.

## 1. Install the template

From the root of your project, after
[installing the nava-platform CLI](https://github.com/navapbc/platform-cli):

```sh
nava-platform app install --template-uri https://github.com/navapbc/strata-template-documentai-api . doc-intake
```

## 2. Answer the prompts

`copier.yml` declares two answerable variables:

| Prompt | Example answer | Notes |
| --- | --- | --- |
| `app_name` | `doc-intake` | Must match `^[a-z0-9\-_]+$` — lowercase letters, digits, dashes, underscores; not empty. |
| `app_local_port` | `8000` | The default. Used as the host port in `docker-compose.yml` and as `PORT` in `local.env.example`. |

Copier records the answers through the answers-file template the repo ships at
`template/.strata-template-documentai-api/{{_copier_conf.answers_file}}.jinja`, at whichever path
the `nava-platform` CLI configures — `copier.yml` cannot hard-code it (see the comment there citing
[copier-org/copier#1868](https://github.com/copier-org/copier/issues/1868)). That file is what
`nava-platform app update . doc-intake` later reads to know which template version you are on, so
commit it.

## 3. Resulting project structure

`copier.yml` sets `_subdirectory: template`, so only the `template/` tree is rendered and
`{{app_name}}` becomes `doc-intake`:

```text
doc-intake/                          # the FastAPI application
├── src/documentai_api/
│   ├── app.py                       # FastAPI app: upload, status, schemas endpoints
│   ├── main.py                      # uvicorn entry point
│   ├── cli/export_openapi.py
│   ├── config/
│   │   ├── constants.py             # categories, statuses, thresholds, size limits
│   │   └── env.py                   # AWSEnvConfig / AppEnvConfig (pydantic-settings)
│   ├── jobs/
│   │   ├── document_processor/      # S3 input-bucket trigger -> invokes BDA
│   │   └── bda_result_processor/    # S3 output-bucket trigger -> parses BDA results
│   ├── logging/                     # config, formatters, logger, audit, pii, decodelog
│   ├── models/                      # api_responses.py, base.py
│   ├── schemas/document_metadata.py # DynamoDB attribute names
│   ├── services/                    # s3.py, ddb.py, bda.py (boto3 wrappers)
│   └── utils/                       # document_detector, bda_invoker, bda_output_processor, ...
├── tests/                           # largely follows the src/ package layout (plus
│                                    # helpers/), mocking AWS with moto
├── Dockerfile                       # dev + release stages on the uv/python3.14 base
├── docker-compose.yml
├── Makefile
├── local.env.example
├── pyproject.toml
└── uv.lock
docs/doc-intake/                     # api-authentication.md, writing-tests.md,
                                     # accessing-real-aws-resources-from-docker.md,
                                     # diagrams/architecture.mmd, media/architecture.png
.github/workflows/ci-doc-intake.yml  # lint + test, scoped to doc-intake/**
```

Note that the app's docs land in a sibling `docs/doc-intake/` directory, not inside `doc-intake/`.
The repository's `template-only-docs/` (including its `deployment.md`) and top-level files are
template-author material and are **not** copied into your project — read them upstream.

## 4. Run it locally

From the generated app directory (`doc-intake/`):

```bash
make init          # copies local.env.example -> .env (only if .env is absent), then builds the image
make start         # docker compose up --renew-anon-volumes --detach
make run-logs      # start, then follow the logs
```

The API is then at `http://localhost:8000` — but only after one edit: `local.env.example` sets
`HOST=localhost`, `docker-compose.yml` builds the `dev` stage (only the `release` stage sets
`ENV HOST=0.0.0.0`), and `main.py` binds uvicorn to `config.host`, so the containerized server
listens on the container's loopback and the published port cannot reach it. Set `HOST=0.0.0.0` in
`.env` for the Docker path, or run natively with `RUN_CMD_APPROACH=local make start-local`, where
`HOST=localhost` is correct.

`.env` arrives pre-seeded with
`API_AUTH_INSECURE_SHARED_KEY=local-dev-key`, so you can authenticate immediately. The BDA ARNs and
S3 locations in `local.env.example` are placeholders — they keep the first request from failing
`AWSEnvConfig` validation (the config is built lazily inside the `lru_cache`'d `get_aws_config()`,
called from request handling, not at startup), but nothing will actually classify a document until
you point them at a real Bedrock Data Automation project and buckets (see
`docs/doc-intake/accessing-real-aws-resources-from-docker.md` for mounting your AWS credentials).

## 5. Smoke-test it

The public endpoints need no key:

```bash
curl http://localhost:8000/health
curl http://localhost:8000/config
```

`/config` echoes the endpoint map and the supported file types, which makes it the quickest
confirmation that the app booted with its environment intact. Then try an authenticated upload:

```bash
curl -X POST http://localhost:8000/v1/documents \
  -H "API-Key: local-dev-key" \
  -F "file=@/path/to/sample.pdf" \
  -F "category=income"
```

An accepted upload returns `jobId` with `jobStatus: "not_started"` (responses are serialized in
camelCase by `models/base.py`); poll `GET /v1/documents/{job_id}` with the same header for
progress. Against the placeholder AWS settings the request will fail with a 500 once it reaches
AWS — `app.py` writes the DynamoDB tracking record before it uploads to S3, so the DynamoDB call is
the first thing to break. That failure is still informative: it proves authentication and file
validation ran first. A file whose sniffed content type is not PDF, JPEG, PNG, or TIFF is rejected
with a 400 before any AWS call at all.

## 6. Before you commit

Run the same checks CI will:

```bash
make check         # format, lint (ruff + uv lock --check + mypy), test, test-audit
```

The generated `.github/workflows/ci-doc-intake.yml` builds the image and then runs `make format`
and `make lint` in one job and `make test-audit` + `make test-coverage` in another. Audit-logging
tests are excluded from a plain `make test` by `addopts = "-m 'not audit'"`, so run `make check`
rather than `make test` alone.

For the full deploy-beside-a-host-app path, see
[Using and deploying the DocumentAI template](documentai-api-using-the-template.md).
