# Verification Findings: platform-cli-infra-commands.md (Round 2)

## Summary
Found 1 inaccuracy and 2 unverifiable claims in the documentation.

---

## Finding 1: Missing --commit option for add-app command

**Claim (line 67-68):**
```
nava-platform infra add-app [--commit] [--template-uri URI] [--data K=V] PROJECT_DIR APP_NAME
```
The syntax shows `[--commit]` as a documented option.

**Issue:**
The source code for `add_app()` in `add_app_command.py` defines `commit: bool = False`, and the typer command in `infra/__init__.py` (line 74) shows `commit: Annotated[bool, opt_commit] = True`. However, the command signature at line 68 in `infra/__init__.py` line 67-75 does NOT include `--commit` in the typer decorator parameters — it's only passed as a default value. The `opt_commit` helper is defined in common.py but NOT applied to the add_app command's options via typer.Option annotation.

**Evidence:**
- `nava/platform/cli/commands/infra/__init__.py`, lines 67-75: The `add_app` function parameter is annotated with `opt_commit`, but examining the actual help system, the `--commit` flag defaults to True and is derived from the parameter default, not explicitly documented as a CLI option.
- `nava/platform/cli/commands/common.py`, line 21: `opt_commit` is defined as a `typer.Option`.

Actually, reviewing more carefully: the code DOES include `opt_commit` in the annotation (line 74), so `--commit` IS available. The doc is CORRECT on this point.

**Severity:** N/A - Retract this finding; the code does support the option.

---

## Finding 2: infra update --commit behavior is misleading

**Claim (line 77-83):**
```
Updates base and application infrastructure. This effectively runs `update-base`
followed by `update-app --all`, automatically committing each successful phase.
If merge conflicts occur it fails with guidance to run `update-base` and
`update-app` separately and resolve conflicts manually.
```

**Issue:**
The documentation states that `update` "automatically commits each successful phase," but the source code shows that `update` does NOT have a `--commit` parameter at all (infra/__init__.py lines 90-99). The command's logic in `update_command.py` (line 27) calls `template.update()` which internally handles committing, but there's no user-facing `--commit` option like there is for `update-base` and `update-app`. The statement "automatically committing each successful phase" is accurate, but the way it's presented alongside other commands that have optional `--commit` flags is potentially confusing. However, the statement is technically correct.

**Severity:** LOW - The statement is accurate but potentially confusing when read in context of surrounding sections.

Actually, reviewing the code more carefully: `update_command.update()` does NOT expose any commit control. The comment in the typer command docstring (line 104-105) says "This automatically commits each phase of the update that is successful to save progress. You can merge all these commits together after if you would like." This confirms the behavior, so the documentation is accurate.

**Retract:** The documentation is correct.

---

## Finding 3: --answers-only description in common.py

**Claim (doc line 46):**
```
--answers-only — update the answers file without changing the version.
```

**Issue:**
The source code in `common.py` line 23 defines:
```python
opt_answers_only = typer.Option(help="Do not change the version.")
```

The help text says "Do not change the version" but the documentation says "update the answers file without changing the version". These are subtly different:
- "Do not change the version" is more vague
- "Update the answers file without changing the version" is more specific

The actual behavior in `update_command.py` (lines 115-116 and 147-148) shows that when `answers_only=True`, the `version` parameter is explicitly set to `None`, which prevents the template update logic from changing versions. So the documented description is more accurate and explanatory than the help text, but they describe the same behavior. This is not an inaccuracy.

**Retract:** The documentation is accurate and more precise than the source help text.

---

## Finding 4: Verify --version default claim

**Claim (line 42):**
```
--version — branch, tag, commit hash, or `HEAD`; defaults to the latest tag.
```

**Issue:**
In `common.py` line 7-9:
```python
opt_version = typer.Option(
    help="Template version to install. Can be a branch, tag, commit hash, or 'HEAD' (for latest commit). Defaults to the latest tag version.",
)
```

The help text says "Defaults to the latest tag version" which matches the documentation claim. However, in `infra/__init__.py`:
- Line 49: `DEFAULT_VERSION: str | None = None` (for install)
- Line 95 & 133 & 161: `DEFAULT_VERSION: str | None = None` (for update, update-base, update-app)

The actual default is `None`, not "the latest tag". The latest tag default is applied at the template layer, not the CLI layer. The documentation is describing the behavior, not the literal default value, which is accurate.

**Retract:** The documentation is correct about the ultimate behavior.

---

## Finding 5: Verify update-app --all constraints

**Claim (lines 102-106):**
```
- `--all` attempts to update every known app; it requires `--commit` and you may
  not also pass app-name arguments.
- Without `--all`: if exactly one app exists it is updated automatically; if
  several exist and none are named, you are prompted to choose; named apps that
  do not exist in the project produce an error.
```

**Verification:**
In `update_command.py` lines 71-76:
```python
if all:
    if not commit:
        ctx.fail("If using --all, must also specify --commit.")

    if app_names:
        ctx.fail("If using --all, don't specify app names as arguments")
```

This confirms the `--all` claim is ACCURATE.

Lines 80-102 show the behavior for non-`--all` case, confirming:
- Single app auto-updates (line 81-83)
- Multiple apps prompt user (lines 85-96)
- Named apps that don't exist produce an error (lines 97-102)

**Retract:** The documentation is accurate.

---

## FINAL RESULT: No findings

After thorough verification of all major claims in the document against the source code:

1. All command signatures are correct
2. All default values are correct
3. All behavioral descriptions match the source code
4. The description of constraints and error handling is accurate
5. The option documentation is consistent with source code

The document is fully supported by the source code. No corrections needed.
