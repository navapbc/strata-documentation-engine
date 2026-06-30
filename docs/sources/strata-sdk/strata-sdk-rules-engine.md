---
id: strata-sdk-rules-engine
title: Rules engine
source: strata-sdk
doc_type: feature
tags: [strata-sdk, rules-engine, policy-as-code, facts]
related:
  - strata-sdk-determination
feature_keys:
  - rules-engine
demonstrates: []
component_keys: []
manages: []
integrates_with: []
summary: The Strata::RulesEngine for lazily evaluating facts from injected rule sets, tracking the reasons each fact was derived from.
source_ref:
  repo: https://github.com/navapbc/strata-sdk-rails
  ref: f3b47ca38e6f4d3196b026acd97a97cd7a25f508
  paths:
    - app/models/strata/rules_engine.rb
    - docs/strata-rules-engine.md
    - docs/strata-sdk-components.md
verified: ok
last_documented: 2026-06-29
---

# Rules engine

The Strata Rules Engine lets you implement policy rules as code — the same rules can power both
internal eligibility determinations and public-facing calculators. The SDK doc notes the feature is
**a work in progress**; the implemented surface is intentionally small.

## Implemented API

`Strata::RulesEngine` (`app/models/strata/rules_engine.rb`) evaluates **facts** against an injected
**rules** object using lazy evaluation and a fact cache.

```ruby
engine = Strata::RulesEngine.new(rules)   # `rules` is any object exposing rule methods
engine.set_facts(birth_date: Date.new(1990, 1, 1))
result = engine.evaluate(:is_adult)       # => Strata::RulesEngine::Fact
result.value
result.reasons                            # the immediate dependency facts this fact was derived from
```

- `RulesEngine.new(rules)` — `rules` is the injected rule set; rule names are methods on it.
- `set_facts(hash)` — directly sets input facts (wrapped as `RulesEngine::Input`, a `Fact` with no
  reasons).
- `evaluate(fact_name)` — returns the cached fact if present; otherwise computes it.
- A `Fact` has `name`, `value`, and `reasons`.

### How computation works

`compute_fact` looks up `fact_name` as a method on `rules`. If `rules` does not respond to it, the
fact resolves to `Fact.new(name, nil, reasons: [])` (an unknown fact). Otherwise the engine inspects
the rule method's parameter names, recursively `evaluate`s each as a dependency fact, calls the rule
with those values, and records the immediate dependency facts as `reasons`. This yields a
lazily-evaluated dependency graph (a DAG so long as the ruleset defines no cycles — the engine does
not detect cycles). Each fact's `reasons` holds only its direct inputs; walking each fact's `reasons`
recursively reconstructs the full derivation chain.

## Design intent (from the SDK doc)

The `reasons` attribute is implemented — each computed fact carries the direct dependency facts it
was derived from, enabling programmatic traversal of the derivation chain (walk each fact's `reasons`
recursively to reconstruct the full derivation tree). The broader roadmap (not yet in code) includes
derivable facts with multiple computation paths, fact collections and aggregation, versioned
rulesets, and extensible/overridable rules. Treat anything beyond the `RulesEngine` API above as
roadmap, not a current contract.

## Gotchas

- Rule dependencies are resolved by **parameter name** — a rule method's argument names must match
  the fact names it depends on.
- An unknown rule does not raise; it returns a `Fact` with a `nil` value, so callers should check
  `value` (and `reasons`) rather than assuming presence.
