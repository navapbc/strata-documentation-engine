# Profile: platform-cli

The source is the **`nava-platform` CLI** (`platform-cli`) — a Python/Typer tool that wraps
Copier to install and update the Nava Platform templates. **Distill its MkDocs `docs/` tree** as
the primary source: `how-it-works.md`, `updating.md`, `adding-an-app.md`,
`avoiding-conflicts-on-update.md`. Read the Typer command modules under
`nava/platform/cli/commands/` to distill an accurate command reference from their help/docstrings.

Produce docs under `docs/sources/<source-id>/`:

- One `doc_type: guide` "nava-platform overview" — what the CLI is, installation (uv / pipx / Nix /
  Docker), and the two command groups. Set **`component_keys: [platform-cli]`** on this doc.
- One or more `doc_type: guide` command references for the `infra` group (`install`, `update`,
  `update-base`, `update-app`, `add-app`, `info`, `migrate-from-legacy`) and the `app` group
  (`install`, `update`, `migrate-from-legacy`). On the docs that install/update a template, set
  **`manages: [template-infra]`** and/or **`manages: [template-application-rails]`** accordingly.
- One `doc_type: guide` on the install/update mechanism: Copier wrapper, clones the template at
  its **latest git tag** by default (overridable with `--version`), the `.template-*/<app>.yml`
  answers files, the 3-way update, and the dirty-repo constraint.

Ground every command and flag in the source (the `docs/` page or the Typer command module). Cite
those paths in `source_ref.paths`. Use stable kebab ids like `platform-cli-<topic>`.
