---
id: infra-azure-making-changes
title: Making infra changes and shipping releases
source: template-infra-azure
doc_type: guide
tags: [infra, azure, terraform, workflow, makefile, releases, deploy, migrations, testing]
related: [infra-azure-overview, infra-azure-set-up-database-and-service, infra-azure-access-control-and-operations, infra-azure-domains-and-https]
integrates_with: [template-application-rails]
summary: The three ways to apply Terraform changes in the Azure infra template (Make targets, the bin wrapper scripts, raw terraform), the bin script layer, the build-publish-migrate-deploy release pipeline, and the validation and Terratest tooling.
source_ref:
  repo: https://github.com/navapbc/template-infra-azure
  ref: 474f45e99076d3b72af4ea9d63dd5d6c0aab850f
  paths:
    - docs/infra/making-infra-changes.md
    - docs/releases.md
    - docs/infra/module-architecture.md
    - infra/README.md
    - Makefile
    - infra/example.azurerm.tfbackend
    - infra/test/infra_test.go
    - infra/test/helpers.go
    - bin/terraform-init
    - bin/terraform-run
    - bin/terraform-init-and-run
    - bin/create-tfbackend
    - bin/publish-release
    - bin/is-image-published
    - bin/deploy-release
    - bin/run-database-migrations
    - bin/run-app-job
    - bin/check-github-actions-auth
    - bin/infra-deploy-status-check-configs
    - bin/renew-tls-certificates
    - bin/util.sh
    - '{{app_name}}/Makefile'
last_documented: 2026-09-04
verified: ok
---

# Making infra changes and shipping releases

Before changing infrastructure, read the layer model in the
[overview](infra-azure-overview.md) — `docs/infra/making-infra-changes.md` opens by requiring
`docs/infra/module-architecture.md` as a prerequisite, so you understand which root module a change
belongs to. This guide covers *how* to apply a change once you know where it goes, and how a
release reaches an environment.

## Three ways to run Terraform

### 1. Make targets (recommended)

Most changes go through the Make targets in the root `Makefile`, all run from the project root
(`docs/infra/making-infra-changes.md`):

```bash
# account layer
make infra-update-current-account

# service layer for one app and environment
make infra-update-app-service APP_NAME=app ENVIRONMENT=dev
```

