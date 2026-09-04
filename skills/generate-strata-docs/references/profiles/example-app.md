# Profile: example-app

The source is an application that consumes the Strata SDK (e.g. OSCER). Document **examples of
how specific SDK features are implemented** in this app.

Produce docs under `docs/sources/<source-id>/`, primarily `doc_type: example`:

- One example doc per SDK feature the app demonstrates (business process, task, case,
  application form, value object, determination, audit log, rules engine, typed attributes,
  authorization, etc.). Show the real code from the app (models, controllers, forms, configs)
  that implements the feature, with file paths in `source_ref.paths`.
- In each example's **`demonstrates`**, list the matching canonical **feature key(s)** from
  `references/feature-keys.md` (e.g. `demonstrates: [business-process]`). The graph builder
  resolves each key to the owning `sdk` doc and emits an `example-of` edge.
- **Do NOT put an SDK doc id in `related`** to express "example of" — the SDK docs are written
  concurrently in the same run and their ids may not exist yet. `related` is only for
  free-form links to other docs of THIS app.

To find what to document, grep the app for SDK usage (`Strata::` symbols, `strata_attribute`
declarations, subclasses of `Strata::*`). Document what the app actually does — do not
generalize beyond the code present in the checked-out source.

**Tag only feature keys whose SDK symbol you can grep in the app.** An app may legitimately use a
tiny slice of the SDK; leave a key off rather than forcing a near-match. Two traps:

- An `ApplicationFormFlow`'s `task` DSL (`task :name do … end` inside a flow) is part of
  `application-form-flow`, **not** the `task` (`Strata::Task`) feature.
- An app-local component with an SDK-sounding name is not the SDK feature. Model reasoning (from
  `strata-paidleave`): *"the app's rules engine is an external HTTP service reached through
  `RulesEngine::Adapter`; no code references `Strata::RulesEngine`"* — so `rules-engine` was
  correctly left off.

**Doc count follows the app's SDK surface, with no target number:** one example doc per feature key
(or per coherent key cluster) the app demonstrates, so the graph has exactly one owner per key. A
one-form starter app may yield 4 docs; a full-surface app with flows, a business process, a staff
dashboard, and an API may yield 13.

A **targeted, read-only** look outside the declared `subpaths` (a migration, an initializer, a
config file) is allowed when it is needed to verify a claim about in-scope code; note it in the log.
