# Verification findings: infra-environments-and-workspaces (round 1)

Doc: `docs/sources/template-infra/infra-environments-and-workspaces.md`
Source: `.sources/template-infra`

## Section-by-section check

- `infra/README.md` — standing dev/staging/prod environments share root modules with different
  config + a per-environment S3 backend; `.tfbackend` naming (`dev.s3.tfbackend`,
  `shared.s3.tfbackend` for the build repository, `<account name>.<account id>.s3.tfbackend` for
  account-wide resources). Supported (README lines 51-59).
- `docs/infra/staging-and-production-environments.md` — account strategies (all non-prod share one
  account + dedicated prod account, OR every env its own account), VPC strategies (share one VPC,
  staging can skip and reuse dev's, OR each env its own VPC), reuse build repository, repeat
  database/service setup, and `staging.tf`/`prod.tf` settings (`network_name`, `service_cpu`,
  `service_memory`, `service_desired_instance_count`, `domain_name`). All supported.
- `docs/infra/develop-and-test-infrastructure-in-isolation-using-workspaces.md` — single `default`
  workspace by default, parallel resources without a new backend, workspace-name prefixing, deletion
  protection disabled in non-default workspaces, DNS records not created, and the full command
  workflow (`init -reconfigure -backend-config=dev.s3.tfbackend`, `workspace new`,
  `apply -var=environment_name=dev`, `destroy -var=environment_name=dev`, `workspace select default`,
  `workspace delete`). All supported; command flags match exactly.
- `docs/infra/pull-request-environments.md` — lifecycle (created on open/reopen, updated on new
  commits, destroyed on merge/close), endpoint + deployed commit posted to PR description, use cases
  (stakeholder review, e2e tests, accessibility checks, workspace creation for service-layer
  changes), shared dev database + Cognito user pool, the three limitations (shared-config not
  testable until merge to dev, mutual data visibility, migrations not run / isolate schema changes),
  and the two reusable workflows wired per-app. All supported; workflow files
  (`pr-environment-checks.yml`, `pr-environment-destroy.yml`) confirmed present in checkout.
- `docs/infra/temporary-environments-and-out-of-band-resources.md` — three temporary-env types
  (workspace-based, PR, CI end-to-end via `template-only-ci-infra.yml` with tests in `infra/test/`),
  out-of-band definition (external coordination / DNS NS records, 20-40 min provisioning, shared
  valuable state, global uniqueness), sharing vs exclusion strategies, cross-layer (service uses the
  database layer) vs same-layer (non-default workspaces share the default workspace's Cognito pool)
  sharing, exclusion of DNS records / custom domains and external-approval resources, default AWS
  URLs, and the decision framework (share if valuable shared state; else exclude with graceful
  degradation if the app can function without it; else design problem for the tech spec). All
  supported. `template-only-ci-infra.yml` and `infra/test/` confirmed present.
- `docs/infra/destroy-infrastructure.md` — destroy in reverse creation order with the account layer
  last; per-application layers within `infra/<APP_NAME>/service`; backend removal sequence
  (`force_destroy = true` + `prevent_destroy = false` -> `terraform apply` in `infra/accounts` ->
  comment out S3 backend block -> `terraform init -force-copy` -> `terraform destroy`
  `infra/accounts`). All supported (intro line 3 and steps 1-5).

## Findings

None. The doc is fully supported by the source.
