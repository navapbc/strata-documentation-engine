# Verification findings: platform-cli-app-commands (round 1)

Doc: `docs/sources/platform-cli/platform-cli-app-commands.md`
Source: `.sources/platform-cli` @ `57d5d5c6c4626e0bd13ed81b469c91c2533498f0`

## Result

No findings. Every claim in the doc is supported by the source.

Checked and confirmed:

- Three subcommands `install`, `update`, `migrate-from-legacy` — match `nava/platform/cli/commands/app.py`.
- `--commit` shared by all three; help text matches `common.py` (`opt_commit`).
- `--commit` defaults: `install` false (line 37), `update` true (line 76), `migrate_from_legacy` true (line 150). Matches doc.
- `--template-uri` required for `install`, optional for `update` (default None); "local clone accepted" matches `common.py` help.
- `--version` help "branch, tag, commit hash, or 'HEAD'; defaults to the latest tag" matches `opt_version`.
- `--data VARIABLE=VALUE` repeatable — matches `opt_data` and `list[str]` typing.
- `--template-name` present only on `install`/`update`, absent on `migrate_from_legacy` — matches doc's "install and update only".
- `update` auto-lookup logic (exclude `template-infra`, one -> auto, else prompt) matches lines 92-117.
- `--answers-only` / `--force` on `update` — match `opt_answers_only`/`opt_force_update`.
- `migrate-from-legacy` `--origin-template-uri` required, `--legacy-version-file` optional — matches lines 141-160.
- Makefile conflict note and Rails example — match `docs/adding-an-app.md`.
- Legacy version file names and post-migrate README / pull_request_template restoration guidance — match `docs/getting-started/migrating-from-legacy-template.md`.
