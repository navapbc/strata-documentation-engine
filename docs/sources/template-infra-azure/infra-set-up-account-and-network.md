---
id: infra-azure-set-up-account-and-network
title: Set up the Azure account and network
source: template-infra-azure
doc_type: guide
tags: [infra, azure, terraform, account, subscription, network, vnet, github, oidc, setup]
related: [infra-azure-overview, infra-azure-domains-and-https, infra-azure-set-up-database-and-service, infra-azure-access-control-and-operations, infra-azure-making-changes]
integrates_with: [template-application-rails]
summary: How to install the developer tools and stand up the account layer (Terraform backend, GitHub OIDC, container registry) and network layer (VNet, subnets, NAT gateway, private DNS, Container App Environment) of the Azure infra template.
source_ref:
  repo: https://github.com/navapbc/template-infra-azure
  ref: 474f45e99076d3b72af4ea9d63dd5d6c0aab850f
  paths:
    - docs/infra/set-up-infrastructure-tools.md
    - docs/infra/set-up-azure-account.md
    - docs/infra/set-up-github.md
    - docs/infra/set-up-network.md
    - infra/README.md
    - infra/accounts/main.tf
    - infra/accounts/container_registry.tf
    - infra/accounts/variables.tf
    - infra/accounts/outputs.tf
    - infra/project-config/main.tf.jinja
    - infra/project-config/networks.tf
    - infra/project-config/azure_resource_providers.tf
    - infra/networks/main.tf.jinja
    - infra/modules/network/resources/private_link.tf
    - infra/modules/azure/network/vnet/main.tf
    - infra/modules/azure/network/subnet/main.tf
    - infra/modules/azure/network/subnet/container_app_environment.tf
    - infra/modules/auth-github-actions/main.tf
    - bin/set-up-github
    - bin/create-tfbackend
    - Makefile
    - .terraform-version
    - infra/networks/providers.tf
last_documented: 2026-09-04
verified: ok
---

# Set up the Azure account and network

This guide covers the first two foundational layers of the Azure infra template: the **account**
layer (Terraform state backend, GitHub OIDC identity, container registry) and the **network** layer
(Virtual Network, subnets, Container App Environment, private DNS). It assumes the template has
already been installed into your project — see the [overview](infra-azure-overview.md).

## 0. Install infrastructure developer tools

Contributors need the following (`docs/infra/set-up-infrastructure-tools.md`):

