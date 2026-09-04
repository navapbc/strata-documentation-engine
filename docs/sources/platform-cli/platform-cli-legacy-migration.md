---
id: platform-cli-legacy-migration
title: Migrating a legacy-template project to the CLI
source: platform-cli
doc_type: guide
tags: [platform-cli, migration, legacy-template, template-infra, application-template]
related: [platform-cli-overview, platform-cli-mechanism, platform-cli-infra-commands, platform-cli-app-commands, platform-cli-updating-projects]
manages: [template-infra, template-application-rails, template-application-nextjs, template-application-flask]
summary: How to convert a project that tracked template versions in legacy .<TEMPLATE_NAME>-version files into the CLI's answers-file format, and then bring it up to a current template version.
source_ref:
  repo: https://github.com/navapbc/platform-cli
  ref: 5ed1286af74c16bd0be9132655dbe3b31b4b001b
  paths:
    - docs/guides/migrating-from-legacy-template.md
    - nava/platform/cli/commands/infra/migrate_from_legacy_command.py
    - nava/platform/cli/commands/infra/info_command.py
    - nava/platform/projects/migrate_from_legacy_template.py
    - nava/platform/projects/infra_project.py
    - nava/platform/cli/commands/app.py
last_documented: 2026-09-04
verified: ok
---

# Migrating a legacy-template project to the CLI

Older templates stored the installed version in a `.<TEMPLATE_NAME>-version`
file at the project root. Templates that moved to the CLI track that information
differently, so before using the CLI you have to convert the old file into the
new format. The CLI ships commands for exactly that; which steps you need
depends on which templates your project has installed.

## template-infra

The switch to the CLI happened in `template-infra` **v0.15.0**. A project on an
earlier version needs migrating.

### Find out where you are

From the project root:

```sh
nava-platform infra info --template-uri gh:navapbc/template-infra .
```

Look at the **Closest upstream version** value. If it reads "Unknown", reach out
to the Platform team for guidance. If it is pre-`v0.12.0`, consider approaching
the update in smaller steps rather than jumping straight to `v0.15.0` (see
below).

