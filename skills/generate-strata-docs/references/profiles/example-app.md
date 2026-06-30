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
