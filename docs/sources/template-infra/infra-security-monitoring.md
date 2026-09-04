---
id: infra-security-monitoring
title: Security Monitoring — GuardDuty Threat Detection, S3 Malware Scanning, and Image Vulnerability Scans
source: template-infra
doc_type: guide
tags: [infra, security, guardduty, threat-detection, malware, s3, vulnerability-scanning, compliance]
related: [infra-overview, infra-security-and-access, infra-configuration, infra-capabilities, infra-module-architecture]
summary: The template's detective security controls — account-wide AWS GuardDuty threat detection, GuardDuty malware scanning of the application's S3 storage bucket, and the CI image-vulnerability and Terraform-compliance scanners.
source_ref:
  repo: https://github.com/navapbc/template-infra
  ref: 8b7bc3899c3a9ab1b3441330d72993cd34d21f70
  paths:
    - docs/infra/threat-detection.md
    - docs/infra/storage-malware-detection.md
    - docs/infra/vulnerability-management.md
    - docs/compliance.md
    - docs/system-architecture.md
    - infra/project-config/threat_detection.tf
    - infra/project-config/outputs.tf
    - infra/project-config/main.tf.jinja
    - infra/project-config/aws_services.tf
    - infra/accounts/main.tf
    - infra/accounts/variables.tf
    - infra/modules/threat_detection/main.tf
    - infra/modules/threat_detection/variables.tf
    - infra/modules/threat_detection/outputs.tf
    - infra/modules/storage/main.tf
    - infra/modules/storage/malware_detection.tf
    - infra/modules/storage/access_control.tf
    - infra/modules/storage/variables.tf
    - infra/{{app_name}}/app-config/main.tf
    - infra/{{app_name}}/app-config/dev.tf
    - infra/{{app_name}}/service/storage.tf
    - .github/workflows/vulnerability-scans.yml
    - .github/workflows/ci-{{app_name}}-vulnerability-scans.yml.jinja
last_documented: 2026-09-04
verified: ok
---

# Security Monitoring — GuardDuty Threat Detection, S3 Malware Scanning, and Image Vulnerability Scans

Where [infra-security-and-access](infra-security-and-access.md) covers the *preventive* controls
(who can reach what: IAM/OIDC, WAF, HTTPS, domains), this doc covers the *detective* controls: AWS
GuardDuty at the account layer, GuardDuty malware scanning on the application's S3 storage bucket,
and the CI scanners that inspect container images and Terraform before anything is deployed.
`{{app_name}}` and `<ENVIRONMENT>` are placeholders.

## Threat detection (AWS GuardDuty)

Per `docs/infra/threat-detection.md`, the account layer enables an **AWS GuardDuty detector**, which
continuously analyzes three data sources for malicious activity and unauthorized behavior:

- **AWS CloudTrail event logs** — API calls and user activity.
- **Amazon VPC Flow Logs** — network traffic patterns.
- **DNS logs** — domain name resolution requests.

Threat detection is **enabled by default**. GuardDuty is a *regional* service, so the detector covers
only the project's configured default region — `local.default_region` in the project config, exposed
as its `default_region` output (the rendered value comes from the `base_default_region` template
input in `infra/project-config/main.tf.jinja`).

Findings are read in the AWS Console under **GuardDuty → Findings**, where they can be filtered by
finding type, severity, or resource.

### Where it lives in the Terraform

The detector is a single resource — `aws_guardduty_detector` in the reusable
`infra/modules/threat_detection` child module — called from the **account layer**
(`infra/accounts/main.tf`) as `module "threat_detection"`. The module also exports `detector_id` and
`detector_arn`. Because there is one detector per account per region, the account layer is the
correct home for it (see the layer guidelines in
[infra-module-architecture](infra-module-architecture.md)).

`guardduty` is listed in `infra/project-config/aws_services.tf`, so the GitHub Actions IAM role is
permitted to manage it — see [infra-security-and-access](infra-security-and-access.md) for how that
service list scopes CI/CD permissions.

### Configuring it

Two settings control the detector:

| Setting | Default | Allowed values |
| --- | --- | --- |
| `enable_threat_detection` | `true` | `true`, `false` |
| `threat_detection_finding_publishing_frequency` | `"FIFTEEN_MINUTES"` | `"FIFTEEN_MINUTES"`, `"ONE_HOUR"`, `"SIX_HOURS"` |

The project-wide defaults are the locals in `infra/project-config/threat_detection.tf`, surfaced as
the project config's `threat_detection` output. Edit them there and apply the account layer:

```bash
make infra-update-current-account
```

