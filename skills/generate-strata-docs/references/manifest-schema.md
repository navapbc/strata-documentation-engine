# Manifest schema (`sources.md`)

`sources.md` contains one markdown table. Columns, in order:

| Column | Required | Meaning |
|--------|----------|---------|
| `id` | yes | Unique kebab-case identifier for the source |
| `type` | yes | Must have a matching `references/profiles/<type>.md` (e.g. `sdk`, `sdk-typescript`, `rails-template`, `example-app`, `infra-template`, `platform-cli`) |
| `repo` | yes | Git URL (`https://` or `git@`) |
| `ref` | yes | Branch, tag, or SHA — pin a tag/SHA for reproducible runs |
| `subpaths` | no | Space-separated globs scoping what gets documented; empty = whole repo |
| `notes` | no | Free text |

Validated by `python -m scripts.lint_manifest`. Add a new source type by adding a
`references/profiles/<type>.md` file, then rows of that type.