Extra arguments reach `terraform apply` through Terraform's own
[`TF_CLI_ARGS` / `TF_CLI_ARGS_<name>`](https://developer.hashicorp.com/terraform/cli/config/environment-variables#tf_cli_args-and-tf_cli_args_name)
environment variables:

```bash
TF_CLI_ARGS_apply='-input=false -auto-approve' make infra-update-app-service APP_NAME=app ENVIRONMENT=dev
TF_CLI_ARGS_apply='-var=image_tag=abcdef1'    make infra-update-app-service APP_NAME=app ENVIRONMENT=dev
```

Two extras the shipped doc doesn't mention: every `infra-update-*` target that shells out to
`bin/terraform-init-and-run` reads a `PLAN_ONLY` variable and switches from `apply` to `plan` when it
is set (through `terraform_update_cmd`), and each takes an `args` variable appended to the underlying
command. `infra-update-app-database-roles` is the exception — it delegates to
`bin/create-or-update-database-roles` and honors neither. The targets also guard their inputs — a missing `APP_NAME`,
`ENVIRONMENT`, `ACCOUNT_NAME`, or `NETWORK_NAME` fails with a named error rather than doing something
unintended (`Makefile`).

### 2. The `bin/` wrapper scripts

The Make targets are thin wrappers over shell scripts in `bin/`, which you can call directly
(`docs/infra/making-infra-changes.md`):

```bash
project-root$ ./bin/terraform-init infra/app/service dev
project-root$ ./bin/terraform-run infra/app/service dev apply
project-root$ ./bin/terraform-init-and-run infra/app/service dev apply   # init then apply
```

> The shipped examples write these as `./bin/terraform-init app/service dev`, without the `infra/`
> prefix. The scripts pass their first argument straight to `terraform -chdir=` relative to the
> current directory, and the Makefile always passes `infra/$(APP_NAME)/service`, so run them with the
> `infra/` prefix as shown above.

Both scripts take `module_dir` and a `config_name`, where the config name selects the
`.tfbackend`/`.tfvars` pair: an environment name (`dev`, `staging`, `prod`) for application modules,
`shared` for modules shared across environments, and `<account name>.<account id>` for the accounts
module. `terraform-init` runs `terraform init -input=false -reconfigure
-backend-config=<config_name>.azurerm.tfbackend`. `terraform-run` passes everything after the config
name to `terraform` verbatim and, for commands that accept variables (`plan`, `apply`, `destroy`,
`console`, `graph`, `taint`, `untaint`, `import`, `refresh`, `state`), appends
`-var-file=<config_name>.tfvars` when that file exists — a more selective version of Terraform's
`.auto.tfvars` behavior.

### 3. Raw `terraform`

If the wrappers don't fit — `terraform import`, `terraform taint`, and similar — run `terraform`
directly from the root module directory, passing the right backend and variable files yourself
(`docs/infra/making-infra-changes.md`):

```bash
infra/app/service$ terraform init -backend-config=dev.azurerm.tfbackend
infra/app/service$ terraform apply -var-file=dev.tfvars
```

## The `bin/` script layer

Grouped by what they do. They are plain Bash, and most carry a header comment documenting their
positional parameters. `bin/util.sh` holds shared helper functions — `get_app_names` (the app
directories under `infra/`, i.e. everything that is not `accounts`, `modules`, `networks`,
`project-config`, or `test`), `get_backend_config_names_in_root_module`, and a base-62 decoder.

| Group | Scripts |
| --- | --- |
| Terraform wrappers | `terraform-init`, `terraform-run`, `terraform-init-and-run` |
| Backend and account bootstrap | `set-up-account`, `create-tfbackend`, `set-up-github`, `check-registered-resource-providers`, `infra-admin-ids-from-group` |
| Name and id lookups | `account-ids-by-name`, `account-id-for-app-environment`, `account-config-name`, `current-account-config-name`, `current-account-id`, `account-name-for-network`, `network-name-for-app-environment` |
| Release pipeline | `publish-release`, `is-image-published`, `deploy-release`, `run-database-migrations`, `deploy-db-role-manager-release`, `run-app-job` |
| Database roles | `create-or-update-database-roles`, `check-database-roles` |
| CI / certificates / lint | `check-github-actions-auth`, `infra-deploy-status-check-configs`, `renew-tls-certificates`, `lint-markdown` |

Several are designed to be called by GitHub Actions rather than by hand:

- **`bin/run-app-job`** invokes a Container App Job with an overridden command and optional
  environment variables. Because `az containerapp job start --command`/`--env-vars` overrides
  [do not work](https://github.com/microsoft/azure-container-apps/issues/1360), it fetches the whole
  job template with `az containerapp job show`, rewrites it with `yq`, and starts the job from the
  modified template. It takes `--environment-variables` (a JSON list of `{name, value}` objects) and
  `--subscription-id` options plus positional `job_name`, `resource_group`, and a JSON `command`
  list.
- **`bin/check-github-actions-auth`** dispatches the `check-infra-auth.yml` workflow with `gh
  workflow run`, then polls `gh run list` for a run newer than the previous one to find the run id —
  the script's comments are candid that there is no reliable way to do this and a race remains.
- **`bin/infra-deploy-status-check-configs`** generates the matrix strategy for the
  `check-infra-deploy-status.yml` workflow: it enumerates every root module, its backend
  configurations, the information GitHub Actions needs to authenticate, and any extra `terraform
  plan` parameters, emitting minified JSON.
- **`bin/renew-tls-certificates`** re-applies just the certificate resources — see
  [domains and HTTPS](infra-azure-domains-and-https.md).

## The release pipeline

`docs/releases.md` documents three stages — build, publish, deploy — normally automated on merges to
release branches or by invoked GitHub Actions. Database migrations are the fourth stage in practice
but appear in `docs/releases.md` only as a trailing parenthetical; the target lives in the root
`Makefile` (`release-run-database-migrations`) over `bin/run-database-migrations`.

### Build

```bash
make release-build APP_NAME=<APP_NAME>
```

This calls the `release-build` target in `<APP_NAME>/Makefile` with parameters that build an image,
so `<APP_NAME>/Dockerfile` must have a build stage named `release` to act as the build target (see
Docker's [naming build
stages](https://docs.docker.com/build/building/multi-stage/#name-your-build-stages)). The template
ships that app-side target as a `docker buildx build --target release --platform=linux/amd64`
invocation. You may pass `IMAGE_NAME` and `IMAGE_TAG`, but the defaults are usually right: the root
`Makefile` derives `IMAGE_NAME` from the project directory name plus `APP_NAME`, and `IMAGE_TAG` from
`git rev-parse HEAD` (falling back to a timestamped `unknown-dev.*` tag outside a git work tree).
`CONTAINER_CMD` defaults to `docker` and is exported for the scripts.

### Publish

```bash
make release-publish APP_NAME=<APP_NAME>
```

`bin/publish-release` initializes and applies the app-config module, reads
`build_repository_config` with `terraform output -json` and `jq` to learn the registry name, URL,
subscription id, and repository name, authenticates with `az acr login`, then checks
`az acr repository show-tags` for the tag: if it is already published the script exits successfully
without pushing, otherwise it tags and pushes the image. A fourth positional argument selects the
image — `app` (default) or `db-role-manager` — which is how `db-role-manager-release-publish` reuses
the same script. `bin/is-image-published <app_name> <git_ref>` performs the same lookup and prints
`true` or `false`, for CI to decide whether a build is needed.

### Run database migrations

```bash
make release-run-database-migrations APP_NAME=<APP_NAME> ENVIRONMENT=<ENVIRONMENT>
```

`bin/run-database-migrations` first applies the app-config module and reads `has_database`, exiting
early when the app has no database. Otherwise it reads the migrator username and client id and the
job name and resource group from the service module, applies the service layer **targeted only at
the migrations job** (`-target=module.service.azurerm_container_app_job.service_job`) so the job
picks up the new image without touching the running service, then runs the job with the command
`["db-migrate"]` and `DB_USER`, `AZURE_CLIENT_ID`, and `APPSETTING_WEBSITE_SITE_NAME` environment
overrides. Migrations therefore run as the `migrator` role before the new image is deployed as
`app` — see [set up the database and service](infra-azure-set-up-database-and-service.md).

### Deploy

```bash
make release-deploy APP_NAME=<APP_NAME> ENVIRONMENT=<ENVIRONMENT>
```

`bin/deploy-release` is a thin wrapper that applies the service layer with
`TF_CLI_ARGS_apply="-input=false -auto-approve -var=image_tag=<tag>"`.

### All together

For a local test deploy of application changes, `docs/releases.md` suggests:

```sh
make release-build release-publish release-deploy APP_NAME=<APP_NAME> ENVIRONMENT=<ENV>
```

adding `release-run-database-migrations` before `release-deploy` if needed — the doc itself flags
that combination with "but be careful". `make release-image-name APP_NAME=<APP_NAME>` and
`make release-image-tag` print the values the pipeline would use.

## Validating and testing changes

- **`make infra-format`** runs `terraform fmt -recursive infra`; **`make infra-lint`** runs the
  markdown link check, `shellcheck bin/**`, `terraform fmt -recursive -check infra`, and
  `actionlint`.
- **`make infra-validate-modules`** runs `terraform init -backend=false` plus `terraform validate`
  against every child module under `infra/modules` that has a `main.tf`. Modules that declare
  `configuration_aliases` are **skipped**, because `terraform validate` does not support them yet;
  the `Makefile` links the upstream Terraform and OpenTofu issues.
- **`make infra-test-service APP_NAME=<APP_NAME>`** runs the Terratest service-layer suite
  (`cd infra/test && APP_NAME=<APP_NAME> IMAGE_TAG=<IMAGE_TAG> go test -run TestService -v -timeout
  30m` — the test reads both env vars, so the recipe passes them through). The test initializes
  `infra/<APP_NAME>/service` against `dev.azurerm.tfbackend`, creates a throwaway `t-<id>` workspace,
  applies the service layer with the image tag, waits for the service to come up, asserts
  `GET /health` returns 200 and that the document-upload page loads, then destroys the workspace and
  deletes it. **Prerequisite:** the container image for the current git hash must already be built
  and published, or `IMAGE_TAG` must point at a tag that is — in CI use the build-and-publish
  workflow, locally `make release-build` then `make release-publish`
  (`infra/test/infra_test.go`). `infra/test/helpers.go` wraps `terraform init` manually because
  Terratest cannot yet pass a file to `-backend-config`.

For testing a change against real infrastructure without disturbing teammates, use a Terraform
workspace — see
[access control and operations](infra-azure-access-control-and-operations.md).
