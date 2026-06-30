# Verification findings: infra-azure-application-service (round 1)

Doc: `docs/sources/template-infra-azure/infra-application-service.md`
Source: `.sources/template-infra-azure`

## Result: no findings

Every substantive claim in the doc is supported by the source checkout.

### Claims checked and confirmed

- Requirements (compatible app, `has_database` + `service_cpu`/`service_memory`/`service_desired_instance_count` in `app-config/main.tf`, network, optional database) — matches `docs/infra/set-up-app-env.md`.
- `make infra-configure-app-service` writes backend/tfvars; DB access depends on `has_database` — matches `set-up-app-env.md`.
- Build/publish via "Build and Publish" GitHub Actions workflow or `make release-build` / `make release-publish`; copy image tag — matches `set-up-app-env.md`.
- `TF_CLI_ARGS_apply="-var=image_tag=<IMAGE_TAG>" make infra-update-app-service` — verbatim match.
- Env vars: `default_extra_environment_variables` map in `env-config/environment-variables.tf`, override via `service_override_extra_environment_variables` in `app-config/<environment>.tf`, do not store secrets there — matches `environment-variables-and-secrets.md`. (Doc uses the real on-disk filename `environment-variables.tf`; the source prose's `environment_variables.tf` is the typo, so the doc is the more accurate of the two.)
- Secrets: `secrets` map, `manage_method` `"generated"`/`"manual"`, `secret_name` semantics, store manual secrets in Azure Key Vault before deploy — matches source.
- Background jobs: Container App Jobs; fixed-schedule and event-triggered (on-demand vs continuous worker, worker-queue not yet implemented); single manually-triggered job for migrations by default; add own `azurerm_container_app_job` — matches `background-jobs.md` and confirmed by `infra/modules/service/main.tf` (`azurerm_container_app_job "service_job"` with `manual_trigger_config`, migrator identity).
- Optional blob storage gated on `has_blob_storage`, via `storage` module, private endpoint when a private-endpoints subnet exists — confirmed by `infra/{{app_name}}/service/storage.tf`.
- Release flow build→publish→deploy, `release-build` stage named `release`, tag defaults to commit hash, chaining + `release-run-database-migrations` before deploy, automation via release branches/Actions — matches `docs/releases.md`.
- Application Gateway routing — confirmed by `infra/{{app_name}}/service/main.tf` (`application_gateway_*`) and `infra/modules/service/application_gateway.tf`. ("Load balancer/Application Gateway" gloss is accurate; App Gateway is an L7 load balancer.)
