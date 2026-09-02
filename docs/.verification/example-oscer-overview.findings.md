# Verification findings: example-oscer-overview (round 1)

Doc: `docs/sources/oscer/overview.md`
Source: `.sources/oscer` @ `c53e711b80bdfcdd70046b6d9fd7abc3c2a9a750` (matches `source_ref.ref`)

## Result: no findings

The doc is fully supported by the source. Every load-bearing claim was re-verified:

- **All referenced paths exist** under `reporting-app/`: `business_processes/certification_business_process.rb`,
  `models/certification_case.rb`, `models/certification.rb`, `models/oscer_task.rb`,
  `models/oscer_application_form.rb`, `models/activity_report_application_form.rb`,
  `models/determination.rb`, `models/concerns/determinable.rb`, `models/rules/exclusion_ruleset.rb`,
  `services/exclusion_determination_service.rb`, `policies/strata/task_policy.rb`,
  `policies/{activity_report,exemption}_application_form_policy.rb`,
  `controllers/concerns/api_hmac_authentication.rb`, `adapters/doc_ai_adapter.rb`,
  `components/certification_cases/case_row_component.rb`, `components/staff/task_row_component.rb`.
- **Class inheritances verified**: `CertificationBusinessProcess < Strata::BusinessProcess`,
  `OscerTask < Strata::Task`, `OscerApplicationForm < Strata::ApplicationForm`,
  `{Member,MemberStatus,DocAiResult} < Strata::ValueObject`,
  `CertificationCases::CaseRowComponent < Strata::Cases::CaseRowComponent`,
  `Staff::TaskRowComponent < Strata::Tasks::TaskRowComponent`.
- **"three subclasses" of `OscerApplicationForm`** confirmed: `ActivityReportApplicationForm`,
  `ExemptionApplicationForm`, `DenialResponseApplicationForm`.
- **`certification.rb` code snippet** matches the source exactly (`include Determinable`,
  `after_create_commit` publishing `CertificationCreated`).
- **Three automated determination steps** (external exclusion, external exception, external
  community-engagement) and their `start`/transitions confirmed in the business process; the file's
  own comment confirms notifications flow via `NotificationsEventListener`
  (`services/notifications_event_listener.rb` exists).
- **Audit log + virtual actors**: `Determinable#record_determination!` calls `Strata::AuditLog.write!`;
  virtual-actor usage present in the CE/determination services.
- **`DocAiAdapter`** posts to the `v1/documents` endpoint; `DocAiResult` wraps the response.
- **Attribute types** (`money`, `year_month`, `us_date`, `name`, `array`) all appear in models;
  `range` appears as the `range: true` modifier on `strata_attribute` (e.g. `external_income_activity.rb`).
- **Out-of-scope paths** all exist (`services/doc_ai_*`, `adapters/storage/*`, `adapters/auth/*`,
  `services/auth_service.rb`, `services/member_oidc_provisioner.rb`, `forms/users/`).
