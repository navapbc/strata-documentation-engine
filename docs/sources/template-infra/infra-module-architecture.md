---
id: infra-module-architecture
title: Terraform Module Architecture and Layers
source: template-infra
verified: ok
doc_type: guide
tags: [infra, terraform, modules, layers, architecture, adr]
related: [infra-overview, infra-getting-started, infra-configuration, infra-environments-and-workspaces]
summary: How the Terraform code is split into independently-deployed root-module layers and reusable child modules, the dependency order, and the guidelines for choosing a resource's layer.
source_ref:
  repo: https://github.com/navapbc/template-infra
  ref: 80a7cc8ec802c442098933f65280175b8453c659
  paths:
    - docs/infra/module-architecture.md
    - docs/infra/making-infra-changes.md
    - infra/README.md
    - infra/accounts/main.tf
    - infra/networks/main.tf.jinja
    - infra/modules/network/resources/waf.tf
    - infra/modules/service/waf.tf
    - docs/decisions/infra/2023-09-11-separate-app-infrastructure-into-layers.md
    - docs/decisions/infra/2023-05-09-separate-terraform-backend-configs-into-separate-config-files.md
    - docs/decisions/infra/2023-05-25-separate-database-infrastructure-into-separate-layer.md
    - docs/decisions/infra/2023-12-01-network-layer-design.md
last_documented: 2026-07-21
---

# Terraform Module Architecture and Layers

This doc distills `docs/infra/module-architecture.md` and the supporting ADRs. It explains how the
Terraform is structured; for the higher-level layer/environment/config model see
[infra-overview](infra-overview.md).

## Root modules vs. child modules

The Terraform code (`docs/infra/module-architecture.md`) is split into:

- **Root modules** — deployed independently of one another. Each maps to a layer. To stand up an
  environment, every root module is applied separately, in the correct order.
- **Child modules** — reusable modules under `infra/modules/` that root modules call. The repo
  ships child modules including `terraform-backend-s3`, `auth-github-actions`,
  `container-image-repository`, `network`, `database`, `service`, `monitoring`, `domain`,
  `identity-provider`, `notifications`, `feature_flags`, `secrets`, `storage`, and
  `document-data-extraction` (see `infra/modules/`).

The calling structure: `accounts` → `terraform-backend-s3` + `auth-github-actions`; `networks` →
`network`; `{{app_name}}/build-repository` → `container-image-repository`;
`{{app_name}}/database` → `database`; `{{app_name}}/service` → `service`.

## Layers

| Layer (root module) | Scope | Notes |
| --- | --- | --- |
| `infra/accounts/` | Per AWS account | Terraform backend (S3 state bucket) + GitHub Actions OIDC provider and IAM role/policy |
| `infra/networks/` | Per network (shared across apps/envs/workspaces) | VPC, subnets, VPC endpoints, a WAF web ACL (always created here; its association with the service load balancer is optional via `enable_waf` in the service layer), and optional Route 53 hosted zones (`manage_dns`) |
| `infra/{{app_name}}/build-repository/` | Per app (shared across envs) | ECR registry for the app's images |
| `infra/{{app_name}}/database/` | Per app, per env (optional) | Aurora cluster + role manager |
| `infra/{{app_name}}/service/` | Per app, per env | ECS service, load balancer, DNS — deployed regularly on each release |

The config modules `infra/project-config/` and `infra/{{app_name}}/app-config/` are static and are
both applied as root modules (by scripts, to read outputs) and called as child modules (by the
layers). They create no resources. See [infra-configuration](infra-configuration.md).

## Dependency order

Per the dependency diagram in `docs/infra/module-architecture.md`:

1. **Account** first — it creates the S3 bucket the other layers' backends point at.
2. **Build repository** next — it stores the release-candidate images that environments deploy.
3. **Network** and **database** before **service** — the service depends on the network and, when
   `has_database = true`, on the database.

So the practical order is: account → build-repository → network → database → service. The
build-repository and network layers are independent — in the source dependency diagram each depends
only on the account layer, with no edge between them — so their relative order does not matter. The
service layer also depends on the account layer (for the OIDC/IAM resources GitHub Actions uses).

## Choosing which layer a resource belongs in

The guidelines (`docs/infra/module-architecture.md`) for placing a new resource:

- **Default to the service layer** so the resource is created/destroyed with each environment.
- **Match the cardinality of the layer.** If the resource does not map one-to-one with application
  environments — e.g. one build repository shared across all environments — put it in the layer
  whose lifecycle matches.
- **Respect AWS uniqueness constraints.** Resources AWS allows only one of per account/VPC belong in
  the account or network layer. Example: only one GitHub OIDC provider per account → account layer;
  only one VPC endpoint per VPC per service → network layer.
- **Respect policy constraints** on who is authorized to manage which resources — don't mix
  team-managed resources with ones the team can't manage.
- **Account for out-of-band dependencies.** Resources that need steps outside Terraform before
  downstream resources can use them belong in an upstream layer. This is the core rationale for the
  separate database layer: schemas, roles, and privileges must be configured before the service can
  use the database.

## Why these splits exist (ADRs)

- **Separate app infrastructure into layers** (`2023-09-11`) — the rationale behind the
  build-repository / database / service split.
- **Separate database into its own layer** (`2023-05-25`) — so the database can be fully provisioned
  and configured (out-of-band role setup) before the service layer runs.
- **Separate backend configs into separate files** (`2023-05-09`) — each layer/environment uses its
  own `.tfbackend`, so the same root module is reused across environments with different state. This
  is why `terraform init` always needs the right `-backend-config`.
- **Network layer design** (`2023-12-01`) — why the network is its own shared layer.

## Making changes

Use Make targets for most changes (`docs/infra/making-infra-changes.md`), e.g.:

```bash
make infra-update-current-account
make infra-update-network NETWORK_NAME=dev
make infra-update-app-service APP_NAME=app ENVIRONMENT=dev
make infra-update-app-build-repository APP_NAME=app   # no ENVIRONMENT — shared
```

Pass extra Terraform args via `TF_CLI_ARGS` / `TF_CLI_ARGS_apply`, e.g.
`TF_CLI_ARGS_apply='-var=image_tag=abcdef1' make infra-update-app-service APP_NAME=app ENVIRONMENT=dev`.

Alternatively use the wrapper scripts (`./bin/terraform-init <module> <env>`,
`./bin/terraform-apply <module> <env>`, `./bin/terraform-init-and-apply <module> <env>`) or run
`terraform` directly — but then you must `init` with the correct `-backend-config` because root
modules are shared across backends. To test changes in isolation before merging, use Terraform
workspaces; see [infra-environments-and-workspaces](infra-environments-and-workspaces.md).
