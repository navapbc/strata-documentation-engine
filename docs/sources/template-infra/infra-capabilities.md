---
id: infra-capabilities
title: Application Capabilities — Notifications, Identity, Jobs, Monitoring, Service Exec
source: template-infra
doc_type: guide
tags: [infra, notifications, ses, sms, cognito, identity-provider, background-jobs, monitoring, ecs-exec, bedrock, feature-flags]
related: [infra-overview, infra-getting-started, infra-configuration, infra-security-and-access, infra-security-monitoring, infra-environments-and-workspaces]
summary: Optional application capabilities the template can enable — SES email and AWS End User Messaging SMS notifications, Cognito identity provider, EventBridge background jobs, CloudWatch monitoring alerts, ECS Exec service command execution, Bedrock document data extraction, and Parameter Store feature flags.
source_ref:
  repo: https://github.com/navapbc/template-infra
  ref: 8b7bc3899c3a9ab1b3441330d72993cd34d21f70
  paths:
    - docs/infra/notifications.md
    - docs/infra/sms-notifications.md
    - docs/infra/identity-provider.md
    - docs/infra/background-jobs.md
    - docs/infra/monitoring-alerts.md
    - docs/infra/service-command-execution.md
    - docs/infra/document-data-extraction.md
    - docs/infra/storage-malware-detection.md
    - docs/decisions/infra/2025-01-09-notifications-architecture.md
    - docs/decisions/infra/2026-02-19-sms-notifications-implementation.md
    - docs/feature-flags.md
    - docs/decisions/infra/2023-11-28-feature-flags-system-design.md
    - infra/modules/feature_flags/main.tf
    - infra/modules/feature_flags/variables.tf
    - infra/{{app_name}}/app-config/env-config/feature_flags.tf
    - infra/{{app_name}}/app-config/env-config/variables.tf
    - infra/{{app_name}}/service/feature_flags.tf
last_documented: 2026-09-04
verified: ok
---

# Application Capabilities

Beyond the core compute/network/database stack, the template can enable several optional
capabilities, each toggled in the app-config modules and applied via the service (or network) layer.
This doc distills the corresponding `docs/infra` guides. `{{app_name}}` and `<ENVIRONMENT>` are
placeholders.

## Email notifications (SES)

Per `docs/infra/notifications.md`, notifications use Amazon SES and require **custom domains** first
(the sender address needs a domain — see [infra-security-and-access](infra-security-and-access.md)).
To enable:

1. Set `enable_notifications = true` in `infra/{{app_name}}/app-config/main.tf`.
2. Configure `sender_display_name`, `sender_email` (defaults to `notifications@<domain_name>`), and
   `reply_to_email` in `infra/{{app_name}}/app-config/env-config/notifications.tf`.
3. `make infra-update-app-service APP_NAME=<APP_NAME> ENVIRONMENT=<ENVIRONMENT>`.

Test with the SES v2 CLI using the environment's from-address:

```bash
bin/terraform-init "infra/<APP_NAME>/service" "<ENVIRONMENT>"
FROM_EMAIL="$(terraform -chdir=infra/<APP_NAME>/service output -raw ses_from_email)"
aws sesv2 send-email --from-email-address "$FROM_EMAIL" \
  --destination "ToAddresses=<RECIPIENT_EMAIL>" \
  --content '{
    "Simple": {
      "Subject": {"Data":"Test notification","Charset":"UTF-8"},
      "Body": {
        "Text": {"Data":"This is a message from the future","Charset":"UTF-8"},
        "Html": {"Data":"<p>This is a message from the future</p>","Charset":"UTF-8"}
      }
    }
  }'
```

The notifications architecture is described in ADR `2025-01-09`.

## SMS notifications (AWS End User Messaging)

Per `docs/infra/sms-notifications.md` and ADR `2026-02-19`, the application can also send SMS via
the AWS End User Messaging (pinpoint-sms-voice-v2) service. Sending real SMS requires an AWS End
User Messaging registration (region-specific, AWS-provisioned phone numbers only; approval takes
1–15 days). To enable:

