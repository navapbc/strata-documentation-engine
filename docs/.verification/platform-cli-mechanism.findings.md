# Verification findings: platform-cli-mechanism (round 1)

Doc: `docs/sources/platform-cli/platform-cli-mechanism.md`
Source: `.sources/platform-cli` @ `57d5d5c6c4626e0bd13ed81b469c91c2533498f0`

## Result: No findings. Doc is fully supported by the source.

Claims checked and confirmed:

- **Copier wrapper / file exclusions / answers files in `.<TEMPLATE_NAME>/`** — `docs/how-it-works.md` lines 3-7.
- **Install steps 1-5** (clone to temp dir, latest tag by default overridable with `--version`, read `copier.yml`, prompt for unsupplied params, create `.template-foo/bar.yml` with version + answers, copy templated files) — `docs/how-it-works.md` lines 13-28; `templates/template.py` `install()`.
- **Update steps 1-6** (clone, render fresh instance at current version, diff vs actual project, apply latest tag with special file handling, update answers file, re-apply captured diff) — `docs/how-it-works.md` lines 30-47.
- **Version resolution**: `--version` accepts branch/tag/commit/`HEAD`; defaults to latest tag; default path uses latest non-prerelease tag; `HEAD` checks out `origin/HEAD` — `cli/commands/common.py` `opt_version`; `templates/template.py` `_checkout_copier_ref()` lines 289-294.
- **Dirty-repo constraint** and worktree/stash advice — `docs/updating.md` lines 11-19.
- **Commit defaults**:
  - `app install` / `infra install` default `commit=False`; `infra add-app` defaults `commit=True` — `app.py` L37, `infra/__init__.py` L51, L74.
  - `infra update-base`, `infra update-app`, `app update` have `--commit`/`--no-commit` defaulting to commit — `app.py` L76, `infra/__init__.py` L135, L163.
  - `infra update` has no commit toggle and always commits each phase (runs `update-base` then `update-app --all`) — `infra/__init__.py` update() L90-99 (no `commit` param), docstring L100-106; `infra_template.py` `update()` passes `commit=True`.
  - `infra update-app --all` requires `--commit` — `infra/update_command.py` `update_app`: `if all: if not commit: ctx.fail("If using --all, must also specify --commit.")`.
  - `app migrate-from-legacy` defaults commit; `infra migrate-from-legacy` defaults not — `app.py` L150, `infra/__init__.py` L196.
- **`--answers-only` constraints**:
  - Requires at least one `--data`, else `"If 'answers only', must specify some data"` — `templates/template.py` L161-162.
  - `app update`: `--version` + `--answers-only` rejected with `"Can not specify a version and 'answers only'"` — `templates/template.py` L157-158.
  - `infra` update commands drop `--version` when `--answers-only` set — `infra/__init__.py` L115, L147, L179 (`version=version if not answers_only else None`).
- **`--force`**: ignores smart update, re-applies template holistically — `common.py` `opt_force_update`; `templates/template.py` L177.
