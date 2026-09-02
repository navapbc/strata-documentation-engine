# Verification findings: app-template-using-the-rails-template

Doc: `docs/sources/app-template/using-the-rails-template.md`
Source: `.sources/app-template` (commit 6cc2443)
Round: 2

## Summary

**Round 1 issue resolved.** The prerequisite framing has been corrected to include the Azure
subscription alternative. All claims in the document have been re-verified against the current
source and are fully supported. No additional issues found.

## Round 1 → Round 2 status

**Finding #1 (RESOLVED):** Prerequisite framing omits the Azure alternative.

- Round 1 status: low-severity issue
- Round 2 verification: The document now correctly states "For deployed environments using the
  default configuration: an AWS account with a Cognito User Pool and App Client (the template
  configures authentication via AWS Cognito by default), or an Azure subscription as an
  alternative." This matches the source and addresses the round 1 finding.
- Evidence: `docs/sources/app-template/using-the-rails-template.md` line 42.

## Spot-checks performed in Round 2 (all supported)

- Install/update commands and `<APP_NAME>` flow — `README.md` lines 57-77, 74-76.
- Copier questions `app_name` (regex `^[a-z0-9\-_]+$`) and `app_local_port` (default
  `3000`) — `copier.yml` lines 4-15.
- `_subdirectory: template` — `copier.yml` line 29.
- Copier answers file under `.template-application-rails/` — confirmed at
  `template/.template-application-rails/{{_copier_conf.answers_file}}.jinja`.
- Scaffolded layout (`<APP_NAME>/`, `docs/<APP_NAME>/`,
  `.github/workflows/ci-<APP_NAME>.yml`) — confirmed in source structure.
- Feature list (USWDS, RDS Postgres w/ UUIDs, Active Storage on S3, Action Mailer on SES, Azure
  Postgres via Entra ID, Devise + Cognito, Pundit, i18n, RuboCop, RSpec) — all confirmed in
  `template/{{app_name}}/README.md.jinja` lines 3-17.
- Extension points `app/adapters/`, `app/forms/`, `app/services/` — confirmed in
  `template/{{app_name}}/README.md.jinja` lines 29-47.
- Env vars `AUTH_ADAPTER`, `DB_AUTH_METHOD`, `ENABLE_LOOKBOOK` — all confirmed with correct
  options and defaults in `local.env.example.jinja` and source initializers.
- **NEW in Round 2:** `ENABLE_LOOKBOOK` mount path verified — confirmed in
  `template/{{app_name}}/config/routes.rb` line 12:
  `mount Lookbook::Engine, at: "/lookbook" if ENV["ENABLE_LOOKBOOK"].present?`
- Makefile commands (`init-container`, `init-native`, `start-container`, `start-native`,
  `db-migrate`, `db-seed`, `db-reset`, `test`, `lint`, `rails-generate`) — all confirmed in
  `Makefile.jinja`.
- Database authentication methods and deployment configuration — all confirmed in
  `config/initializers/database_auth.rb` and `template-only-docs/Deployment.md`.

## Findings in Round 2

None. The document is fully supported by the source.
