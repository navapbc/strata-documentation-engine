# Profile: sdk

The source is a reusable SDK/engine (the Strata SDK Rails engine). **It already ships
extensive docs under `docs/`** (getting-started, installation, strata-attributes, generators,
case-management-business-process, multi-page-form-flows, strata-audit-log, strata-rules-engine,
authorization, api-authentication, strata-form-builder, strata-sdk-components, …).

**Distill and index those existing docs — do not re-derive what they already explain.** Read
the code under `app/` and `lib/` only to (a) VERIFY the existing docs against the implementation
and (b) FILL GAPS where a public feature has no doc.

Produce docs under `docs/sources/<source-id>/`:

- One `doc_type: guide` "Getting started with the Strata SDK" — distilled from the SDK's
  `getting-started.md` / `installation.md`: prerequisites, minimal setup to consume the SDK,
  and a pointer to where its own docs live.
- One `doc_type: feature` per canonical feature key in `references/feature-keys.md`
  (business-process, task, case, application-form, determination, value-object, attributes,
  each attribute type, audit-log, rules-engine, policies, generators, …). For each: distill the
  relevant SDK doc, give the public API/usage surface and a minimal grounded snippet, and note
  gotchas. **Set `feature_keys: [<key>, ...]`** to the keys this doc DEFINES (one doc may own
  several, e.g. an "Attributes" doc owning `attribute-types/us-date` + `attribute-types/name`).

Use stable kebab ids like `strata-sdk-<feature>`. Cite exact paths (both the SDK doc and the
verifying code file) in `source_ref.paths`. Do not invent APIs — every claim must trace to a
file in the checked-out source. Where the SDK doc and the code disagree, document the code's
actual behavior and note the discrepancy.
