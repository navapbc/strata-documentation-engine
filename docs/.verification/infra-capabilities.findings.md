# Verification findings: infra-capabilities (round 1)

Doc: `docs/sources/template-infra/infra-capabilities.md`
Source: `.sources/template-infra` @ `80a7cc8ec802c442098933f65280175b8453c659` (matches `source_ref.ref`)

## Result: PASS — no findings

Every claim was re-checked against the source files listed in the doc frontmatter. All are supported.

### Verified claims by section

- **Email (SES)**: `enable_notifications = true` in `app-config/main.tf`; `sender_display_name`,
  `sender_email` (defaults `notifications@<domain_name>`), `reply_to_email` in
  `env-config/notifications.tf`; custom-domains prerequisite; `make infra-update-app-service`; test
  command all match `docs/infra/notifications.md`. ADR `2025-01-09` exists.
- **SMS (AWS End User Messaging / pinpoint-sms-voice-v2)**: region-specific, AWS-provisioned-only,
  1–15 day approval; `enable_sms_notifications = true` in `main.tf`;
  `sms_sender_phone_number_registration_id` / `sms_number_type` in `env-config/dev.tf`; null →
  simulator; provisions config set, reused phone pool, CloudWatch delivery-receipt log groups,
  least-privilege IAM, VPC endpoint; injects `AWS_SMS_CONFIGURATION_SET_NAME`,
  `AWS_SMS_PHONE_POOL_ARN`, `AWS_SMS_PHONE_POOL_ID`; simulator destinations `+14254147755` (success) /
  `+14254147167` (blocked); sandbox verification — all match `docs/infra/sms-notifications.md` and ADR
  `2026-02-19` (both exist).
- **Identity provider (Cognito)**: `enable_identity_provider = true`; notifications-first
  recommendation (email limits) matches `docs/infra/identity-provider.md`. Shared-pool claim and
  "config changes in a PR aren't reflected until merged" are supported by
  `docs/infra/pull-request-environments.md` (lines 25, 31).
- **Background jobs (EventBridge)**: file-upload jobs (S3 Object Created, on-demand ECS task,
  `<bucket_name>`/`<object_key>`, `file_upload_jobs`), scheduled jobs (Step Functions,
  `schedule_expression`, retries/chaining/timezone off by default), continuous worker "not yet
  implemented" — all match `docs/infra/background-jobs.md`.
- **Monitoring (CloudWatch)**: `email_alert_recipients` in `env-config/monitoring.tf`;
  `has_incident_management_service = true` in `main.tf`; `make infra-configure-monitoring-secrets`;
  Splunk On-Call / PagerDuty — match `docs/infra/monitoring-alerts.md`. SNS-topic claim confirmed in
  `infra/modules/monitoring/main.tf` (alarm_actions publish to `aws_sns_topic.this`).
- **ECS Exec**: `enable_command_execution = true` in env config file; `infra-update-network`;
  `infra-update-app-service`; not recommended in prod; `execute-command` shell; troubleshooting
  (`enableExecuteCommand`, `managedAgents`) — match `docs/infra/service-command-execution.md`.
- **Document data extraction (Bedrock Data Automation)**: `enable_document_data_extraction = true`;
  `blueprints` list in `env-config/document_data_extraction.tf`; default blueprint dir; catalog ARNs;
  `ignore_changes` on blueprint list; deleting a custom source file requires temporarily un-ignoring
  `custom_output_configuration.blueprints` in
  `infra/modules/document-data-extraction/resources/main.tf` — match
  `docs/infra/document-data-extraction.md`.
