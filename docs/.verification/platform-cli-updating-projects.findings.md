# Verification findings: platform-cli-updating-projects (round 1)

Source: `.sources/platform-cli` @ `5ed1286af74c16bd0be9132655dbe3b31b4b001b` (matches `source_ref.ref`).

## Verified as supported

- Clean-repo requirement, worktree/stash advice, `--version <your target>` default-to-latest, and
  "update frequently" — `docs/guides/updating.md`, `docs/guides/avoiding-conflicts-on-update.md`.
- `nava-platform infra update .` runs update-base then update-app for each app, committing each
  successful phase — `nava/platform/cli/commands/infra/__init__.py:100-106`,
  `nava/platform/templates/infra_template.py:75-99` (`commit=True` on both phases).
- Bails with guidance on merge conflicts — `infra/__init__.py:120-125`,
  `nava/platform/templates/template.py:246`, `nava/platform/templates/errors.py`.
- `--all` requires `--commit`, and `--commit` defaults to true for `update-app` —
  `nava/platform/cli/commands/infra/update_command.py:71-73`, `infra/__init__.py:163`.
- Without `--all`: single app auto-selected, otherwise a checkbox prompt —
  `infra/update_command.py:79-96`.
- `app update . <APP_NAME>` picks the single non-`template-infra` installed template, else prompts —
  `nava/platform/cli/commands/app.py:92-117`.
- `--force` skips the smart-update algorithm (`_run_copy` instead of `_run_update`) —
  `nava/platform/templates/template.py:177`, help string in
  `nava/platform/cli/commands/common.py:25` ("Ignore smart update algorithm.").

## Findings

### 1. `source_ref.paths` omits the file backing the application-template claim (low)

The doc's application-template behavior ("If the app has exactly one non-`template-infra` template
installed, the CLI uses it; otherwise it prompts you to choose") is implemented only in
`nava/platform/cli/commands/app.py:92-117`, which is not listed in `source_ref.paths`. Likewise the
`--force` help text lives in `nava/platform/cli/commands/common.py:25`. The claims are accurate; the
provenance list is incomplete.

Suggested fix: add `nava/platform/cli/commands/app.py` and `nava/platform/cli/commands/common.py`
to `source_ref.paths`.

---

# Verification findings: platform-cli-updating-projects (round 2)

## Summary

Round 2 identifies that the "When an update goes sideways" section (§ "When an update goes sideways",
lines 113–121) is not present in the source documentation files listed in `source_ref.paths`.

## Findings

### 1. "When an update goes sideways" section unsupported by source documentation (high)

**Issue:** A two-item section providing recovery guidance after update failures is not found in the
source documentation.

**Claim:** Lines 113–121 present recovery guidance:
- "Resolve the merge conflicts, commit, and pick the update back up from where it left off with the
  more granular commands (`infra update-base`, then `infra update-app`)."
- "`--force` re-applies the template without the smart-update algorithm; see [how install and update
  work](./platform-cli-mechanism.md) for what that changes."

**Evidence:**
- `docs/guides/updating.md` (57 lines total) contains "This can often run into merge conflicts that
  need resolved manually. The tool will provide some guidance if this happens" but does not detail
  recovery steps or mention the granular commands as recovery (lines 34–36).
- `docs/guides/avoiding-conflicts-on-update.md` (43 lines total) covers avoidance strategies, not
  recovery; does not mention this section's claims.
- Tool output (`nava/platform/cli/commands/infra/__init__.py:121–125`) suggests running granular
  commands "separately and resolve conflicts as needed", but does not document a "pick up from where
  it left off" recovery pattern or explain `--force` in this context.

**Severity:** high — The entire section originates from sources outside `source_ref.paths`, and the
phrasing "pick the update back up from where it left off" could misguide users into expecting the
commands to resume from a failure point (they do not).

**Suggested fix:**
- Remove the section to align the doc with source-only content, or
- Add `docs/guides/recovering-from-update-failure.md` (or similar) to `source_ref.paths` with
  documented recovery procedure.
