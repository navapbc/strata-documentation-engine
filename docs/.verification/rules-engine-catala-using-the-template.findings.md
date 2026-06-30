# Verification findings: rules-engine-catala-using-the-template.md (Round 2)

Generated: 2026-06-29

## Summary

Verified the document `docs/sources/strata-template-rules-engine-catala/using-the-template.md` against the source checkout at `.sources/strata-template-rules-engine-catala`. All major claims checked and found to be accurate.

## Verified Claims

- ✅ Prerequisites section: Correctly lists nava-platform CLI, Python 3.13+, poetry, and Docker-compatible runtime
- ✅ Installation command matches README.md exactly
- ✅ Testing template changes section matches README.md "Testing Template Changes"
- ✅ Template variables: `copier.yml` defines exactly `app_name` and `app_local_port` (default 3001)
- ✅ `_subdirectory: template` correctly excludes template-author files
- ✅ Project scaffolding structure: Accurately describes catala/, src/, tests/, docs/, .github/workflows/ organization
- ✅ Application stack: Verified FastAPI, uvicorn, pydantic/pydantic-settings, gmpy2, python-dateutil in pyproject.toml
- ✅ Dev tools: mypy, ruff, pytest/pytest-watch, coverage, httpx all present
- ✅ Dockerfile is multi-stage (base → dev / release) with start-server entry point in release stage
- ✅ Catala compilation: `make catala-build` runs `clerk build` and copies outputs to src/generated/
- ✅ dates.py workaround for Catala issue #981 documented in Makefile.jinja
- ✅ Running locally: make init start, make run-logs, make stop commands all present
- ✅ API docs at localhost:{{app_local_port}}/docs confirmed in template getting-started.md.jinja
- ✅ PY_RUN_APPROACH environment variable correctly controls docker vs. local execution
- ✅ local.env variables: ENVIRONMENT=local, PORT={{app_local_port}} documented
- ✅ Module system: discover_routers() in src/modules/__init__.py implements auto-discovery as described
- ✅ DISABLED_MODULES environment variable: Supported, parsed as comma-separated list of module names
- ✅ Module loading: Sorted by name, skips any short name in DISABLED_MODULES set
- ✅ Adding new rule flow: Matches adding-modules.md and writing-rules-in-catala.md
- ✅ CI workflow jobs: Lint, Test, Catala Tests all present in ci-{{app_name}}.yml.jinja
- ✅ Lint job runs: make format-check, make lint
- ✅ Test job runs: make build, make test-coverage
- ✅ Catala Tests job uses: registry.gitlab.inria.fr/catala/ci-images:latest-python
- ✅ Deployment references template-infra as expected
- ✅ Release Docker target runs start-server by default

## Notable Verifications

1. **Port binding**: The docker-compose.yml correctly maps `{{ app_local_port }}:{{ app_local_port }}` and local.env.jinja sets `PORT={{ app_local_port }}`, so the doc's claim about localhost:{{app_local_port}}/docs is accurate.

2. **Module auto-discovery**: The discover_routers() function in src/modules/__init__.py uses `sorted(pkgutil.iter_modules(...), key=lambda m: m.name)` to load modules in sorted order, confirming doc's statement.

3. **Ruff/mypy exclusions**: Both are configured to exclude `src/generated/**` in pyproject.toml, as doc states.

4. **Coverage exclusion**: pyproject.toml's [tool.coverage.run] omits `src/generated/*.py`, matching doc.

5. **CI workflow triggers**: Workflow triggers on PRs and pushes to main that touch `{{app_name}}/**` or the workflow file, as doc states.

6. **Python requirement**: pyproject.toml requires `~=3.13` (Python 3.13+), matching doc prerequisites.

## Conclusion

No inaccuracies found. The document is fully supported by the source checkout.
