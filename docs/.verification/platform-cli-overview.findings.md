# Verification findings: platform-cli-overview

- **Doc:** `docs/sources/platform-cli/platform-cli-overview.md`
- **Source checkout:** `.sources/platform-cli` @ `57d5d5c6c4626e0bd13ed81b469c91c2533498f0`
- **Round:** 1
- **Verdict:** No findings. All claims are fully supported by the source.

## Claims checked and supported

- CLI purpose "simplifies installing, upgrading, and managing Nava Strata", Python/Typer program
  wrapping Copier — `README.md` line 25; `nava/platform/cli/main.py` (`typer.Typer()`). Supported.
- uv install / uvx one-off / `uv tool upgrade` / `uv tool uninstall` — `README.md` lines 63-90.
  Supported.
- uv prerequisites "git 2.27+" and "uv 0.6.15+" — `README.md` lines 60-70. Supported.
- pipx install + `--fetch-missing-python --python 3.12` — `README.md` lines 92-108. Supported.
- pipx prerequisite "Python 3.11+ per `requires-python = \">=3.11\"`; pipx itself requires Python
  3.10+" — `pyproject.toml` (`requires-python = ">=3.11"`); `README.md` note "pipx requires
  Python 3.10+ to run itself". Supported.
- Nix install / one-off run — `README.md` lines 128-146. Supported.
- Docker: `make build`, `./bin/docker-wrapper infra install ./my_project_directory`, and
  `docker run --rm -it -v "$(pwd):/project-dir" nava-platform-cli infra install /project-dir`,
  plus the docker-wrapper "makes assumptions about your environment" caveat — `README.md`
  lines 148-192. Supported.
- Quick start `nava-platform infra install ./just-a-test` — `README.md` lines 42-46. Supported.
- Global options `-v/--verbose` (repeatable; enough -v's prints logs to screen), `-q/--quiet`
  (disable all console output) — `nava/platform/cli/main.py` callback. Supported.
- `--install-completion` / `--show-completion` — Typer default options, not disabled via
  `add_completion=False` in `main.py`. Supported.
- Two command groups `infra` and `app` registered as Typer sub-apps —
  `nava/platform/cli/main.py` (`app.add_typer(infra.app, name="infra")`,
  `app.add_typer(app_command.app, name="app")`). Supported.
- infra group description (manage template-infra usage; base + reusable app part) — Typer help
  string in `nava/platform/cli/commands/infra/__init__.py`. Supported.
- app group "manage application templates (e.g. template-application-rails)" — help string
  "Manage application templates" in `nava/platform/cli/commands/app.py`. Supported.

## Findings

None.
