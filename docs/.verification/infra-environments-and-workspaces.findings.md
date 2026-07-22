# Verification findings: infra-environments-and-workspaces (round 1)

Doc: `docs/sources/template-infra/infra-environments-and-workspaces.md`
Source: `.sources/template-infra` @ `80a7cc8ec802c442098933f65280175b8453c659`

## Section-by-section check

- `infra/README.md` — standing dev/staging/prod share root modules with different config + a
  per-environment S3 backend; `.tfbackend` naming (`dev.s3.tfbackend`, `shared.s3.tfbackend` for the
  build repository, `<account name>.<account id>.s3.tfbackend` for account-wide resources). Supported
  (README lines 51-59).
- `docs/infra/staging-and-production-environments.md` — account strategies, VPC strategies (staging
  can reuse dev's VPC), reuse build repository, repeat setup, and `staging.tf`/`prod.tf` settings
  (`network_name`, `service_cpu`, `service_memory`, `service_desired_instance_count`, `domain_name`).
  Supported. See finding 1 on the "service setup" wording.
- `docs/infra/develop-and-test-infrastructure-in-isolation-using-workspaces.md` — single `default`
  workspace, parallel resources without a new backend, workspace-name prefixing, deletion protection
  disabled in non-default workspaces, DNS records not created, and the full command workflow. All
  supported; command flags match the source exactly.
- `docs/infra/pull-request-environments.md` — lifecycle, endpoint + deployed commit posted to PR
  description, use cases, shared dev database + Cognito user pool, the three shared-resource
  limitations, migration isolation guidance, and the two reusable workflows wired per-app. All
  supported.
- `docs/infra/temporary-environments-and-out-of-band-resources.md` — three temporary-env types,
  out-of-band definition, sharing vs exclusion strategies, cross-layer vs same-layer sharing,
  exclusion of DNS/custom domains and external-approval resources, default AWS URLs, and the decision
  framework. All supported.
- `docs/infra/destroy-infrastructure.md` — reverse creation order with the account layer last;
  service layer within `infra/<APP_NAME>/service`; backend removal sequence. Supported (intro line 3,
  steps 1-5). See finding 2 on the database-layer extension.

## Findings

### 1. (low) "database and service setup" renames the source's term

- Claim (line 47): "Repeat the database and service setup for each environment."
- Issue: The source says "Repeat the application database and application environment setup steps."
  The doc renames "application environment" setup to "service setup." Defensible (the service layer
  is the substance of app-env setup) but it swaps the source's own term.
- Evidence: `docs/infra/staging-and-production-environments.md:34`.
- Suggested fix: Use "application environment" to match the source.

### 2. (low) Destroy step extends beyond what the guide enumerates

- Claim (lines 130-133): "destroy each environment's per-application layers first ... you should
  destroy any other per-application layers (e.g. the database layer) in reverse creation order."
- Issue: `destroy-infrastructure.md` only spells out the `service` layer in step 1; the database
  layer is the doc's inference. Consistent with the source's "reverse order that they were created"
  principle and flagged as the doc's own guidance, so not a contradiction, but not directly stated.
- Evidence: `docs/infra/destroy-infrastructure.md:3,7`.
- Suggested fix: Soften to make clear the database-layer step is inferred from the reverse-order
  principle, not enumerated in the guide.
