# Verification findings: infra-azure-set-up-account-and-network (round 1)

Doc: `docs/sources/template-infra-azure/infra-set-up-account-and-network.md`
Source: `.sources/template-infra-azure`

## Result: no findings

All material claims in the doc are supported by the source:

- Tooling section (Terraform via tfenv `tfenv install 1.4.6`, Azure CLI `brew install azure-cli`,
  Go for Terratest, GitHub CLI `brew install gh`, jq, optional linters via `make infra-lint`) matches
  `docs/infra/set-up-infrastructure-tools.md`.
- Azure auth guidance (single `az login`; `AZURE_TENANT_ID` per project with direnv; `AZURE_CONFIG_DIR`
  for multiple clouds) matches the same file.
- Account/subscription interchangeability and the three setup actions (Terraform backend, GitHub OIDC
  in Entra with admin roles, ACR for shared account) match `docs/infra/set-up-azure-account.md`.
- Prerequisite to set `shared_account_name` in `infra/project-config/networks.tf` (confirmed:
  `networks.tf` line 3 `shared_account_name = "lowers"`) and the "only the initial creator can run the
  first update" note match the source.
- Steps 1-5 (`az account show`/`az account list`; `make infra-set-up-account ACCOUNT_NAME=...` with
  optional `args="<SUBSCRIPTION_ID>"`; the `[account name].[account id].azurerm.tfbackend` output;
  `terraform -chdir=infra/accounts output github_oidc`; `github_actions_azure_config` / `infra_admins`
  config; admin-consent via portal or `az ad app permission admin-consent --id <app id>`; the
  commented `azuread_app_role_assignment` block) all match `set-up-azure-account.md` and the source code
  (`infra/modules/auth-github-actions/main.tf` line 41 — block is commented out).
- Account root-module resources called out in the doc (subscription Resource Group, `subscription-logs`
  Log Analytics Workspace, terraform-backend module, `auth_github_actions` module, certificate store)
  all appear in `infra/accounts/main.tf`.
- `make infra-update-current-account` confirmed in the Makefile.
- GitHub setup (`./bin/set-up-github`, GitHub CLI as the only strict dependency, repo + admin rights)
  matches `docs/infra/set-up-github.md`.
- Network section (VNet; public/private/database subnets; private DNS zones for private endpoints;
  shared Container App Environment; `has_database` and `network_name` in app-config; default subnet
  set gateway/private-endpoints/database/apps-private with the documented delegations and
  `outbound_peer_cidrs`/`internet_access`; the alternative non-production setup; `make
  infra-configure-network` then `make infra-update-network`; update-network-before-downstream note)
  matches `docs/infra/set-up-network.md`.

## Notes (not findings)

- The doc refers to project config as `infra/project-config/main.tf`; in the repo the tracked file is
  the template `main.tf.jinja` (rendered to `main.tf` on install). This matches how the source docs
  themselves refer to it (`/infra/project-config/main.tf`), so it is faithful to the source.
- The doc links both "custom domains" and "HTTPS support" to `infra-azure-domains-and-https.md`,
  whereas the source separates them into `set-up-custom-domains.md` and `https-support.md`. This is an
  internal doc-graph consolidation, not a contradiction of the source content.