The account layer additionally declares the same two names as Terraform **variables**
(`infra/accounts/variables.tf`); the frequency variable is validated against the three allowed
values, while `enable_threat_detection` is a `bool` defaulting to `null` with no validation block. An individual
account can override the project defaults on the command line or via a `.tfvars` file.

> **Gotcha in the override precedence.** In `infra/accounts/main.tf` the enable flag is
> `coalesce(var.enable_threat_detection, module.project_config.threat_detection.enabled)` — a null
> variable falls back to project config, as you'd expect. The frequency, however, is
> `var.enable_threat_detection == true ? var.threat_detection_finding_publishing_frequency : module.project_config.threat_detection.finding_publishing_frequency`.
> The variable's frequency therefore takes effect **only when `enable_threat_detection` is passed
> explicitly as `true`**; otherwise the project-config value wins even if you set the frequency
> variable. Setting the frequency in `infra/project-config/threat_detection.tf` — as
> `docs/infra/threat-detection.md` instructs — always works.

## Malware scanning for the application's S3 storage

Per `docs/infra/storage-malware-detection.md`, the template can put GuardDuty's **Malware Protection
for S3** in front of the application's storage bucket, so uploaded files are scanned continuously.
It is **off by default** and enabled per environment.

### What it does

1. **Objects are tagged with the scan result.** GuardDuty writes a
   `GuardDutyMalwareScanStatus` tag on each object — `NO_THREATS_FOUND` or `THREATS_FOUND`.
2. **Infected files become unreadable.** The bucket policy in
   `infra/modules/storage/access_control.tf` carries a `BlockMalwareThreats` statement that denies
   `s3:GetObject` and `s3:GetObjectVersion` to **all** principals for any object whose
   `GuardDutyMalwareScanStatus` tag equals `THREATS_FOUND`. (The same policy also carries a
   `RestrictToTLSRequestsOnly` statement denying non-TLS requests; its `resources` list is the
   bucket ARN alone, without a `/*` suffix, unlike `BlockMalwareThreats`.)
3. **A GuardDuty finding is generated**, carrying the finding id, severity (Low/Medium/High/
   Critical), finding type (e.g. `Malware:S3/MaliciousFile`), the affected bucket, object key and
   account, a timestamp, evidence, and recommended remediation.

Because the deny is enforced by the bucket policy, a caller that tries to read an infected object —
including via the AWS CLI — sees a bare permissions error rather than a malware message:

```
fatal error: An error occurred (403) when calling the HeadObject operation: Forbidden
```

Treat a 403 on an object you know exists as a likely malware block, and check the object's tags or
the GuardDuty findings.

### Enabling it

1. Turn the flag on. Each `infra/{{app_name}}/app-config/<ENVIRONMENT>.tf` passes
   `enable_storage_malware_scanning = local.enable_storage_malware_scanning`, so either replace that
   `local.enable_storage_malware_scanning` with `true` in the environment's `env-config` call (one
   environment), or flip the local in `infra/{{app_name}}/app-config/main.tf` (every environment).
2. Apply the service layer:

   ```bash
   make infra-update-app-service APP_NAME=<APP_NAME> ENVIRONMENT=<ENVIRONMENT>
   ```

The flag threads through the config modules as follows: `app-config/main.tf` declares a project-wide
`enable_storage_malware_scanning` local (default `false`) that each of `dev.tf`, `staging.tf`, and
`prod.tf` passes into its `env-config` module call, which republishes it inside `storage_config`;
`infra/{{app_name}}/service/storage.tf` passes that through to the `storage` module as
`enable_malware_scanning`. So flipping the local in `main.tf` turns scanning on for **every**
environment, while replacing `local.enable_storage_malware_scanning` with `true` in a single
`<ENVIRONMENT>.tf` turns it on for just that one. Scanning is not tied to a per-environment
`env-config` file the way notifications or feature flags are.

Inside the `storage` module, `infra/modules/storage/malware_detection.tf` creates (only when
`enable_malware_scanning` is true) an `aws_guardduty_malware_protection_plan` for the bucket with
`object_prefixes = []`, i.e. **every object in the bucket is scanned**, and with the `tagging` action
`ENABLED`. It also creates the IAM role GuardDuty assumes (`<bucket name>-gd-malware`, restricted to
the `malware-protection-plan.guardduty.amazonaws.com` service principal and the current account) and
that role's inline policy, granting it read plus object-tagging access to the bucket, `kms:Decrypt` /
`DescribeKey` / `GenerateDataKey` on the bucket's KMS key when called via S3, and the EventBridge
rule permissions GuardDuty needs for its `DO-NOT-DELETE-AmazonGuardDutyMalwareProtectionS3-*` rules.

### Auditing scan status