1. Set `enable_sms_notifications = true` in `infra/{{app_name}}/app-config/main.tf`.
2. In the environment config that calls the `env-config` module (e.g.
   `infra/{{app_name}}/app-config/dev.tf`) set `sms_sender_phone_number_registration_id` and
   `sms_number_type`. Leaving the registration id `null` provisions an AWS **simulator** phone
   number for dev testing. (Upstream `docs/infra/sms-notifications.md` labels this path
   `app-config/env-config/dev.tf`; there is no `dev.tf` in `env-config/`, which holds only the
   module's own files.)
3. `make infra-update-app-service APP_NAME=<APP_NAME> ENVIRONMENT=<ENVIRONMENT>`.

This provisions an SMS configuration set, a phone pool (reused across temporary environments),
CloudWatch delivery-receipt log groups, least-privilege IAM, and a VPC endpoint. The infrastructure
injects `AWS_SMS_CONFIGURATION_SET_NAME`, `AWS_SMS_PHONE_POOL_ARN`, and `AWS_SMS_PHONE_POOL_ID` into
the service. Simulator originators can only send to AWS's test destinations (`+14254147755` →
success, `+14254147167` → blocked), and sandbox accounts must verify destination numbers first.

## Identity provider (Cognito)

Per `docs/infra/identity-provider.md`, applications that need their own authentication (rather than
relying solely on external SSO) can use an Amazon Cognito user pool. It is recommended to set up
notifications first, so account-verification and password-reset emails don't hit Cognito's default
daily email limits. To enable:

1. Set `enable_identity_provider = true` in `infra/{{app_name}}/app-config/main.tf`.
2. Configure settings in `infra/{{app_name}}/app-config/env-config/identity_provider.tf`.
3. `make infra-update-app-service APP_NAME=<APP_NAME> ENVIRONMENT=<ENVIRONMENT>`.

