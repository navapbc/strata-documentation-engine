# Verification findings: platform-cli-overview

- **Doc:** `docs/sources/platform-cli/platform-cli-overview.md`
- **Source checkout:** `.sources/platform-cli`
- **Round:** 1
- **Verdict:** No findings. All claims are fully supported by the source.

## Claims checked and supported

- "Python/Typer program that wraps Copier" — `nava/platform/cli/main.py` line 13 (`typer.Typer()`);
  `nava/platform/templates/template.py` imports `copier.vcs`, `CopierTemplate`, and
  `run_copy`/`run_update` from `nava/platform/copier_worker.py`. Supported.
- uv install / uvx one-off / `uv tool upgrade nava-platform-cli` / `uv tool uninstall nava-platform-cli`
  — `README.md` lines 64–84. Supported.
- uv prerequisite "git 2.27+ and uv 0.5.8+" — `README.md` lines 60–65; `pyproject.toml`
  `[tool.uv] required-version = ">0.5.8"` (line 32). The README uses "0.5.8+" language; the doc
  mirrors that. Supported.
- pipx install + `--fetch-missing-python --python 3.12` — `README.md` lines 99–106. Supported.
- pipx prerequisite "Python 3.11+ (the CLI requires Python 3.11+ per `requires-python = \">=3.11\"`;
  pipx itself only needs Python 3.8+ to run)" — `pyproject.toml` line 13
  (`requires-python = ">=3.11"`); `README.md` line 122 ("pipx requires Python 3.8+ to run
  itself"). Supported.
- Nix install / one-off run — `README.md` lines 135–143. Supported.
- Docker: `make build`, `./bin/docker-wrapper infra install ./my_project_directory`, and
  `docker run --rm -it -v "$(pwd):/project-dir" nava-platform-cli infra install /project-dir` —
  `README.md` lines 173–195. Supported.
- docker-wrapper "makes assumptions about your environment" warning — `README.md` line 183. Supported.
- Quick start `nava-platform infra install ./just-a-test` — `README.md` lines 44–46. Supported.
- Global options `-v/--verbose` (repeatable; enough -v's prints logs to screen), `-q/--quiet`
  (disable all console output) — `nava/platform/cli/main.py` lines 19–30. Supported.
- `--install-completion` / `--show-completion` — Typer-provided options (not disabled via
  `add_completion=False`); also documented in `README.md` lines 222–231. Supported.
- Two command groups `infra` and `app` registered as Typer sub-apps —
  `nava/platform/cli/main.py` lines 72–73 (`app.add_typer(infra.app, name="infra")` and
  `app.add_typer(app_command.app, name="app")`). Supported.
- infra group description ("manage usage of template-infra"; base + reusable app part) —
  `nava/platform/cli/commands/infra/__init__.py` lines 26–32. Supported.
- app group "manage application templates (e.g. template-application-rails)" — help string
  "Manage application templates" in `nava/platform/cli/commands/app.py` line 21;
  `template-application-rails` referenced in `docs/adding-an-app.md` line 26 and
  `docs/getting-started/migrating-from-legacy-template.md` line 157. Supported.

## Findings

None.