- **Terraform**, managed with [`tfenv`](https://github.com/tfutils/tfenv) — e.g.
  `brew install tfenv`, then install the version the template pins in `.terraform-version`
  (`1.11.4` at this ref: `tfenv install 1.11.4`). The `infra/accounts` and `infra/networks` root
  modules declare `required_version = "~> 1.11.0"`, so an older release such as the `1.4.6` in the
  shipped doc will not run. Projects may pin different versions, hence `tfenv`.
- **Azure CLI** (`az`) — `brew install azure-cli` on macOS.
- **Go** — required to run [Terratest](https://terratest.gruntwork.io/), the Terraform test
  framework used by `infra/test`.
- **GitHub CLI** (`gh`) — `brew install gh`; needed by `bin/check-github-actions-auth` and
  `bin/set-up-github`.
- **Misc script tools** — `jq` (`brew install jq`).
- **Optional linters** — [Shellcheck](https://github.com/koalaman/shellcheck),
  [actionlint](https://github.com/rhysd/actionlint), and
  [markdown-link-check](https://github.com/tcort/markdown-link-check). `make infra-lint` runs the
  whole infra lint suite (markdown, shell scripts, Terraform, workflows), which expects these tools
  to be installed.

### Azure authentication

Terraform authenticates through the Azure CLI. For a single project, `az login` as the appropriate
user is enough. Juggling several projects in different tenants, set `AZURE_TENANT_ID` per project
(for example with [direnv](https://direnv.net/)) and re-run `az login` when switching. Working across
different Azure clouds, keep separate CLI configuration directories and set `AZURE_CONFIG_DIR` per
project. (Source: `docs/infra/set-up-infrastructure-tools.md`.)

## 1. Set up the Azure account (subscription)

"Azure account" and "Azure subscription" are used interchangeably throughout the shipped docs;
`docs/infra/set-up-azure-account.md` notes that "subscription" is the more correct term. The account
setup process:

1. creates the [Terraform backend](https://developer.hashicorp.com/terraform/language/backend)
   resources that store state files,
2. creates the OpenID Connect provider in the Microsoft Entra ID tenant so GitHub Actions can reach
   subscription resources, and assigns it admin roles,
3. creates the project's Azure Container Registry, if this is the shared-resources account.

### Prerequisites

- Tooling and Azure authentication from step 0.
- The project is configured in `infra/project-config/` (rendered from
  `infra/project-config/main.tf.jinja` into `main.tf` in a generated project).
- Set `shared_account_name` in `infra/project-config/networks.tf` to the name you will use as
  `<ACCOUNT_NAME>` below. That account holds the shared project resources — the container registry
  and, when configured, the shared DNS zone (`infra/accounts/container_registry.tf`,
  `infra/accounts/shared_hosted_zone.tf`).
- **If you cannot register Azure resource providers** in the target subscription:
  - set `azure_resource_providers_autoenable = false` in
    `infra/project-config/azure_resource_providers.tf`,
  - work out which providers still need registering — via
    `bin/check-registered-resource-providers [subscription-id]`, or in the Azure Portal under the
    subscription's Settings → Resource Providers with the Status filter set to "Registered",
    comparing against the `azure_resource_providers` list,
  - hand the missing providers to someone who can register them. Depending on which are missing you
    may be able to proceed with the account layer, but in general you must wait.
- You will eventually want an `infra_admins` entry for this account name, though it can be filled in
  after the initial create — note that **only the person who ran the initial create can run the
  first update**. If your admins are in an Entra group,
  `bin/infra-admin-ids-from-group <GROUP_NAME>` prints the object ids for copy-paste into the config.

### Steps

1. **Confirm which subscription you are pointed at.** Setup targets whatever account is the default
   in your Azure CLI session:

   ```bash
   az account show    # the current default
   az account list    # everything you can reach
   ```

2. **Create the backend resources and the tfbackend file.** `<ACCOUNT_NAME>` is a human-readable
   label used to prefix the generated backend file so it is identifiable without the subscription id
   — an environment name like `prod` or `staging`, or something like `lowers` for a single account
   holding all lower environments:

   ```bash
   make infra-set-up-account ACCOUNT_NAME=<ACCOUNT_NAME>
   # or, to target a subscription other than your CLI default:
   make infra-set-up-account ACCOUNT_NAME=<ACCOUNT_NAME> args="<SUBSCRIPTION_ID>"
   ```

   This runs `bin/set-up-account`, creating the storage account and the GitHub OIDC provider and
   writing `<account name>.<account id>.azurerm.tfbackend` into `infra/accounts`. Behind the Make
   target, the `infra/accounts` root module also creates a project-named resource group, a
   `subscription-logs` Log Analytics workspace, the `terraform-backend-azure` module (storage
   account plus container, with an optional customer-managed encryption key — controlled by
   `tf_state_use_customer_managed_encryption_key`, default `true`), the `auth-github-actions`
   module, and the certificate store. (Source: `infra/accounts/main.tf`,
   `infra/accounts/variables.tf`.)

3. **Copy the GitHub OIDC ids into project config.** Retrieve them with:

   ```bash
   terraform -chdir=infra/accounts output github_oidc
   ```

   Then add a `<ACCOUNT_NAME>` entry with the returned `client_id` and `object_id` to the
   `github_actions_azure_config` object in `infra/project-config/main.tf`.

4. **Update `infra_admins`.** By default the identity that created the Terraform resources is the
   only "owner", which matters most for Microsoft Entra resources and is poor team practice. Add
   team members' object ids and — importantly — the GitHub Actions principal's object id, referenced
   as `local.github_actions_azure_config["<ACCOUNT_NAME>"].object_id`. Making the GitHub Actions
   principal an owner keeps CI/CD permissions simple; otherwise you would need Entra "write"
   permissions on all groups in the tenant. If `infra_admins` has no entry for the account, the
   account layer falls back to an owner list containing only the current user
   (`infra/accounts/main.tf`).

5. **Approve the GitHub identity's Entra permissions.** The identity gets its subscription
   permissions automatically, but it also needs tenant-level permissions, and granting those needs a
   user with the **Global Administrator** or **Privileged Role Administrator** role. In the Azure
   Portal or Entra admin center, that user opens the app registration (search
   `<project name>-<account name>-github-oidc`, or better the application/client id, since Entra
   display names are not unique) → Manage → API Permissions → "Grant admin consent for &lt;org&gt;".
   Equivalently:

   ```bash
   az ad app permission admin-consent --id <app id>
   ```

   The permission being consented to is Microsoft Graph `Group.Read.All`
   (`infra/modules/auth-github-actions/main.tf`). If your developers themselves hold elevated
   accounts and every account run will use them, you can instead uncomment the
   `azuread_app_role_assignment` block in that module.

To apply later account-layer changes, run `make infra-update-current-account` (or
`make infra-update-account ACCOUNT_NAME=<name>`). The roles **your own** account needs are listed in
[access control and operations](infra-azure-access-control-and-operations.md), along with the
teardown procedure.

## 2. Set up GitHub

Current restrictions on how OIDC authentication works with Azure require a repository-level tweak
before CI/CD works as expected. Prerequisites: the GitHub CLI installed (the only hard dependency
from step 0), a project repository on GitHub, and admin rights on it. Then run
(`docs/infra/set-up-github.md`):

```bash
project-root$ ./bin/set-up-github
```

The script uses `gh api` to set the repository's Actions OIDC subject claim customization to include
only the `repo` claim (`use_default=false`, `include_claim_keys[]=repo`), printing the settings
before and after. That matches the federated credential the account layer registers, whose subject
is `repo:<org>/<repo>` (`bin/set-up-github`,
`infra/modules/auth-github-actions/main.tf`).

## 3. Set up the network

The network setup configures and deploys the network resources other layers need
(`docs/infra/set-up-network.md`):

1. a Virtual Network,
2. public subnets for publicly accessible resources such as the application load balancer, private
   subnets for the application service, and private subnets for the database,
3. Private DNS zones for the private endpoints that back the Azure services the application uses
   (such as the container registry),
4. a Container App Environment shared by all apps in the network.

### Requirements before running

- The [Azure account](#1-set-up-the-azure-account-subscription) is set up.
- [Custom domains](infra-azure-domains-and-https.md) and
  [HTTPS support](infra-azure-domains-and-https.md) are configured.
- Networks are defined the way you want in `infra/project-config/networks.tf`.
- The app is configured in `infra/<APP_NAME>/app-config/main.tf`:
  - set `has_database` to `true` or `false` — it determines whether the endpoints the database layer
    needs are created,
  - set `network_name` for each application environment (in `dev.tf` / `staging.tf` / `prod.tf`), so
    each network receives the right application configuration. The network root module builds
    `local.apps_in_network` from these mappings; getting `network_name` wrong means the network layer
    silently misses settings such as `has_database`.

### Network configuration

By default three networks are defined, one per application environment. With multiple apps that
should live in separate networks, give them differentiating names (`foo-dev`, `foo-prod`, `bar-dev`,
`bar-prod` rather than just `dev`, `prod`).

There is no fixed list of public and private subnets: many subnets must be dedicated or delegated to
a single Azure service type, so you may need to add subnet specifications for your use case. The
default configuration in `infra/project-config/networks.tf` gives each network a `/20` VNet CIDR and
four subnets:

- **`gateway`** — hosts the services' Application Gateways. Named by
  `application_gateway_subnet_name`. It is the one subnet locked down by default: other subnets may
  reach any subnet in the VNet, but the gateway subnet may only reach the CIDRs in
  `outbound_peer_cidrs` (the private-endpoints subnet, to fetch TLS certs, and the app subnets, to
  route traffic). It sets `internet_access = true`.
- **`private-endpoints`** — holds private endpoints. Named by `private_endpoints_subnet_name`.
- **`database`** — delegated to `Microsoft.DBforPostgreSQL/flexibleServers`.
- **`apps-private`** — delegated to `Microsoft.App/environments`, backing the network's Container App
  Environment. Size it for your service's scaling needs.

The **alternative setup**, tentatively supported and recommended only for non-production, drops the
dedicated Application Gateway and instead runs a second Container App Environment
(`apps-public`) that allows public ingress and uses service endpoints
(`Microsoft.ContainerRegistry`, `Microsoft.KeyVault`) rather than private endpoints. You can then
start on the auto-generated `*.azurecontainerapps.io` domains without sorting out DNS and custom
domains first. (Source: `docs/infra/set-up-network.md`.)

### What the network module derives from the subnet specs

The subnet child modules read the configuration rather than taking explicit switches, which is worth
knowing when adding a subnet (`infra/modules/azure/network/`):

- Subnets are private by default (`default_outbound_access_enabled = false`). A **NAT gateway** is
  created for the VNet as soon as *any* subnet sets `internet_access = true`, and is associated with
  each such subnet.
- A **Container App Environment** is created for any subnet whose `service_delegation` includes
  `Microsoft.App/environments`. It is named after the subnet, is zone-redundant, sends logs to the
  network's Log Analytics workspace, offers the `Consumption` workload profile, and uses an internal
  load balancer unless the subnet has `internet_access = true`. Downstream modules therefore look
  the environment up **by subnet name**.
- Every subnet gets a network security group; set `use_inline_nsg_association = true` on the VNet
  config if an Azure Policy requires the NSG association to be part of the subnet payload rather
  than a separate association resource.
- **Private DNS zones** are created per Azure service integration and linked to the VNet: `acr` and
  `keyvault` whenever a private-endpoints subnet exists, `postgresql` when any app in the network has
  a database, and `blob` when any app has blob storage. Zone names come from the lookup table in
  `infra/modules/azure/private-endpoint-dns-refs/main.tf` (for example
  `privatelink.postgres.database.azure.com`). A private endpoint for the container registry is
  created in the same module.

### Create the network

```bash
make infra-configure-network NETWORK_NAME=<NETWORK_NAME>   # writes the tfbackend
make infra-update-network NETWORK_NAME=<NETWORK_NAME>      # review the plan, then apply
```

`infra-configure-network` runs `bin/create-tfbackend`, which initializes `infra/accounts` for the
network's account, reads the backend storage outputs from it, and renders
`infra/networks/<NETWORK_NAME>.azurerm.tfbackend` from `infra/example.azurerm.tfbackend`.

If you later change application configuration that affects the network — `has_database` is the
canonical example — **update the network before** updating or deploying the database and service
layers.

## Next steps

With the account and network in place, continue per application to
[set up the database and service](infra-azure-set-up-database-and-service.md). Custom domains and TLS
are covered in [domains and HTTPS](infra-azure-domains-and-https.md).
