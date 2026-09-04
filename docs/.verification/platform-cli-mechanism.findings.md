# Verification Findings: platform-cli-mechanism.md (Round 2)

**Document**: docs/sources/platform-cli/platform-cli-mechanism.md  
**Verified Against**: .sources/platform-cli (commit 5ed1286af74c16bd0be9132655dbe3b31b4b001b)  
**Date**: 2026-09-04

## Summary

This document has been thoroughly verified against the platform-cli source code. All major claims about install, update, answers files, version resolution, commit behavior, and smart-update flags have been validated against the actual implementation.

## Verification Results

### Install Section ✓
- **Claim**: "By default the **latest tagged version** in the repository is checked out (prereleases excluded)"
- **Source**: template.py:290 - `copier.vcs.checkout_latest_tag(copier_git.dir, use_prereleases=False)`
- **Status**: ACCURATE

- **Claim**: ".template-foo/ directory is created at the top level of the project with a `bar.yml` inside, recording the template version used and the answers"
- **Source**: state.py:16-26, template.py:112
- **Status**: ACCURATE

### Update Section ✓
- **Claim**: "3-way update process" with current version rendering, diff capture, and re-application
- **Source**: Copier's standard update algorithm (run_update in copier_worker.py)
- **Status**: ACCURATE (documented correctly per Copier's mechanism)

- **Claim**: "`Already up to date (<version>)` message when version matches"
- **Source**: template.py:172 - `f"Already up to date ({existing_version.display_str})"`
- **Status**: ACCURATE

### Answers Files and Project State ✓
- **Claim**: "`.template-infra/base.yml` plus one `.template-infra/app-<APP_NAME>.yml` per app"
- **Source**: template_name.py:61-75, state.py:20-26
- **Status**: ACCURATE
  - For template-infra:base + app_name="base" → base.yml (is_singular_instance=True)
  - For template-infra:app + app_name="foo" → app-foo.yml (is_singular_instance=False, prefix="app-")

- **Claim**: "Pre-render source exclusions" with base excluding `*{{app_name}}*`, app excluding everything except those paths and `.template-infra/`
- **Source**: infra_template.py:22-40, template.py:25
- **Status**: ACCURATE
  - Base: `["*template-only*", "*{{app_name}}*"]`
  - App: `["*template-only*", "*", "!*{{app_name}}*", "!/.template-infra/"]`

### Version Resolution ✓
- **Claim**: "`--version` accepts branch, tag, commit hash, or `HEAD`; defaults to latest non-prerelease tag; `HEAD` resolves to `origin/HEAD`"
- **Source**: template.py:289-294
- **Status**: ACCURATE

### Dirty-Repo Constraint ✓
- **Claim**: "You cannot update a project repo that is 'dirty' — one with untracked files or pending changes"
- **Source**: docs/guides/updating.md (documented as constraint), Copier's DirtyLocalWarning
- **Status**: DOCUMENTED CORRECTLY
  - Note: This is a Copier constraint/behavior, not explicitly enforced by platform-cli code
  - Documentation correctly provides workarounds (git worktree, stash, clean clone)

### Commit Behavior ✓
- **Claim**: Install defaults to not committing; infra add-app defaults to committing
- **Source**: app.py:37, infra/__init__.py:51, infra/__init__.py:74
- **Status**: ACCURATE
  - app install: commit=False
  - infra install: commit=False
  - infra add-app: commit=True

- **Claim**: Update commands default to committing; infra update always commits and has no toggle
- **Source**: app.py:76, infra/__init__.py:135, infra/__init__.py:163, infra/__init__.py:91-99, infra_template.py:75-99
- **Status**: ACCURATE
  - app update: commit=True (toggle available)
  - infra update-base: commit=True (toggle available)
  - infra update-app: commit=True (toggle available)
  - infra update: no commit parameter (always commits each phase)

- **Claim**: Commit message format with app name prefix only when not singular instance
- **Source**: template.py:225-241
- **Status**: ACCURATE

### Smart-Update Flags ✓
- **Claim**: "`--answers-only` requires at least one `--data` value"
- **Source**: template.py:161-162 - `"If 'answers only', must specify some data"`
- **Status**: ACCURATE

- **Claim**: "app update rejects `--version` with `--answers-only` with error; infra update commands drop version"
- **Source**: 
  - template.py:157-158 - raises error "Can not specify a version and 'answers only'"
  - infra/__init__.py:115, 147, 177 - `version=version if not answers_only else None`
- **Status**: ACCURATE

- **Claim**: "infra update-app --all cannot be combined with --no-commit"
- **Source**: update_command.py:72-73 - `"If using --all, must also specify --commit."`
- **Status**: ACCURATE

- **Claim**: "`--force` ignore smart update algorithm and do plain overwriting copy"
- **Source**: template.py:177 - `update_func = self._run_update if not force else self._run_copy`
- **Status**: ACCURATE

### Migrate Commands ✓
- **Claim**: "app migrate-from-legacy defaults to committing; infra migrate-from-legacy defaults to not committing"
- **Source**: app.py:150 (commit=True), infra/__init__.py:196 (commit=False)
- **Status**: ACCURATE

## Conclusion

All verifiable claims in the documentation have been validated against the platform-cli source code. The document accurately describes:
- Template installation and version selection behavior
- Update algorithm and 3-way merge process
- Answers file storage and naming conventions
- Version resolution with `--version` flag
- Commit behavior and message formatting
- Smart-update flag constraints
- The multi-instance template design for template-infra

**Verification Status**: ✅ **VERIFIED - NO FINDINGS**

No inaccuracies or unsupported claims were identified during this verification.
