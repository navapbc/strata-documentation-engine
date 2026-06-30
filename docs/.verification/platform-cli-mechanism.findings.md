# Verification findings for platform-cli-mechanism (round 2)

No inaccuracies found. All major claims verified against source:

- Install process (steps 1-5) matches `docs/how-it-works.md`
- Update process (3-way diff algorithm, steps 1-6) matches `docs/how-it-works.md` and `nava/platform/templates/template.py`
- Version resolution (defaults to latest **non-prerelease** tag, `--version` accepts branch/tag/hash/HEAD) verified in `template.py` line 290 (`use_prereleases=False`)
- Dirty-repo constraint verified in `docs/updating.md`
- Commit behavior defaults verified in `nava/platform/cli/commands/infra/__init__.py` and `nava/platform/cli/commands/app.py`
- `--answers-only` constraints (requires `--data`, rejects simultaneous `--version` for app, drops `--version` for infra) verified in `template.py` lines 157-158 and command files
- `--force` flag (uses `_run_copy` instead of `_run_update`) verified in `template.py` line 177

**Document verified: ok**
