# Nava Platform components

Canonical, kebab-case ids for the Nava Platform building blocks. The shared vocabulary for the
platform-composition axis: a doc tags what it DEFINES with `component_keys: [..]`; `platform-cli`
docs tag what they install/update with `manages: [..]`; app/infra docs tag what they compose with
via `integrates_with: [..]`. `lint_docs.py` hard-fails on any value not listed here, and
`build_graph.py` resolves each `manages`/`integrates_with` id to the owning doc as a
`manages` / `integrates-with` edge.

The Next.js/Flask ids are listed as **canonical even though they are not documented sources**: both
templates are **soft-deprecated** and were removed from the manifest, but the `nava-platform` CLI
can still install them, so they stay here to keep `platform-cli`'s `manages` references valid. A
`manages: [template-application-nextjs]` reference is therefore a recorded component gap (surfaced
by `build_graph` as a `GAP:` line), not a lint failure.

**Both SDKs are platform components.** `strata-sdk-rails` and `strata-sdk-case-management` are
canonical ids so consuming apps can declare `integrates_with: [strata-sdk-case-management]` (e.g. an
app composing with the case-management service) and each SDK's getting-started guide claims its id via
`component_keys`. The two ids are distinct SDKs, not one; see the `sdk` vs `sdk-typescript` profiles.

```
platform-cli                # the nava-platform CLI (navapbc/platform-cli)
template-infra              # the Terraform/AWS infrastructure template (navapbc/template-infra)
template-infra-azure        # the Terraform/Azure infrastructure template (navapbc/template-infra-azure)
template-application-rails  # the Rails application template (the v1 app-template source)
template-application-nextjs # the Next.js application template (canonical; soft-deprecated, not a documented source)
template-application-flask  # the Flask application template (canonical; soft-deprecated, not a documented source)
documentai-api              # AWS Bedrock Data Automation document classification/extraction sidecar (navapbc/strata-template-documentai-api)
strata-sdk-rails            # the Strata SDK Rails engine (navapbc/strata-sdk-rails; profile `sdk`)
strata-sdk-case-management  # the TypeScript case-management SDK monorepo (navapbc/strata-sdk-case-management; profile `sdk-typescript`)
strata-template-rules-engine-catala # the Catala rules-engine application template (navapbc/strata-template-rules-engine-catala)
```
