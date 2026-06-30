---
id: infra-capabilities
title: Application Capabilities — Notifications, Identity, Jobs, Monitoring, Service Exec
source: template-infra
doc_type: guide
tags: [infra, notifications, ses, sms, cognito, identity-provider, background-jobs, monitoring, ecs-exec, bedrock]
related: [infra-overview, infra-getting-started, infra-configuration, infra-security-and-access, infra-environments-and-workspaces]
summary: Optional application capabilities the template can enable — SES email and AWS End User Messaging SMS notifications, Cognito identity provider, EventBridge background jobs, CloudWatch monitoring alerts, ECS Exec service command execution, and Bedrock document data extraction.
source_ref:
  repo: https://github.com/navapbc/template-infra
  ref: d2b569e3eef126514745b0e0e5d92a8739d0c6f2
  paths:
    - docs/infra/notifications.md
    - docs/infra/sms-notifications.md
    - docs/infra/identity-provider.md
    - docs/infra/background-jobs.md
    - docs/infra/monitoring-alerts.md
    - docs/infra/service-command-execution.md
    - docs/infra/document-data-extraction.md
    - docs/decisions/infra/2025-01-09-notifications-architecture.md
    - docs/decisions/infra/2026-02-19-sms-notifications-implementation.md
verified: ok
last_documented: 2026-06-29
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
2. In the environment's `env-config` (e.g. `infra/{{app_name}}/app-config/env-config/dev.tf`) set
   `sms_sender_phone_number_registration_id` and `sms_number_type`. Leaving the registration id
   `null` provisions an AWS **simulator** phone number for dev testing.
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
(images and PDFs) using AWS **Bedrock Data Automation (BDA)**. This is an in-template capability built on AWS Bedrock Data Automation (BDA). To enable:

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
