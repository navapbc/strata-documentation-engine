---
id: infra-getting-started
title: Getting Started — Standing Up Infrastructure
source: template-infra
doc_type: guide
tags: [infra, setup, terraform, aws, getting-started, deployment]
related: [infra-overview, infra-module-architecture, infra-configuration, infra-database, infra-capabilities, infra-security-monitoring]
integrates_with: [template-application-rails]
summary: The end-to-end setup sequence for a project — install the template, set up developer tools, then deploy the account, network, build repository, database, and service layers in order.
source_ref:
  repo: https://github.com/navapbc/template-infra
  ref: 8b7bc3899c3a9ab1b3441330d72993cd34d21f70
  paths:
    - README.md
    - infra/README.md
    - docs/infra/set-up-infrastructure-tools.md
    - docs/infra/set-up-aws-account.md
    - docs/infra/set-up-network.md
    - docs/infra/set-up-app-build-repository.md
    - docs/infra/set-up-database.md
    - docs/infra/set-up-app-env.md
    - docs/infra/add-application.md
    - docs/infra/staging-and-production-environments.md
    - infra/accounts/main.tf
    - infra/project-config/threat_detection.tf
    - infra/project-config/main.tf.jinja
last_documented: 2026-09-04
verified: ok
---

# Getting Started — Standing Up Infrastructure

This guide walks the full first-time setup sequence, distilled from `README.md`, `infra/README.md`,
and the `docs/infra/set-up-*` guides. The layers must be deployed in dependency order; see
[infra-module-architecture](infra-module-architecture.md) for why.

`<APP_NAME>` below is a placeholder for your application's name, which is also its directory
name under `infra/`.

## Prerequisites

You need an application that meets the template's application requirements before the final
(service) step — though you can defer that and use the example app for testing infrastructure
(`infra/README.md`). To start a compatible application from scratch, use a Nava Platform application
template; see
[infra-overview](infra-overview.md) for how the templates compose.

## 1. Install the template

Install the Nava Platform CLI, then from the project root (`README.md`):

```sh
nava-platform infra install .
```

Keep it current later with `nava-platform infra update .`. Always read the release notes before
updating, since breaking changes can affect deployed infrastructure.

## 2. Configure the project

Review `infra/project-config/main.tf` before deploying — its values have broad, hard-to-change-later
impact (`infra/README.md`). Optionally adjust the networks in `infra/project-config/networks.tf`
(three are defined by default, one per environment). In the template repo this file is
`main.tf.jinja`; copier renders it to `main.tf` with your answers (project name, owner, code
repository URL, default region) already filled in.

## 3. Set up developer tools and AWS auth

Per `docs/infra/set-up-infrastructure-tools.md`, install:

- **Terraform** (managed with `tfenv`; the repo pins a version via `.terraform-version`).
- **AWS CLI** and configure credentials/profiles (a project profile with `AWS_PROFILE`, e.g. via
  `direnv`, is recommended).
- **Go** (for Terratest), **GitHub CLI** (`gh`, used by the auth check), and optional linters
  (`shellcheck`, `actionlint`, `markdown-link-check`).

Verify auth with `aws sts get-caller-identity`.

## 4. Set up the AWS account

Authenticated into the target account (`docs/infra/set-up-aws-account.md`):

```bash
make infra-set-up-account ACCOUNT_NAME=<ACCOUNT_NAME>
```

This creates the S3 Terraform state bucket, the GitHub OIDC provider, and the IAM role and policy
for GitHub Actions, and writes `<account name>.<account id>.s3.tfbackend` into `infra/accounts/`. The
account layer also enables an **AWS GuardDuty detector** by default in the project's default region
(see [infra-security-monitoring](infra-security-monitoring.md)). Then verify GitHub Actions can
authenticate:

```bash
make infra-check-github-actions-auth ACCOUNT_NAME=<ACCOUNT_NAME>
```

## 5. Set up the network (VPC)

Per `docs/infra/set-up-network.md`, first set `has_database` and `has_external_non_aws_service` in
`infra/<APP_NAME>/app-config/main.tf` (these determine which VPC endpoints and NAT gateways the
network creates), then:

```bash
make infra-configure-network NETWORK_NAME=<NETWORK_NAME>
make infra-update-network NETWORK_NAME=<NETWORK_NAME>
```

## 6. Set up the build repository

Per `docs/infra/set-up-app-build-repository.md` — the build repository is shared across environments
(no `ENVIRONMENT` parameter):

```bash
make infra-configure-app-build-repository APP_NAME=<APP_NAME>
make infra-update-app-build-repository APP_NAME=<APP_NAME>
```

Then publish a first image with the Build and Publish workflow, e.g.
`gh workflow run build-and-publish.yml --field app_name=<APP_NAME> --field ref=main`.

## 7. Set up the database (optional)

Skip this if the application has no database. Per `docs/infra/set-up-database.md`:

```bash
make infra-configure-app-database APP_NAME=<APP_NAME> ENVIRONMENT=<ENVIRONMENT>
make infra-update-app-database APP_NAME=<APP_NAME> ENVIRONMENT=<ENVIRONMENT>
make infra-update-app-database-roles APP_NAME=<APP_NAME> ENVIRONMENT=<ENVIRONMENT>
make infra-check-app-database-roles APP_NAME=<APP_NAME> ENVIRONMENT=<ENVIRONMENT>
```

This provisions an Aurora Serverless v2 cluster and uses the role manager Lambda to create the
`app` and `migrator` Postgres users. See [infra-database](infra-database.md) for details.

## 8. Set up the application environment (service)

Per `docs/infra/set-up-app-env.md`, configure the backend, ensure at least one image is published,
then apply the service with that image tag:

```bash
make infra-configure-app-service APP_NAME=<APP_NAME> ENVIRONMENT=<ENVIRONMENT>
TF_CLI_ARGS_apply="-var=image_tag=<IMAGE_TAG>" make infra-update-app-service APP_NAME=<APP_NAME> ENVIRONMENT=<ENVIRONMENT>
```

`has_database` in `app-config/main.tf` determines whether the service is wired with database access.

## Preparing for production launch

Before serving real users in production, set up (per the `infra/README.md` checklist):
[HTTPS support](infra-security-and-access.md), [custom domains](infra-security-and-access.md),
[monitoring alerts](infra-capabilities.md), the
[web application firewall](infra-security-and-access.md), and the
[staging and production environments](infra-environments-and-workspaces.md). When adding staging and
prod you typically reuse the build repository and (depending on your account/VPC strategy) may reuse
or repeat the account and network setup; see `docs/infra/staging-and-production-environments.md`.

## Adding more applications

The infrastructure supports a monorepo with multiple applications. To add one
(`docs/infra/add-application.md`): create the application directory, use the Platform CLI to add its
infrastructure code (the guide links to
<https://navapbc.github.io/platform-cli/guides/adding-an-app/>), then repeat the build-repository /
database / service setup for the new app.

## Wiring up CI/CD and the team workflow

The steps above stand up AWS resources. `README.md` then points at four further setup guides that
live under `template-only-docs/` — set up CI, set up continuous deployment, set up pull request
environments (optional), and set up the team workflow. Those paths are **template-author docs**: the
Nava Platform CLI strips `template-only-*` from generated projects, so in your own repo follow them
from the template's GitHub page rather than expecting the files locally. See
[infra-environments-and-workspaces](infra-environments-and-workspaces.md) for what PR environments
do once enabled, and [infra-security-monitoring](infra-security-monitoring.md) for the CI
vulnerability and compliance scans.