The Cognito user pool is **shared** by temporary environments (same-layer sharing of the default
workspace's pool), so identity-provider config changes in a PR aren't reflected until merged — see
[infra-environments-and-workspaces](infra-environments-and-workspaces.md).

## Background jobs (EventBridge)

Per `docs/infra/background-jobs.md`, background jobs are configured in the application's `env-config`
module. Jobs reuse the service's container image and configuration, overriding only the entry point
via the job's `task_command`. Two supported kinds:

- **File upload jobs** — AWS EventBridge listens for S3 "Object Created" events and runs an on-demand
  ECS task per event. The `task_command` can reference the triggering file via the template values
  `<bucket_name>` and `<object_key>`. Configured under `file_upload_jobs`.
- **Scheduled jobs** — EventBridge triggers AWS Step Functions on a recurring `schedule_expression`
  (cron or rate). Optional retries, chained jobs, and timezone are supported but off by default.

(Continuously-running worker tasks consuming a queue are described as **not yet implemented**.)

## Monitoring alerts (CloudWatch)

Per `docs/infra/monitoring-alerts.md`, the monitoring module defines metric-based alerting and
supports both email alerts and an external incident-management service:

- **Email alerts:** set `email_alert_recipients` in
  `infra/{{app_name}}/app-config/env-config/monitoring.tf`, then
  `make infra-update-app-service APP_NAME=<APP_NAME> ENVIRONMENT=<ENVIRONMENT>`.
- **Incident management (Splunk On-Call / PagerDuty):** set `has_incident_management_service = true`
  in `app-config/main.tf`, store the integration webhook URL in SSM with
  `make infra-configure-monitoring-secrets APP_NAME=<APP_NAME> ENVIRONMENT=<ENVIRONMENT> URL=<WEBHOOK_URL>`,
  then apply the service. Alarms publish to an SNS topic consumed by the incident service (see
  [infra-overview](infra-overview.md)).

## Service command execution (ECS Exec)

Per `docs/infra/service-command-execution.md`, the template supports interactive access to a running
service container via ECS Exec — useful for debugging or reaching an attached database. **Not
recommended in production.** To enable:

1. Set `enable_command_execution = true` in the environment's config file under
   `infra/{{app_name}}/app-config` (e.g. `dev.tf`).
2. `make infra-update-network NETWORK_NAME=<NETWORK_NAME>` (ECS Exec needs an extra VPC endpoint).
3. `make infra-update-app-service APP_NAME=<APP_NAME> ENVIRONMENT=<ENVIRONMENT>`.

Then open a shell (requires the AWS CLI Session Manager plugin):

```bash
aws ecs execute-command --cluster <CLUSTER_NAME> --task <TASK_ID> \
  --container <CONTAINER_NAME> --interactive --command "/bin/sh"
```

If it fails, verify `enableExecuteCommand` is `true` on the task and that the SSM agent
(`managedAgents`) is running, via `aws ecs describe-tasks`.

## Document data extraction (Bedrock Data Automation)

Per `docs/infra/document-data-extraction.md`, the template can set up resources (the
`infra/modules/document-data-extraction` module) for identifying and extracting data from documents
(images and PDFs) using AWS **Bedrock Data Automation (BDA)**. To enable:

1. Set `enable_document_data_extraction = true` in `infra/{{app_name}}/app-config/main.tf`.
2. Tune settings — notably the `blueprints` list — in
   `infra/{{app_name}}/app-config/env-config/document_data_extraction.tf`. By default any files in
   `infra/{{app_name}}/service/document-data-extraction-blueprints/` are loaded as custom BDA
   blueprints; you can also reference pre-built AWS catalog blueprints by ARN.
3. `make infra-update-app-service APP_NAME=<APP_NAME> ENVIRONMENT=<ENVIRONMENT>`.

Because of an upstream provider limitation, changes to the BDA project's blueprint list are ignored
(`ignore_changes`) to suppress a perpetual diff. Consequently, adding, removing, or changing
blueprints (especially **deleting a custom blueprint source file**) requires the extra manual steps
the source doc spells out — temporarily un-ignoring `custom_output_configuration.blueprints` in
`infra/modules/document-data-extraction/resources/main.tf` — to avoid a destroy error on a blueprint
still referenced by the project.

## Feature flags (SSM Parameter Store)

Per `docs/feature-flags.md`, feature flags let in-progress work merge to the main branch while
keeping it deployable, decoupling deploys from releases (trunk-based development). The template
stores each flag as an **SSM Parameter Store** parameter and injects it into the container:

1. Declare the flag and its default in the `feature_flag_defaults` map. The upstream doc points at
   `infra/<APP_NAME>/app-config/feature_flags.tf`, but in the source tree the map lives one level
   down, in `infra/{{app_name}}/app-config/env-config/feature_flags.tf`.
2. Optionally override a flag for one environment by passing `feature_flag_overrides` to that
   environment's `env-config` module call (e.g. in `dev.tf`). A variable validation rejects any
   override key that isn't declared in `feature_flag_defaults`, so overrides can't silently typo
   into nothing.
3. The value updates on the next `terraform apply` of the service layer, or the next application
   deploy.

The `feature_flags` child module creates one `aws_ssm_parameter` per flag at
`/service/<SERVICE_NAME>/feature-flag/<FLAG_NAME>`. The service layer wires each parameter into the
task definition as `FF_<FLAG_NAME>` (via the container definition's `secrets` list, so the value is
resolved at task start rather than baked into the task definition). Application code reads the
environment variable `FF_<FLAG_NAME>` and compares against the strings `"true"` / `"false"`.

> **The ADR no longer matches the implementation.** ADR `2023-11-28` (feature flags system design)
> selected AWS CloudWatch Evidently, managed in the AWS Console outside Terraform, specifically to
> get percentage-based gradual rollouts and A/B tests that product owners could adjust without a
> deploy. What ships today is the much simpler Parameter Store mechanism above: boolean flags,
> declared in Terraform, with no throttle percentage, no per-user assignment, and no
> `isFeatureEnabled(feature, userId)` entity resolution. Treat the ADR as historical context for
> *why* the project wants feature flags, not as a description of the current module.

## Storage malware scanning

The application's S3 storage bucket can have GuardDuty malware scanning enabled per environment via
`enable_storage_malware_scanning`. It is covered with the rest of the detective controls in
[infra-security-monitoring](infra-security-monitoring.md).
