---
id: infra-azure-set-up-account-and-network
title: Set up the Azure account and network
source: template-infra-azure
doc_type: guide
tags: [infra, azure, terraform, account, network, github, oidc, setup]
related: [infra-azure-overview, infra-azure-domains-and-https, infra-azure-set-up-database-and-service, infra-azure-access-control-and-operations]
integrates_with: [template-application-rails]
summary: How to install developer tools and stand up the account layer (Terraform backend, GitHub OIDC, container registry) and network layer (VNet, subnets, private DNS, Container App Environment) for the Azure infra template.
source_ref:
  repo: https://github.com/navapbc/template-infra-azure
  ref: f930f2ba39be8ab6a55eaa0b538ad96def2e331b
  paths:
    - docs/infra/set-up-infrastructure-tools.md
    - docs/infra/set-up-azure-account.md
    - docs/infra/set-up-github.md
    - docs/infra/set-up-network.md
    - infra/accounts/main.tf
    - infra/project-config/main.tf.jinja
    - Makefile
verified: ok
last_documented: 2026-06-29
---

# Set up the Azure account and network

This guide covers the first foundational layers of the Azure infra template: developer tooling, the
**account** layer (Terraform state backend + GitHub OIDC + container registry), GitHub repository
setup, and the **network** layer. It assumes the template has already been installed into your
project (see the [overview](infra-azure-overview.md)).

## 0. Install infrastructure developer tools

Contributors need the following installed (`docs/infra/set-up-infrastructure-tools.md`):

- **Terraform**, managed with [`tfenv`](https://github.com/tfutils/tfenv) (e.g.
  `tfenv install 1.4.6`), since projects may pin different versions.
