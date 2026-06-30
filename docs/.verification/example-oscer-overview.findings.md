# Verification findings: example-oscer-overview (round 2)

Doc: `docs/sources/oscer/overview.md`
Source: `.sources/oscer` @ `a4fc94b35ed737d20ca4530efe20d579ce5f0d53` (SHA matches frontmatter)

## Status

**All findings from round 1 have been resolved.** The documentation paths are now accurate:
- `app/policies/strata/task_policy.rb` ✓ (correct - task_policy.rb is under strata/)
- `app/policies/*_application_form_policy.rb` ✓ (correct - form policies are directly under app/policies/)

## Comprehensive verification completed

Verified against source checkout:

### Models and inheritance
- ✓ `Certification < ApplicationRecord` with `include Determinable` mixin
- ✓ `CertificationCase < Strata::Case` with all documented methods
- ✓ `OscerTask < Strata::Task`
- ✓ `Determination < Strata::Determination`
- ✓ `Member < Strata::ValueObject`
- ✓ `MemberStatus < Strata::ValueObject`

### Application forms
- ✓ `ActivityReportApplicationForm < Strata::ApplicationForm`
- ✓ `ExemptionApplicationForm < Strata::ApplicationForm`
- ✓ `DenialResponseApplicationForm < Strata::ApplicationForm`

### Event handling & domain logic
- ✓ `after_create_commit` in Certification publishes `CertificationCreated` event (matches doc exactly)
- ✓ `NotificationsEventListener` subscribes to domain events (confirmed in services/notifications_event_listener.rb)
- ✓ `Strata::EventManager.publish` calls throughout business process

### Rules & attributes
- ✓ `Rules::ExemptionRuleset < Strata::Rules::MedicaidRuleset` with documented predicates
- ✓ Strata attributes with types: `:year_month` (activity_report_application_form.rb:14-16), `:us_date` with range (external_income_activity.rb:26), `:money` (income_activity.rb), `:name` (activity.rb:23)
- ✓ `ExemptionDeterminationService` includes `Strata::VirtualActor` (line 4)

### Authorization & API
- ✓ `Strata::TaskPolicy` in app/policies/strata/task_policy.rb
- ✓ Application form policies under app/policies/ (activity_report_application_form_policy.rb, exemption_application_form_policy.rb)
- ✓ `ApiHmacAuthentication` concern with Strata::Auth::Strategies::Hmac

### Audit & compliance
- ✓ `Strata::AuditLog.write!` in determinable.rb:70-75 with action namespacing (case.exemption.denied, case.determination.approved, etc.)
- ✓ Virtual actor pattern used in multiple services (ExemptionDeterminationService, CommunityEngagementCheckService, ExternalIncomeActivityService)

### Out-of-scope documentation
- ✓ All out-of-scope paths verified: doc_ai_adapter.rb, auth adapters, storage adapters, auth_service.rb, member_oidc_provisioner.rb, forms/users/

## No issues found

All documentation claims are supported by the source code. The doc accurately describes OSCER's use of the Strata SDK.