`docs/infra/storage-malware-detection.md` includes a shell script that walks every malware protection
plan in the account (`aws guardduty list-malware-protection-plans`), resolves each plan's protected
bucket, and lists any object tagged `THREATS_FOUND`:

```bash
aws s3api get-object-tagging --bucket "$bucket" --key "$key" \
  --query "TagSet[?Key=='GuardDutyMalwareScanStatus' && Value=='THREATS_FOUND'].Value" --output text
```

Findings themselves are read in the GuardDuty console, which requires threat detection to be enabled
in the account (above).

## Container image vulnerability scans (CI)

Per `docs/infra/vulnerability-management.md`, application images are scanned in CI **before** they
are pushed to ECR — ECR/Inspector scanning happens after the push, takes time, and can't scan an
image built `FROM scratch`. The reusable `.github/workflows/vulnerability-scans.yml` workflow runs
four scanners as separate jobs:

| Scanner | What it checks | Safelist file |
| --- | --- | --- |
| **hadolint** | The Dockerfile itself, for bad practices (fails at `warning`); no image build | `.hadolint.yaml` |
| **Trivy** | OS vulnerabilities and secrets in the built image (`ignore-unfixed`) | `.trivyignore`, plus `trivy-secret.yaml` for the secret scanner |
| **Anchore (Grype)** | Vulnerabilities in the built image; configured to ignore `not-fixed`, `wont-fix`, and `unknown` findings | `.grype.yml` |
| **Dockle** | Container lint / CIS-style checks on the built image (fails at `WARN`) | `.dockleconfig` — an *allow-files* list read from a `DOCKLE_ACCEPT_FILES=` line, so it suppresses whole files rather than finding types |

The three image scanners each build the release image themselves; a comment in the workflow notes it
can't hand a built image between jobs. The template ships a starter version of each safelist file at
the repo root, and every scanner resolves its config through the repo's `first-file` composite
action, which prefers a per-app override (`<APP_NAME>/.hadolint.yaml`, `<APP_NAME>/.trivyignore`,
`<APP_NAME>/.grype.yml`, `<APP_NAME>/.dockleconfig`) over the root file.

The workflow is invoked per application by `ci-<APP_NAME>-vulnerability-scans.yml` (generated from
`.github/workflows/ci-{{app_name}}-vulnerability-scans.yml.jinja`), which triggers on pull requests
and on pushes to `main` when the application directory or the `.grype.yml` / `.hadolint.yaml` /
`.trivyignore` safelists change (plus the two workflow files themselves). Note that `.dockleconfig`
and `trivy-secret.yaml` are consumed by `vulnerability-scans.yml` but are *not* trigger paths, so
editing either one alone does not kick off a scan. Scanning
on both events is deliberate: a CVE can be published between a PR's approval and its merge. (Note:
`docs/infra/vulnerability-management.md` still calls the workflow `ci-vulnerability-scans` and refers
to "the `app` directory"; in the current tree it is the per-app
`ci-<APP_NAME>-vulnerability-scans.yml` caller watching `<APP_NAME>/**`.)

### Shrinking the attack surface

The source doc recommends a multi-stage Dockerfile that ends in a `scratch` release stage, so the
deployed image carries only the files it needs:

```dockerfile
FROM ... AS build      # base installs shared by dev and app-build
FROM build AS dev      # local-development-only installs
FROM build AS app-build # everything the release image needs
FROM scratch AS release
# COPY --from=app-build /app-build/paths/to/files /release/paths/to/files
```

To trace a vulnerable system dependency of unknown origin:

```bash
grype --config .grype.yml -o json --fail-on medium "$image_name" |
  jq '.matches | map(.artifact | { name, version, "location": .locations[0].path })'
```

## Terraform compliance checks

Per `docs/compliance.md`, infrastructure code is checked against infrastructure policy with two
static-analysis tools, **Checkov** and **tfsec** (both installable via `brew`):

```bash
make infra-check-compliance          # runs both
make infra-check-compliance-checkov
make infra-check-compliance-tfsec
```

Checkov can also be wired into a local pre-commit hook. Deliberate exceptions are recorded inline as
`# checkov:skip=<CHECK_ID>:<reason>` comments next to the resource — see, for example, the skips on
`aws_s3_bucket.storage` in `infra/modules/storage/main.tf` and on `aws_guardduty_detector.main` in
`infra/modules/threat_detection/main.tf`.

## See also

- [infra-security-and-access](infra-security-and-access.md) — IAM/OIDC, WAF, HTTPS, custom domains,
  and outbound internet access.
- [infra-configuration](infra-configuration.md) — the project-config and app-config modules these
  toggles live in.
- [infra-capabilities](infra-capabilities.md) — the other optional, app-config-gated capabilities.