- **Azure CLI** (`az`) — `brew install azure-cli` on macOS.
- **Go** — required to run the [Terratest](https://terratest.gruntwork.io/) suite for the Terraform
  modules.
- **GitHub CLI** (`gh`) — `brew install gh`; required by the GitHub setup script.
- Misc tools: `jq`; and optional linters `shellcheck`, `actionlint`, `markdown-link-check` (run
  locally with `make infra-lint`).

### Azure authentication

Terraform authenticates through the Azure CLI. For a single project, `az login` with the appropriate
user is enough. For multiple tenants, set `AZURE_TENANT_ID` per project (e.g. with
[direnv](https://direnv.net/)) and `az login` on each switch. For multiple Azure clouds, use
separate config directories via `AZURE_CONFIG_DIR`. (Source:
`docs/infra/set-up-infrastructure-tools.md`.)

## 1. Set up the Azure account (subscription)

"Azure account" and "Azure subscription" are used interchangeably in these docs. The account setup
process creates the Terraform backend storage, the GitHub Actions OpenID Connect provider in the
Microsoft Entra tenant (with admin roles assigned), and — for the shared-resources account — an
Azure Container Registry. (Source: `docs/infra/set-up-azure-account.md`.)

**Prerequisites:** complete tool setup above, and configure the project
(`infra/project-config/main.tf`). For an initial setup, set `shared_account_name` in
`infra/project-config/networks.tf` to the account name you will use as `<ACCOUNT_NAME>`; you can fill
in `infra_admins` afterward (only the person who runs the initial create can run the first update).

1. **Authenticate.** By default setup targets your current default CLI account; check with
   `az account show` (list all with `az account list`).
2. **Create backend resources and the tfbackend file.** `<ACCOUNT_NAME>` is a human-readable label
   (e.g. an environment name like `prod`/`staging`, or `lowers` for combined lower environments) used
   to prefix the generated backend file:

   ```bash
   make infra-set-up-account ACCOUNT_NAME=<ACCOUNT_NAME>
   # or target a specific subscription id:
   make infra-set-up-account ACCOUNT_NAME=<ACCOUNT_NAME> args="<SUBSCRIPTION_ID>"
   ```

   This creates the storage account and the GitHub OIDC provider, and writes
   `[account name].[account id].azurerm.tfbackend` in `infra/accounts`. (The account root module
   also creates a subscription-level Resource Group, a `subscription-logs` Log Analytics Workspace,
   the Terraform backend module, the `auth_github_actions` module, and the certificate store —
   `infra/accounts/main.tf`.)
3. **Copy GitHub OIDC ids into project config.** Run
   `terraform -chdir=infra/accounts output github_oidc` and copy the `client_id` / `object_id` into
   a `<ACCOUNT_NAME>` entry under `github_actions_azure_config` in
   `infra/project-config/main.tf`.
4. **Update `infra_admins`.** By default only the creating account is an owner (relevant for Entra
   resources), which is poor team practice. Add team member object ids and the GitHub Actions
   principal's `object_id` (`local.github_actions_azure_config["<ACCOUNT_NAME>"].object_id`) to the
   `infra_admins` map; assigning the GH Actions principal as owner simplifies CI/CD permissions.
5. **Approve the GitHub identity's Entra permissions.** The GitHub identity gets subscription
   permissions automatically but also needs tenant-level permissions, which require a user with
   **Global Administrator** or **Privileged Role Administrator** to grant admin consent. In the
   Azure Portal / Entra admin center go to the app registration (search
   `<project name>-<account name>-github-oidc`, ideally by client/application id) → Manage → API
   Permissions → "Grant admin consent for <org>". Alternatively run
   `az ad app permission admin-consent --id <app id>`, or uncomment the
   `azuread_app_role_assignment` block in `infra/modules/auth-github-actions/main.tf` if developers
   themselves hold elevated accounts.

To apply later account changes: `make infra-update-current-account`. To tear down, see
[access control and operations](infra-azure-access-control-and-operations.md). The roles your own
account needs to run this setup are listed in that same doc.

## 2. Set up GitHub

Because of how Azure OIDC authentication works, the GitHub repository needs some tweaks for CI/CD.
Prerequisites: the GitHub CLI installed, a project repo created on GitHub, and admin rights on it.
Then run (`docs/infra/set-up-github.md`):

```bash
./bin/set-up-github
```

## 3. Set up the network

The network setup creates a Virtual Network; public subnets (for the load balancer), private subnets
(for the service), and database subnets; Private DNS zones for the Private Endpoints that back Azure
services (e.g. the container registry); and a Container App Environment shared by all apps in the
network. (Source: `docs/infra/set-up-network.md`.)

**Requirements before running:** the [Azure account is set up](#1-set-up-the-azure-account-subscription);
[custom domains](infra-azure-domains-and-https.md) and [HTTPS support](infra-azure-domains-and-https.md)
are configured; networks are defined in `infra/project-config/networks.tf`; and the app is configured
in `infra/<APP_NAME>/app-config/main.tf`, where you must set `has_database` (true/false — controls
whether VPC endpoints for the database layer are created) and `network_name` per environment (so each
network receives the right app configuration; an incorrect `network_name` can cause the network layer
to miss settings like `has_database`).

### Network configuration

By default three networks are defined, one per application environment. With multiple apps you may
want differentiating names (e.g. `foo-dev`, `bar-prod`). There is no fixed list of public/private
subnets — many subnets must be dedicated/delegated to a single Azure service type, so you may add
subnet specs to fit your use case. The default config (in `infra/project-config/networks.tf`)
defines:

- a `gateway` subnet for Application Gateways (with `internet_access = true` and
  `outbound_peer_cidrs` restricting which subnets it can reach — the private-endpoints subnet for TLS
  certs and the app subnet(s) for routing),
- a `private-endpoints` subnet,
- a `database` subnet delegated to `Microsoft.DBforPostgreSQL/flexibleServers`,
- an `apps-private` subnet delegated to `Microsoft.App/environments` for the Container App
  Environment.

An **alternative setup** (recommended only for non-production) replaces the dedicated Application
Gateway with a second Container App Environment that allows public ingress and uses service
endpoints, letting you start on the auto-generated `*.azurecontainerapps.io` domains without sorting
out custom DNS first. (Source: `docs/infra/set-up-network.md`.)

### Create the network

```bash
make infra-configure-network NETWORK_NAME=<NETWORK_NAME>   # writes the tfbackend
make infra-update-network NETWORK_NAME=<NETWORK_NAME>      # review the plan, then apply
```

If you later change app configuration that affects the network (such as `has_database`), update the
network **before** updating or deploying the downstream database/service layers.

## Next steps

With the account and network in place, proceed per application to
[set up the database and service](infra-azure-set-up-database-and-service.md). Custom domains and
TLS are covered in [domains and HTTPS](infra-azure-domains-and-https.md).
</content>
</invoke>