Read the
[template-infra release notes](https://github.com/navapbc/template-infra/releases)
for every version between your current one and your target. Migrating with the
CLI updates the *code*; it does not remove the need to apply state changes or
manual migration steps described in those notes.

### Migrate to the latest version

Transform the old `.template-version` file into the new format:

```sh
nava-platform infra migrate-from-legacy --commit .
```

This writes a `.template-infra/` directory containing a `base.yml` and one
`app-<APP_NAME>.yml` per application it detected under `infra/`, then removes
the legacy file. Check that the `app-<APP_NAME>.yml` files all correspond to
real applications; delete any that do not and amend the commit. (Where
`terraform` is available and the project has an `infra/project-config`, the
command also seeds base answers such as the project name, owner, repository URL,
and default region from that config's Terraform outputs.)

Your project is now in a state the CLI understands. Perform the actual template
update:

```sh
nava-platform infra update .
```

This attempts the base template and then each app in sequence, and will likely
bail after the base with a message to fix merge conflicts manually and run the
update in parts. Fix the conflicts, commit, then pick the update back up:

```sh
nava-platform infra update-app --all .
```

Expect merge conflicts per app as well: resolve, commit, move to the next, until
all apps are done. See
[updating a project](./platform-cli-updating-projects.md) for the general update
workflow.

### Migrate in smaller steps

Same shape as above, one hop at a time:

1. Run `migrate-from-legacy` as described, to get into the CLI ecosystem.
2. Pick the `template-infra` version you want next and update to its migration
   tag:

    ```sh
    nava-platform infra update --version platform-cli-migration/v0.x.x .
    ```

3. Follow the same update guidance (conflicts, commits, `update-app --all`).
4. Repeat steps 2–3, jumping versions as you see fit, until you reach
   `v0.15.0`.
5. From `v0.15.0`, run a final update to the latest release (or a specific
   post-`v0.15.0` target):

    ```sh
    nava-platform infra update [--version vA.B.C] .
    ```

The `platform-cli-migration/` tags exist because the migration needs a template
commit the CLI can anchor to. `migrate-from-legacy` resolves your recorded
legacy version to the closest such tag, warning you when it has to fall back to
a slightly older one because there is no exact match.

### Version callouts

No substitute for the release notes, but a few things to weigh when choosing a
target if you are well behind:

- A Feature Flags module (backed by AWS Evidently) was added in v0.5.0 and
  removed in v0.13.0. Coming from pre-v0.5.0 you can delete it as you pass
  v0.5.0, or leave it alone and let it be cleaned up once you are past v0.13.0.
- v0.9.0 moved account mapping into each environment config file; v0.11.0 then
  removed it from there and moved it to the network config. From pre-v0.9.0,
  consider jumping to v0.11.x+ so you only move it once.
- v0.11.0 starts pinning a specific Terraform version in CI/CD.
- v0.10.0 carries DB changes: PostgreSQL 16.2 and the DB schema name hardcoded
  to `app`.
- v0.9.0 requires Terraform 1.8.x (previously roughly >=1.4) and changes how
  secrets are defined.
- v0.7.0 needs a minor state migration.
- v0.6.0 has networking changes that likely require hours of downtime to apply.

### Post-migration

To see what a more holistic re-application of your target version would produce:

```sh
nava-platform infra update --force [--version vA.B.C] .
```

This discards some of the "smart" logic of a regular update and can catch things
missed while the update was trying to be clever.

## Application templates

Application templates were historically less standardized, so you supply more
information yourself — check `nava-platform app migrate-from-legacy --help`:

```sh
nava-platform app migrate-from-legacy --origin-template-uri <TEMPLATE_URI> --legacy-version-file <OLD_VERSION_FILE> . <APP_NAME>
```

`<OLD_VERSION_FILE>` will likely be one of `.template-flask-version`,
`.template-nextjs-version`, or `.template-application-rails-version`, though
your project may have renamed it. Then run:

```sh
nava-platform app update . <APP_NAME>
```

**Review the changes.** You may need to restore project-root files such as
`README.md` and `.github/pull_request_template.md`, a consequence of how the
underlying update runs against the initial migration; it should not recur once
you are on an updated template. Restore them from the current remote `main`:

```sh
git checkout origin/main -- README.md .github/pull_request_template.md
```

Template-specific follow-ups after the migrate-plus-initial-update. These files
are fetched from `template-infra`'s `main` branch, not from the template version
your project is pinned to.

For `template-application-flask`, you may want to restore `.dockleconfig` and
`.hadolint.yaml`:

```sh
curl -O https://raw.githubusercontent.com/navapbc/template-infra/refs/heads/main/.dockleconfig
curl -O https://raw.githubusercontent.com/navapbc/template-infra/refs/heads/main/.hadolint.yaml
```

For `template-application-nextjs`, you may want to restore `.grype.yml`:

```sh
curl -O https://raw.githubusercontent.com/navapbc/template-infra/refs/heads/main/.grype.yml
```

## Brute-force fallback

If the smarter migration is failing and you understand how your project deviates
from upstream, you can force the new version of the template onto the existing
project:

```sh
nava-platform infra install .
```

You will be prompted to overwrite conflicting files, which you probably want to
do. Files that moved in the new version leave old copies behind for you to clean
up manually; then check the git diff, adjust, and commit.

With multiple applications, force the install for a single app first by adding
`--data app_name=<APP_NAME>` to `infra install`, then bring in the others one at
a time:

```sh
nava-platform infra add-app . <APP_NAME>
```

and, if you also want to force an application-template version (`app install`
always needs an explicit `--template-uri`):

```sh
nava-platform app install --template-uri <TEMPLATE_URI> . <APP_NAME>
```
