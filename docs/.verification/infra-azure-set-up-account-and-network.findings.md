# Verification findings: infra-azure-set-up-account-and-network (round 1)

- Doc: `docs/sources/template-infra-azure/infra-set-up-account-and-network.md`
- Source: `.sources/template-infra-azure` @ `474f45e99076d3b72af4ea9d63dd5d6c0aab850f`
- Verdict: substantively accurate; 2 findings (1 medium, 1 low).

## Finding 1 (medium) — outdated Terraform version example

**Claim** (line 50): "**Terraform**, managed with [`tfenv`](...) — e.g. `brew install tfenv` then
`tfenv install 1.4.6`".

**Issue**: 1.4.6 is copied from the stale shipped doc and contradicts the repo's actual pin. The
template's `.terraform-version` is `1.11.4`, and every root module requires `~>1.11.0`, so a reader
who follows this line installs a Terraform that cannot run `make infra-set-up-account`.

**Evidence**: `.terraform-version` (`1.11.4`); `infra/accounts/main.tf:38` and
`infra/networks/providers.tf:8` (`required_version = "~>1.11.0"`). The 1.4.6 example is only in
`docs/infra/set-up-infrastructure-tools.md`.

**Suggested fix**: cite the pinned version instead — e.g. "install the version the template pins in
`.terraform-version` (`1.11.4` at this ref); the root modules require `~> 1.11.0`" — and drop or
caveat the shipped doc's `tfenv install 1.4.6` example.

## Finding 2 (low) — `make infra-lint` scope overstated as linter-specific

**Claim** (lines 57-60): the three optional linters "run them together with `make infra-lint`".

**Issue**: `infra-lint` is not a runner for just those three utilities; it is an aggregate target
(`lint-markdown infra-lint-scripts infra-lint-terraform infra-lint-workflows`) that also runs
Terraform fmt/validate checks. Wording implies the target exists to invoke Shellcheck/actionlint/
markdown-link-check.

**Evidence**: `Makefile:146-147` (`infra-lint: lint-markdown infra-lint-scripts
infra-lint-terraform infra-lint-workflows`), plus targets at `Makefile:149-155`.

**Suggested fix**: "`make infra-lint` runs the whole infra lint suite (markdown, shell scripts,
Terraform, workflows) and depends on these tools being installed."

## Checked and confirmed accurate

- Azure auth guidance (`az login`, `AZURE_TENANT_ID`, `AZURE_CONFIG_DIR`) — matches
  `docs/infra/set-up-infrastructure-tools.md`.
- Account-layer resource inventory: project-named resource group, `subscription-logs` Log Analytics
  workspace, `terraform-backend-azure` module with `tf_state_use_customer_managed_encryption_key`
  default `true`, `auth-github-actions`, certificate store — `infra/accounts/main.tf`,
  `infra/accounts/variables.tf`.
- `infra_admins` fallback to the current user — `infra/accounts/main.tf` local `infra_admin_config`.
- Container registry created only in the shared subscription — `infra/accounts/container_registry.tf`.
- OIDC consent claim: Microsoft Graph `Group.Read.All`, commented `azuread_app_role_assignment`,
  federated subject `repo:<org>/<repo>` — `infra/modules/auth-github-actions/main.tf`,
  `infra/project-config/outputs.tf` (`code_repository`).
- `bin/set-up-github` sets `use_default=false` + `include_claim_keys[]=repo` and prints before/after.
- Make targets `infra-set-up-account` (with `args=`), `infra-update-account`,
  `infra-update-current-account`, `infra-configure-network`, `infra-update-network` — `Makefile:59-97`.
- `bin/create-tfbackend` inits `infra/accounts`, reads state outputs, renders from
  `infra/example.azurerm.tfbackend`.
- Default network config: `/20` VNet, four subnets (`gateway` with `outbound_peer_cidrs` +
  `internet_access = true`, `private-endpoints`, `database` delegated to
  `Microsoft.DBforPostgreSQL/flexibleServers`, `apps-private` delegated to
  `Microsoft.App/environments`) — `infra/project-config/networks.tf`.
- Alternative `apps-public` setup with service endpoints — `docs/infra/set-up-network.md`.
- Derived behavior: `default_outbound_access_enabled = false`, NAT gateway when any subnet sets
  `internet_access`, Container App Environment named after the subnet, zone-redundant, Consumption
  profile, internal LB unless `internet_access`, per-subnet NSG, `use_inline_nsg_association` —
  `infra/modules/azure/network/vnet/main.tf`, `.../subnet/main.tf`,
  `.../subnet/container_app_environment.tf`, `.../subnet/security_group.tf`.
- Private DNS zones (`acr`/`keyvault` with a private-endpoints subnet, `postgresql` with a database,
  `blob` with blob storage) and the container-registry private endpoint —
  `infra/modules/network/resources/private_link.tf`; zone names from
  `infra/modules/azure/private-endpoint-dns-refs/main.tf`.
- `local.apps_in_network` / `has_database` derivation and `network_name` per environment —
  `infra/networks/main.tf.jinja`, `infra/{{app_name}}/app-config/main.tf` + `dev|staging|prod.tf`.
