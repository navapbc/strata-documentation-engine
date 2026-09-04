# Verification findings: infra-azure-making-changes (round 2)

Doc: `docs/sources/template-infra-azure/infra-making-changes.md`
Source: `.sources/template-infra-azure` @ `474f45e99076d3b72af4ea9d63dd5d6c0aab850f`

## Summary

Round 1 identified four findings. On re-verification against the source code and the actual doc text,
**all four findings from round 1 are INCORRECT** — they result from misreadings of the doc. The doc
text is accurate and fully supported by the source.

### Round 1 finding 1: INCORRECT — the doc already scopes PLAN_ONLY to targets that shell out to terraform-init-and-run

**Round 1 claim:** The doc uses universal quantifiers ("every", "each") without exception for the PLAN_ONLY variable and args parameter.

**Actual doc text (lines 71-74):**
> "every `infra-update-*` target **that shells out to `bin/terraform-init-and-run`** reads a `PLAN_ONLY` variable...and each takes an `args` variable appended to the underlying command. `infra-update-app-database-roles` is the exception..."

The doc explicitly scopes the claim to targets that shell out to terraform-init-and-run, and explicitly notes the exception. No inaccuracy found.

### Round 1 finding 2: INCORRECT — the doc correctly states releases.md documents THREE stages, not four

**Round 1 claim:** The doc claims releases.md documents four stages.

**Actual doc text (line 153):**
> "`docs/releases.md` documents three stages — build, publish, deploy..."

The doc clearly and correctly states THREE stages. Migrations are described as "the fourth stage in practice" (meaning in workflow, not in the source documentation). No inaccuracy found.

### Round 1 finding 3: INCORRECT — the doc includes the APP_NAME and IMAGE_TAG env vars in the command

**Round 1 claim:** The quoted command omits env vars.

**Actual doc text (lines 234-236):**
> "`make infra-test-service APP_NAME=<APP_NAME>` runs the Terratest service-layer suite (`cd infra/test && APP_NAME=<APP_NAME> IMAGE_TAG=<IMAGE_TAG> go test -run TestService -v -timeout 30m`...)"

The doc explicitly includes both env vars. No inaccuracy found.

### Round 1 finding 4: INCORRECT — related frontmatter already includes infra-azure-domains-and-https

**Round 1 claim:** The related field omits infra-azure-domains-and-https.

**Actual frontmatter (line 7):**
```
related: [infra-azure-overview, infra-azure-set-up-database-and-service, infra-azure-access-control-and-operations, infra-azure-domains-and-https]
```

The doc frontmatter includes infra-azure-domains-and-https. No inaccuracy found.

## Comprehensive source verification (round 2)

Fully verified against source code (.sources/template-infra-azure @ 474f45e99076d3b72af4ea9d63dd5d6c0aab850f):

- All three ways to run Terraform (Make targets, bin scripts, raw terraform) and their examples ✓
- `infra/` prefix correction in blockquote — shipped `docs/infra/making-infra-changes.md` omits it; `Makefile` passes `infra/$(APP_NAME)/service` ✓
- `terraform-init` flags: `terraform init -input=false -reconfigure -backend-config=<config_name>.azurerm.tfbackend` ✓
- `terraform-run` command list (plan, apply, destroy, console, graph, taint, untaint, import, refresh, state) and `-var-file` behavior ✓
- All 28 bin scripts listed in the table and referenced in prose ✓
- `bin/util.sh` helpers: `get_app_names`, `get_backend_config_names_in_root_module`, `base62_decode` ✓
- `bin/terraform-init-and-run` calls init then run ✓
- `bin/publish-release` init/apply app-config, read build_repository_config via terraform output, az acr login, check az acr repository show-tags, skip if already published, else tag and push ✓
- `bin/is-image-published` takes app_name and git_ref, prints true or false ✓
- `bin/deploy-release` applies service layer with TF_CLI_ARGS_apply="-input=false -auto-approve -var=image_tag=<tag>" ✓
- `bin/run-app-job` optional --environment-variables (JSON {name, value} objects) and --subscription-id, positional job_name, resource_group, command ✓
- `bin/run-app-job` fetches job template with az containerapp job show, rewrites with yq, starts from modified template (workaround for issue 1360) ✓
- `bin/check-github-actions-auth` dispatches workflow with gh workflow run, polls gh run list for newer run (race acknowledged in script comments) ✓
- `bin/infra-deploy-status-check-configs` enumerates root modules, backend configs, GA auth info, extra terraform plan params, emits minified JSON ✓
- `bin/renew-tls-certificates` targets certificate resources (acme_registration, acme_certificate, azurerm_key_vault_certificate) ✓
- `infra-format` runs terraform fmt -recursive ✓
- `infra-lint` runs markdown link check, shellcheck bin/**, terraform fmt -check, actionlint ✓
- `infra-validate-modules` runs terraform init -backend=false and validate, skips modules with configuration_aliases, links upstream Terraform and OpenTofu issues ✓
- `make infra-test-service APP_NAME=<APP_NAME>` runs `cd infra/test && APP_NAME=<APP_NAME> IMAGE_TAG=<IMAGE_TAG> go test -run TestService -v -timeout 30m` ✓
- Terratest creates workspace t-<id>, initializes infra/<APP_NAME>/service against dev.azurerm.tfbackend, applies service layer, asserts GET /health returns 200, asserts document-upload page loads, destroys and deletes workspace ✓
- Container image prerequisite: built and published, or IMAGE_TAG points to published tag; CI uses build-and-publish workflow, locally make release-build then make release-publish ✓
- `infra/test/helpers.go` wraps terraform init manually because Terratest cannot yet pass file to -backend-config ✓
- `bin/run-database-migrations` applies app-config, reads has_database, exits early if false, reads migrator_username and migrator_user_client_id and service_job_name and service_resource_group, applies service layer targeted at module.service.azurerm_container_app_job.service_job, runs job with command ["db-migrate"] and DB_USER, AZURE_CLIENT_ID, APPSETTING_WEBSITE_SITE_NAME environment variables ✓
- Makefile PLAN_ONLY variable (scoped to terraform-init-and-run targets) switches from apply to plan ✓
- Makefile args variable appended to terraform commands (scoped to terraform-init-and-run targets) ✓
- infra-update-app-database-roles exception: delegates to create-or-update-database-roles, honors neither PLAN_ONLY nor args ✓
- docs/releases.md documents three stages (build, publish, deploy); migrations mentioned only parenthetically; release-run-database-migrations target lives in root Makefile ✓
- IMAGE_NAME defaults to PROJECT_ROOT-APP_NAME ✓
- IMAGE_TAG defaults to git rev-parse HEAD, falls back to unknown-dev.<timestamp> outside git worktree ✓
- CONTAINER_CMD defaults to docker, exported for scripts ✓

## Result

No inaccuracies found in round 2. The documentation is accurate and fully supported by the source code.
