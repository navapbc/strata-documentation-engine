# Verification Findings for strata-sdk-audit-log.md (Round 2)

Date: 2026-06-26
Status: **VERIFIED - NO FINDINGS**

## Summary

The document "Audit log" has been thoroughly verified against the source code and all claims are accurate, supported, and current.

## Verification Scope

The following areas were checked:

1. **API and Class Structure**
   - `Strata::AuditLog` (write API) - ✓ Verified in app/models/strata/audit_log.rb
   - `Strata::AuditLine` (model) - ✓ Verified in app/models/strata/audit_line.rb
   - `Strata::Auditable` (concern) - ✓ Verified in app/models/concerns/strata/auditable.rb
   - `Strata::VirtualActor` (marker module) - ✓ Verified in app/models/strata/virtual_actor.rb

2. **Block Form Behavior**
   - Opens ActiveRecord::Base.transaction - ✓ Code line 63
   - Yields a log object - ✓ Code line 64
   - Returns AuditLog with .lines populated - ✓ Spec verified
   - Raises ArgumentError if called without block - ✓ Code line 60, spec verified
   - Rolls back all appended lines on exception - ✓ Spec verified

3. **Single-Line Form (write!)**
   - Method signature matches documentation - ✓ Code line 75
   - Creates one line outside wrapper transaction - ✓ Code and spec verified
   - All parameters (action, actor, subject, data) work as documented - ✓ Verified

4. **Parameter Behavior**
   - action: required String - ✓ Code line 21 in audit_line.rb validates presence
   - subject: polymorphic, any AR record - ✓ Code line 15
   - actor: polymorphic, falls back to default - ✓ Code line 103
   - data: jsonb, nil coerced to {} - ✓ Code line 80, spec verified
   - PII screening responsibility documented - ✓ Documented correctly

5. **Querying History**
   - Auditable adds has_many association - ✓ Code line 21 in auditable.rb
   - opt-in (not in Strata::ApplicationForm) - ✓ Verified ApplicationForm does not include Auditable
   - Omits dependent: :destroy - ✓ Code line 7 comment in auditable.rb confirms intentional
   - All scopes exist and work: for_subject, by_actor, with_action, latest_first - ✓ Code lines 23-38 in audit_line.rb

6. **Immutability**
   - readonly? returns true once persisted - ✓ Code line 41 in audit_line.rb
   - update!/destroy raise ActiveRecord::ReadOnlyRecord - ✓ Spec verified
   - Application-level enforcement, not DB constraint - ✓ Confirmed in code

7. **Virtual Actors**
   - Strata::VirtualActor is a marker module - ✓ Code and spec verified
   - Stores class name in actor_type, nil in actor_id - ✓ Code lines 56-65 in audit_line.rb
   - Rounds-trips as VirtualActor::Instance - ✓ Code lines 45-51, spec verified
   - Instance#display_name humanizes class name - ✓ Code line 25 in virtual_actor.rb

8. **Schema**
   - UUID primary key with gen_random_uuid() - ✓ schema.rb line 62
   - action (string, not null) - ✓ schema.rb line 63
   - polymorphic subject_type/subject_id, nullable - ✓ schema.rb lines 64-65
   - polymorphic actor_type/actor_id, nullable - ✓ schema.rb lines 66-67
   - data (jsonb, not null, default {}) - ✓ schema.rb line 68
   - created_at only, no updated_at - ✓ schema.rb line 69
   - Index on (subject_type, subject_id, created_at DESC) - ✓ schema.rb line 72
   - Index on (actor_type, actor_id) - ✓ schema.rb line 70
   - Index on created_at - ✓ schema.rb line 71

9. **Installation**
   - bin/rails generate strata:audit_log - ✓ Generator exists and documented in audit_log_generator.rb
   - bin/rails db:migrate - ✓ Standard Rails command, correct

10. **Gotchas**
    - Nested transactions become savepoints - ✓ Correct Rails behavior, documented appropriately
    - after_commit fires only on outermost commit - ✓ Correct Rails behavior, documented appropriately
    - No cascade-delete - ✓ Intentional, documented in auditable.rb
    - Polymorphic class name drift - ✓ Correct, documented with concrete example
    - Thread safety of .lines - ✓ Correct, documented with appropriate caveats

## Conclusion

All documentation claims are supported by the source code. No inaccuracies, unsupported statements, or outdated information was found. The document provides accurate, comprehensive coverage of the Strata audit log feature.
