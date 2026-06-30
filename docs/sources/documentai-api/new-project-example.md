---
id: documentai-api-new-project-example
title: "Example: scaffolding a new DocumentAI API project"
source: documentai-api
doc_type: example
tags: [documentai, example, copier, nava-platform, scaffold]
related: [documentai-api-using-the-template]
summary: A concrete walk-through of installing the DocumentAI template into a project, the prompts answered, and the resulting project tree.
source_ref:
  repo: https://github.com/navapbc/strata-template-documentai-api
  ref: a8170b5ad1dedf652b65e93949c410a941a1d5e4
  paths:
    - README.md
    - copier.yml
    - template/{{app_name}}/README.md.jinja
    - template/{{app_name}}/Makefile.jinja
    - template/{{app_name}}/local.env.example.jinja
    - template/{{app_name}}/src/documentai_api/cli/export_openapi.py
    - template/{{app_name}}/src/documentai_api/config/env.py
    - template/{{app_name}}/src/documentai_api/logging/audit.py
    - template/{{app_name}}/src/documentai_api/models/api_responses.py
verified: ok
last_documented: 2026-06-29
---

# Example: scaffolding a new DocumentAI API project

This walks through installing the DocumentAI template into a project and what you get back.
Commands are grounded in the upstream `README.md` and `copier.yml`; the variable values are an
illustrative choice for an app named `doc-intake`.

## 1. Install the template

From the root of your project (after
[installing the nava-platform CLI](https://github.com/navapbc/platform-cli)):

```sh
nava-platform app install --template-uri https://github.com/navapbc/strata-template-documentai-api . doc-intake
```

## 2. Answer the prompts

`copier.yml` declares two answerable variables:

| Prompt           | Example answer | Notes |
| ---------------- | -------------- | ----- |
| `app_name`       | `doc-intake`   | Must match `^[a-z0-9\-_]+$` — lowercase letters, digits, dashes, underscores. |
| `app_local_port` | `8000`         | Default is `8000`; the local server binds here. |

(The `_answers_file` override is disabled due to a copier limitation; copier writes its default
answers file (`.copier-answers.yml`) at the project root instead.)

## 3. Resulting project structure

Because `copier.yml` sets `_subdirectory: template`, only the `template/` tree is rendered and
`{{app_name}}` is replaced with `doc-intake`:

```text
doc-intake/                       # the FastAPI application
├── src/documentai_api/
│   ├── app.py                    # FastAPI app + endpoints
│   ├── main.py                   # server entry point
│   ├── cli/                      # export_openapi.py
│   ├── config/
│   │   ├── constants.py          # categories, statuses, thresholds
│   │   └── env.py                # environment settings
│   ├── jobs/                     # document_processor, bda_result_processor
│   ├── logging/                  # audit.py, config.py, decodelog.py, formatters.py, logger.py, pii.py
│   ├── models/                   # api_responses.py, base.py
│   ├── services/                 # s3.py, ddb.py, bda.py
│   ├── schemas/                  # document_metadata.py
│   └── utils/                    # document_detector, bda_invoker, ...
├── tests/
├── docker-compose.yml
├── Dockerfile
├── Makefile
├── pyproject.toml
└── README.md
docs/doc-intake/                  # api-authentication.md, writing-tests.md, diagrams/, media/
.github/workflows/ci-doc-intake.yml
```

Note that `template-only-docs/` (including the upstream `deployment.md`) and the repo's
top-level files are **not** copied into your project — they are template-author docs.

## 4. Run it locally

From the generated app directory (`doc-intake/`), per its `Makefile`:

```bash
make init          # seeds .env from local.env.example (only if .env does not already exist), then builds the Docker image via docker compose build
make start         # starts the service detached
```

The API is then available at `http://localhost:8000`. `make init` seeds `.env` from
`local.env.example`, which includes a working `API_AUTH_INSECURE_SHARED_KEY=local-dev-key`
for sending authenticated requests.

## 5. Smoke-test the API

```bash
curl -X POST http://localhost:8000/v1/documents \
  -H "API-Key: local-dev-key" \
  -F "file=@/path/to/sample.pdf" \
  -F "category=income"
```

A successful async upload returns a `jobId`; poll `GET /v1/documents/{job_id}` for status.
For the full deploy-beside-a-host-app path, see
[Using and deploying the DocumentAI template](documentai-api-using-the-template.md).
