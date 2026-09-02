# Verification findings: documentai-api-new-project-example (round 2)

Doc: `docs/sources/documentai-api/new-project-example.md`
Source: `.sources/documentai-api` @ `7c7f30c78f26f4d3708539b30cfb7acfd2ec2e7b`

## Summary

All claims in the doc are accurate and fully supported by the source. Round 1 finding has been resolved.

Verified accurate:

- Install command matches upstream `README.md` install section.
- `copier.yml` declares exactly two answerable variables (`app_name`, `app_local_port`);
  the `app_name` regex `^[a-z0-9\-_]+$` and `app_local_port` default `8000` are correct.
- `_subdirectory: template` and the `_answers_file` disablement comment are accurate.
- `make init` -> `setup-env` (`@test -f .env || cp local.env.example .env`) then
  `docker compose build`; `make start` -> `docker compose up --renew-anon-volumes --detach`.
  Matches `Makefile.jinja`.
- `local.env.example.jinja` sets `API_AUTH_INSECURE_SHARED_KEY=local-dev-key` and
  `PORT={{ app_local_port }}` (default 8000); localhost:8000 is correct.
- Smoke-test: `POST /v1/documents`, `API-Key` header (`APIConfig.AUTH_KEY_HEADER_NAME`),
  `category=income` (valid `DocumentCategory.INCOME`), async returns `jobId`
  (camelCase alias of `job_id` via `BaseApiResponse`), poll `GET /v1/documents/{job_id}`.
  All confirmed in `app.py`, `constants.py`, `api_responses.py`, `base.py`.
- src tree (config, jobs, logging, models, services, schemas, utils, cli, app.py, main.py)
  matches the actual source layout.
- docs/ subtree (line 78): now correctly lists all rendered files including
  `accessing-real-aws-resources-from-docker.md`, `api-authentication.md`,
  `writing-tests.md`, `diagrams/`, and `media/`. Matches actual template structure.

## Findings

None. The document is fully verified and all claims are supported by the source.
