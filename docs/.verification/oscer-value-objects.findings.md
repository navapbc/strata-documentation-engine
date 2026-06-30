# Verification findings: oscer-value-objects (round 1)

Doc: `docs/sources/oscer/value-objects.md`
Source checkout: `.sources/oscer`

## Result: no findings

All claims in the doc are supported by the source files:

- **Member** (`reporting-app/app/models/member.rb`): class definition, `strata_attribute :member_id/:email/:name` (including the `:name` typed attribute), and the `from_certification` factory match the source exactly. Finder methods correctly noted as omitted for brevity.
- **MemberStatus** (`reporting-app/app/models/member_status.rb`): `strata_attribute` status fields and `attr_accessor :latest_determination` match the source. The "two distinct reasons" framing — technical constraint (`ActiveModel::Attributes` only handles primitive types) and design preference (keeping it out of `#blank?`, which inspects `attributes.values`) — is directly supported by the source comment (lines 58-61). The claim that `latest_determination` is excluded from `#attributes`, `#blank?`, `#==`, and JSON serialization is confirmed by the model's own docstring (lines 17-23).
- **DocAiResult** (`reporting-app/app/models/doc_ai_result.rb`): envelope `strata_attribute`s, the `REGISTRY.fetch(response["matchedDocumentClass"], DocAiResult)` factory dispatch in `from_response`, and the raw `fields` hash held outside the attribute set (set via `instance_variable_set` and frozen in `build`, line 59) all match. The doc's snippet omits FieldValue/REGISTRY details, clearly marked with `# ...`.

No inaccurate, unsupported, or outdated statements found.
