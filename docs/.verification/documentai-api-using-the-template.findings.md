# Verification findings: documentai-api-using-the-template (round 2)

Source: `.sources/documentai-api` @ `7c7f30c78f26f4d3708539b30cfb7acfd2ec2e7b` (matches `source_ref.ref`).

## Summary

**Status**: FULLY VERIFIED. No inaccuracies found.

All claims have been re-verified against the source code and are accurate:

- Install/update commands match `README.md` "Installation"/"Updates".
- `copier.yml`: exactly two answerable vars (`app_name` regex `^[a-z0-9\-_]+$`, `app_local_port` int default 8000), `_subdirectory: template`.
- `pyproject.toml`: Python >=3.12, FastAPI + uvicorn + boto3 + pypdf + pdf2image + opencv-python-headless + python-magic + typer; four `[project.scripts]` entry points and descriptions.
- `Makefile.jinja` targets (`init`, `start`, `run-logs`, `init-local`, `start-local`, `check`, `test`, `lint`, `format`, `openapi-spec`) and `RUN_CMD_APPROACH=local` native-vs-Docker switch; `setup-env` copies `local.env.example.jinja` -> `.env`.
- `local.env.example.jinja` seeded values incl. `API_AUTH_INSECURE_SHARED_KEY=local-dev-key`, BDA ARNs/region, table name, input/output S3 locations.
- Auth: `API-Key` header in `APIConfig.AUTH_KEY_HEADER_NAME` (constants.py), shared-key check in `app.py` (`verify_api_key`); `api-authentication.md` correctly marks scheme as not suitable for production multi-user systems.
- API endpoints: `POST /v1/documents` (async default, `wait=true` for sync, `timeout=180`), `GET /v1/documents/{job_id}` with `include_extracted_data`, `GET /v1/schemas`, `GET /v1/schemas/{document_type}`; `/health` and `/config` public. curl examples accurate.
- Docker-based development: `make init` + `docker compose build`, `make start` with `--renew-anon-volumes --detach`, `make run-logs`.
- Native development: `make init-local` + `uv sync --all-extras --frozen`, `RUN_CMD_APPROACH=local`, `make start-local` (runs `uv run --frozen documentai_api`).
- Sidecar deployment steps 1-7 all match `template-only-docs/deployment.md`: has_database/enable_document_data_extraction flags, file_upload_jobs wiring to DDE input/output buckets, DynamoDB+GSI+KMS+IAM in documentai_api.tf, aws_services, DDE_* env aliasing, generated secret, custom domains/HTTPS.
- `AWSEnvConfig` env-var names in `config/env.py` match all seven listed: `BDA_PROJECT_ARN`, `BDA_PROFILE_ARN`, `BDA_REGION`, `DOCUMENTAI_DOCUMENT_METADATA_TABLE_NAME`, `DOCUMENTAI_DOCUMENT_METADATA_JOB_ID_INDEX_NAME`, `DOCUMENTAI_INPUT_LOCATION`, `DOCUMENTAI_OUTPUT_LOCATION`.
- CI workflow path correctly stated as `template/.github/workflows/ci-{{app_name}}.yml.jinja` (Round 1 issue resolved).
- Template docs exist: `api-authentication.md`, `writing-tests.md.jinja`, `accessing-real-aws-resources-from-docker.md`, architecture diagram.

## Findings

None. Document is fully supported by source code.
