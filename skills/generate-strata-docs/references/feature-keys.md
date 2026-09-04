# Strata SDK feature keys

Canonical, kebab-case keys for the SDK's public surface. The single shared vocabulary:
`sdk` docs tag what they DEFINE with `feature_keys: [..]`; `example-app` docs tag what they
SHOW with `demonstrates: [..]`. `lint_docs.py` hard-fails on any value not listed here, and
`build_graph.py` resolves each `demonstrates` key to the owning `sdk` doc as an `example-of`
edge. Each key traces to a real file in `strata-sdk-rails`.

**Every unprefixed key below is scoped to the Rails SDK.** Only `strata-sdk-rails` docs (profile
`sdk`) may claim them via `feature_keys`; a doc for any other SDK (e.g. the TypeScript
`strata-sdk-case-management`, profile `sdk-typescript`) sets `feature_keys: []` even where the
domain vocabulary overlaps (`case`, `task`). `lint_docs` hard-fails when two docs claim the same key,
so a second SDK that needs its own feature vocabulary gets a namespaced key set added here first
(e.g. `cm-ts/case-type-config`), never a share of the Rails keys.

```
business-process            # app/models/strata/business_process.rb
task                        # app/models/strata/task.rb
task/applicant-task         # app/models/strata/applicant_task.rb
task/staff-task             # app/models/strata/staff_task.rb
task/system-process         # app/models/strata/system_process.rb
task/third-party-task       # app/models/strata/third_party_task.rb
case                        # app/models/strata/case.rb
application-form            # app/models/strata/application_form.rb
determination               # app/models/strata/determination.rb
value-object                # app/models/strata/value_object.rb
attributes                  # app/lib/strata/attributes.rb (the strata_attribute DSL)
attribute-types/address     # app/lib/strata/attributes/address_attribute.rb
attribute-types/money       # app/lib/strata/attributes/money_attribute.rb
attribute-types/name        # app/lib/strata/attributes/name_attribute.rb
attribute-types/us-date     # app/lib/strata/attributes/us_date_attribute.rb
attribute-types/memorable-date  # app/lib/strata/attributes/memorable_date_attribute.rb
attribute-types/tax-id      # app/lib/strata/attributes/tax_id_attribute.rb
attribute-types/year-month  # app/lib/strata/attributes/year_month_attribute.rb
attribute-types/year-quarter   # app/lib/strata/attributes/year_quarter_attribute.rb
attribute-types/range       # app/lib/strata/attributes/range_attribute.rb
attribute-types/array       # app/lib/strata/attributes/array_attribute.rb
application-form-flow        # app/models/strata/flows/application_form_flow.rb
form-builder                # docs/strata-form-builder.md
components                  # docs/strata-sdk-components.md
audit-log                   # app/models/strata/audit_log.rb
virtual-actor               # app/models/strata/virtual_actor.rb
concerns/auditable          # app/models/concerns/strata/auditable.rb
concerns/determinable       # app/models/concerns/strata/determinable.rb
concerns/step               # app/models/concerns/strata/step.rb
rules-engine                # app/models/strata/rules_engine.rb
policies                    # app/policies/strata/application_form_policy.rb
auth                        # lib/strata/auth.rb, docs/api-authentication.md
generators                  # lib/generators/strata/* (11 generators)
```

## Thresholds for judgment-prone keys

- **`components`**: tag it when the app renders an SDK ViewComponent or shared template as a
  load-bearing part of its UI (`Strata::Flows::TaskListComponent`, `Strata::Cases::IndexComponent`,
  the shared `strata/application_forms` index/show templates, `Strata::US::AccordionComponent`).
  Incidental row/cell sub-components rendered inside another SDK component
  (`CaseRowComponent`/`TaskRowComponent` on their own) are **not** a `components` demonstration.
  When tagged, put it on a standalone `components` example doc so the key has one owner.

## Deliberately excluded

- **`Strata::EventManager` (`publish`/`subscribe`)** is intentionally **not** a feature key. It is
  treated as app-private surface, not part of the SDK's public cross-link vocabulary. Documenters
  should fold its usage into the relevant business-process / case docs and **not** flag a missing
  key for it. (Recorded after curation flagged the absent `events` key on two runs; revisit only if
  `EventManager` becomes intended public SDK surface.)
