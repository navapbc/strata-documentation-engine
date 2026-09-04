# Verification findings: example-oscer-value-objects (round 2)

Doc: docs/sources/oscer/value-objects.md
Source checkout: .sources/oscer @ be3ffbb4e7b7e7cf0b4047af5544870f50619257
Files read: reporting-app/app/models/member.rb, reporting-app/app/models/member_status.rb,
reporting-app/app/models/doc_ai_result.rb, reporting-app/app/models/doc_ai_result/payslip.rb,
reporting-app/app/adapters/doc_ai_adapter.rb, reporting-app/lib/value_object.rb

**Status**: No findings. Round 1 issue resolved. All claims verified against source.

## Round 1 follow-up

The low-severity finding from round 1 has been **fixed**. The text now reads (lines 32–34):

> Only these three classes extend `Strata::ValueObject` directly (plus `DocAiResult`'s own
> subclasses, such as `DocAiResult::Payslip` in `reporting-app/app/models/doc_ai_result/payslip.rb`).

This eliminates the ambiguity by explicitly stating "directly" and clarifying that subclasses are
indirect descendants.

## Verified claims

- **Base-class distinction**: `reporting-app/lib/value_object.rb` is a separate `ValueObject` base
  including `ActiveModel::Model`, `ActiveModel::Attributes`, `ActiveModel::Serializers::JSON`, with
  `==` comparing `as_json` (lines 5–17), and the TODO comment "very similar to Strata::ValueObject,
  possibly can be replace by it, but need a place to iterate for now" (lines 3–4). The named
  consumers all check out: `Determinations::*` (hours/income/external-CE determination data),
  `Verification::DataSourceResult` and `OrchestrationResult`, `Api::*` request/response models, and
  `Certifications::*` data objects all subclass the bare `ValueObject`.
- **Member** (`member.rb:6–32`): three `strata_attribute`s (`member_id`, `email`, `name` with the
  `:name` type), and the three factory methods `from_certification`, `find_by_member_id`,
  `search_by_email`. Code block matches source. The `:name` type resolves to `Strata::Name` —
  confirmed in the SDK checkout (`app/models/strata/name.rb`,
  `app/lib/strata/attributes/name_attribute.rb`).
- **MemberStatus** (`member_status.rb`): four `strata_attribute`s (`status`,
  `determination_method`, `reason_codes` and `human_readable_reason_codes` both `array: true`,
  lines 53–56); `latest_determination` is a plain `attr_accessor` (line 62); the `validates :status`
  inclusion list matches exactly (lines 64–65); derived methods `dashboard_report_status` and
  `certification_period_completed?` exist (lines 69, 81). Every one of the four consequences the doc
  lists (excluded from `#attributes`, `#blank?`, `Strata::ValueObject#==`, JSON serialization) is
  stated verbatim in the class comment at lines 17–23, including the "compare equal" claim (lines
  20–22). The stated rationale (primitive-only `ActiveModel::Attributes` backing; a `Determination`
  should not affect `#blank?`) matches lines 58–61.
- **DocAiResult** (`doc_ai_result.rb`): nine `strata_attribute`s in the doc's code block match
  lines 26–34 exactly, including the two `# present when status == "failed"` trailing comments;
  `attr_reader :fields` (line 38) with the hash frozen in `build` (line 59); `from_response`
  dispatching via `REGISTRY.fetch(response["matchedDocumentClass"], DocAiResult)` then `klass.build`
  (lines 42–45) matches the doc's snippet.
- **DocAiAdapter** (`doc_ai_adapter.rb:30`): posts to `v1/documents` via
  `post_document`, confirming the doc's integration description.
- **Frontmatter**: `source_ref.ref` (`be3ffbb4…`) matches the checkout HEAD; all four listed paths
  exist.
