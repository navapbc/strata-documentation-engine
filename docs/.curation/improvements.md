# Curation report — documentation-gathering improvements

Advisory only. Produced once after the verify→fix loop. These are recommendations for improving how
the engine *gathers* docs (profiles, registries, source-access, process) — not edits to the docs
themselves. Nothing here touches frontmatter, the graph, or the verify loop.

This file is **cumulative**: each run preserves still-valid recommendations and appends/merges new
ones under a dated section. The most recent pass is at the top.

---

# Update-mode pass — 2026-09-04 (7 sources)

An **update-mode** run over 5 re-documented sources plus 2 NEW ones. The curator was handed the
explicit source list (the P3 mitigation below still holds):

- **`oscer`** (example-app) — re-documented at `be3ffbb…`; 13 docs (12 refreshed, 1 new).
- **`template-infra`** (infra-template) — re-documented at `8b7bc38…`; 9 docs (1 new).
- **`platform-cli`** (platform-cli) — re-documented at `5ed1286…`; 6 docs (2 new).
- **`template-infra-azure`** (infra-template) — re-documented at `474f45e…`; 6 docs (1 new).
- **`documentai-api`** (application-template) — re-grounded at `753ad50…`; 3 docs.
- **`strata-paidleave`** (example-app) — **NEW**; `954a71f…`; 10 docs.
- **`strata-sdk-case-management`** (`sdk` profile, TypeScript) — **NEW**; `579d276…`; 10 docs.

All 7 produced a distillation log; **none missing**. `.logs/` still holds 6 logs from prior runs
(`app-template`, `strata-sdk`, `strata-template-rules-engine-catala`, `strata-unemployment`,
`template-application-flask`, `template-application-nextjs`) — correctly excluded from this pass. The
last two are for sources **no longer in `sources.md`** and are obsolete; see the P3 pruning item.

## Registry health this run: NOT clean

For the first time in three runs, two documenters hit registry surfaces that do not exist and had to
work around them (see P0 and P1 below). Every key that *was* used resolved, so no lint hard-fail, and
`feature_key_gaps` stayed 0 — but only because `strata-sdk-case-management` deliberately claimed
nothing.

---

## P0 — The `sdk` profile was applied to a TypeScript SDK it does not describe; the whole feature axis had to be abandoned

`strata-sdk-case-management` is a TypeScript/pnpm monorepo publishing `@nava-strata/*` packages. It
shares the name "Strata SDK" and the case-management *domain* with `strata-sdk-rails` but shares no
code, API, or vocabulary (`CaseTypeConfig`, `CriterionDefinition`, `Evidence`, `Signal`, `CaseStore`
vs `Strata::BusinessProcess`, `strata_attribute`, …). Consequences the documenter had to reason out
unaided (case-management log, "headline finding" + judgment calls 1–3):

1. **`feature_keys: []` on all 10 docs.** `references/feature-keys.md`'s own preamble says every key
   traces to a real file in `strata-sdk-rails`, so no key is claimable. The profile's core
   instruction — "one `doc_type: feature` doc per canonical key" — is inapplicable.
2. **A near-miss graph regression.** `build_graph.py` resolves ownership with
   `owners.setdefault(k, d["id"])` over `sorted(rglob)`, and
   `docs/sources/strata-sdk-case-management/…` sorts **before** `docs/sources/strata-sdk/…`
   (`-` < `/`). Had this documenter claimed `case`, `task`, or `business-process`, it would have
   **silently stolen ownership** from the Rails SDK docs and re-pointed every example app's
   `demonstrates` `example-of` edge at a TypeScript doc describing a different API. Only a judgment
   call prevented it.
3. **The profile's docs assumption inverted.** `sdk.md` assumes a source that "already ships
   extensive docs under `docs/`" to distill; this repo's `docs/` holds exactly two files, so nearly
   everything was derived from `sdk/` source. These docs are now the most complete API description of
   this SDK that exists.

**Action (three parts, in order):**
1. **Split the profile.** Add `profiles/sdk-typescript.md` (or rename the existing one
   `sdk-rails.md`) and repoint the `strata-sdk-case-management` row in `sources.md`. One profile
   cannot serve a Rails engine and an npm monorepo; `lint_manifest` will accept a new profile file
   with no other change.
2. **Namespace the feature registry before any doc claims a key.** If this SDK is to join the
   feature axis, `feature-keys.md` needs a distinct key set — e.g. `cm-ts/case-type-config`,
   `cm-ts/criteria`, `cm-ts/tasks`, `cm-ts/events`, `cm-ts/stores`, `cm-ts/blueprints` — plus a
   preamble sentence saying unprefixed keys are Rails-SDK-scoped. Until then `feature_keys: []` here
   is correct and should be stated as expected in the profile, not left to judgment.
3. **Make ownership collisions loud, not lexicographic.** `build_graph`'s `setdefault`-over-sorted
   ordering means a second claimant of an owned key is silently ignored. Per the "never silently
   drop" invariant, `lint_docs` should hard-fail (or `build_graph` should print a `COLLISION:` line)
   when two docs claim the same `feature_keys`/`component_keys` entry. This is the single highest-
   value engine change from this run: it converts a silent graph regression into a pipeline stop.

## P1 — `platform-components.md` has no id for either SDK, so the component axis has a hole

`strata-sdk-case-management` set `component_keys`, `manages`, and `integrates_with` all to `[]`
because the registry has **no id for it, nor for the Rails SDK** (case-management log, judgment call
2). Both SDKs are therefore unreachable on the platform axis; only the `related` axis and inbound
`demonstrates` edges connect them.

**Action:** decide explicitly and record the decision in `platform-components.md` itself — either add
`strata-sdk-rails` and `strata-sdk-case-management` as canonical ids (letting apps declare
`integrates_with: [strata-sdk-case-management]`, which `strata-paidleave`'s casemgmt composition
would immediately use), or add a one-line note that SDKs are deliberately feature-axis-only. Silence
makes every documenter re-derive it.

## P1 — `sources.md` subpaths for `strata-sdk-case-management` exclude its intended entry points

The declared `docs sdk` scope omits `skills/` (eight agent skills that `AGENTS.md` calls
authoritative for their tasks) and `tools/workflow-viewer/` (whose `/learn` pages the SDK's own
maturity doc points users at). The documenter flagged both as clearly significant and out of scope
(case-management log, judgment call 3).

**Action:** widen that row's `subpaths` to `docs sdk skills tools` so a future run can document the
program-workflow generator skill and the viewer — for a consuming team those are the front door, and
today the docs describe the library without them.

## P1 — Prior P0 (leaked tool-call XML) is UNFIXED and still visible in the tree

The 2026-07-21 report's P0 asked for (a) a `lint_docs` hard-fail on stray tool-call markup and (b) a
hardened write step. Neither landed: `grep -n 'invoke\|antml\|parameter' scripts/lint_docs.py` returns
nothing, and `.logs/strata-unemployment.distillation.md` still ends with a bare `</content>` tag.

No new corruption appeared in this run's 7 logs or docs, so the write path may have self-corrected —
but nothing enforces it, and the detection gap that let the prior corruption survive lint + verify→fix
+ graph is unchanged. **Re-raising unchanged:** add the body/log scan to `lint_docs`. It is a dozen
lines and closes a whole class of silent corruption.

## P1 — Prior P1s on judgment-churn keys are ALSO unfixed; three run-over-run reversals are now on record

Verified this run: `feature-keys.md` still carries no threshold note for `components`,
`profiles/example-app.md` still has no "leave a key off rather than force a near-match" rule and no
flow-`task`-DSL caution, `profiles/infra-template.md` still has no AWS-terminology caution and no
"ADRs if present" softening, and `profiles/rails-template.md` still says nothing about Azure. The
cost is now measurable:

- **`components`** was declined by oscer (2026-06-29), claimed by oscer (2026-07-21), and this run
  both `oscer` and `strata-paidleave` wrote standalone `components.md` docs — converging, but by
  coincidence, not by rule.
- **`app-template`'s Azure `integrates_with`** flipped on and stayed on.
- **`strata-paidleave` re-derived the entire "what NOT to tag" analysis from scratch** (judgment
  calls 3–6: declining `task/system-process`, `task/third-party-task`, `rules-engine`, `auth`,
  `policies`, `audit-log`, `virtual-actor`, `generators`), reaching correct answers by careful
  grepping — exactly the work the 2026-06-29 profile note was meant to save. Its `rules-engine`
  reasoning ("the app's rules engine is an external HTTP service reached through
  `RulesEngine::Adapter`; no code references `Strata::RulesEngine`") is a better example than the one
  previously proposed and should be quoted verbatim in the profile.

**Action:** apply the four one-line profile/registry edits already specified in the 2026-06-29 and
2026-07-21 sections. They have now been recommended three runs running and remain the cheapest
outstanding work in this report.

## P2 — `needs-review` is being spent on cosmetic residuals; the loop needs a severity floor

Both docs that ended `verified: needs-review` did so on findings a reader would not notice:

- **`infra-database`** (round 3): the maintenance-window upgrade path says "apply" rather than naming
  the explicit make command. Rounds 1 and 2 findings were otherwise all addressed.
- **`infra-azure-set-up-database-and-service`** (round 3): a citation reads `manage.py:250-272` where
  the complete function runs to line 275. The record's own verification notes then confirm ~12
  substantive claims correct.

`needs-review` is the engine's signal that a doc may mislead. Spending it on a three-line citation
range devalues it, and a reader triaging INDEX cannot tell these two apart from a doc with a wrong
command.

**Action:** give the adjudicator an explicit floor in `agents/adjudicator.md` — only **medium or
higher** unresolved findings set `needs-review`; residual `low` findings are recorded in
`docs/.verification/` and the doc stays `ok`. Optionally have `build_graph` surface the highest
residual severity alongside the status so the distinction is visible in `INDEX.md`.

## P2 — Known graph gaps: `template-application-nextjs` and `template-application-flask` are referenced but unowned

Both ids are referenced this run — `platform-cli`'s `legacy-migration` and `app-commands` docs
`manages` them (grounded in the `.template-flask-version` / `.template-nextjs-version` files those
guides name), and `strata-paidleave` declares `integrates_with: [template-application-nextjs]`
grounded in a real `.template-application-nextjs/casemgmt.yml` answers file plus six
`CaseManagementService` job callers. Neither has a documented source, so `build_graph` prints `GAP:`
lines, as designed.

The 2026-06-29 report called this soft-deprecation "the intended state, revisit only if those
templates are re-added or fully retired." **That condition has now been met from the other side:** a
live example app composes with the Next.js template, and both `.logs/` still hold full, high-quality
distillation logs from when they *were* documented sources.

**Action:** re-add `template-application-nextjs` to `sources.md` (`application-template`, subpaths
`template template-only-docs`). Its prior log shows the source supports a clean three-doc set, so the
cost is one update-mode run and the gap closes into a real `integrates-with` edge. For
`template-application-flask`, either re-add it the same way or drop the id from
`platform-components.md` and let `platform-cli`'s `manages` list shrink — the current state (a
canonical id kept alive solely to keep a `manages` value lint-valid) is the worst of both.

## P2 — Shallow clones: the prior-SHA diff problem is half-solved, and the fix is a one-line profile note

The 2026-07-21 P1 asked that the clone step make the prior `source_ref.ref` diffable. Something
improved — `oscer`, `platform-cli`, `documentai-api`, and `template-infra` all successfully ran
`git diff <prior>..<new>` and scoped their work from it, which is exactly the intended update-mode
behavior. But `template-infra`'s documenter found the sharp edge:

> The checkout is a **grafted shallow clone**, so `git log 80a7cc8..8b7bc38` reports a single commit
> and is useless for change detection — both SHAs are grafted roots. `git diff 80a7cc8..8b7bc38`
> gives the true tree delta.

`documentai-api` hit the same thing ("the checkout is shallow (depth 1), but a `git diff` between the
two SHAs resolved"). So `git diff` works on a grafted clone and `git log` silently lies.

**Action:** state in `agents/source-doc.md` that update-mode drift scoping must use
`git diff <prior-sha>..<new-sha> -- <subpaths>`, never `git log`, because clones are shallow/grafted
and `git log` returns a plausible-but-wrong single-commit answer. One sentence prevents a documenter
from concluding "nothing changed."

## P2 — `example-app` profile needs a doc-count/grouping rule; `strata-paidleave` had to invent one

`strata-paidleave` wrote **10 docs** where the profile implies a smaller set, reasoning: "This app is
much larger than a single-form reference app (5 application forms, 5 flows, a full business process, a
staff dashboard, an M2M API). Splitting by SDK feature keeps each doc's `demonstrates` clean and gives
the graph one owner per key." `oscer` independently reached 13 on the same principle. That principle —
**one doc per feature key, so the graph has exactly one owner per key** — is the right rule and it is
nowhere written down.

**Action:** codify it in `profiles/example-app.md`: doc count follows the app's SDK surface, one doc
per feature key (or coherent key cluster), with no target number. This also subsumes the older
"profiles don't state a doc count" P1 for the example-app case.

## P2 — Two documenters independently split `attributes` from `value-objects` the same way; make it a rule

`strata-paidleave` tagged `attribute-types/money` and `attribute-types/year-quarter` on its
value-objects doc and the other five type keys on its attributes doc, "so no key is claimed twice",
reasoning that money and year-quarter are the two whose *value class* surface the app exercises
directly. `oscer` drew a closely related line, warning that `Strata::Address` used as
`ActiveModel::Type::Json.new(Strata::Address)` is **not** an `attribute-types/address` demonstration.

Both calls are sound and mutually consistent. **Action:** add to `feature-keys.md` next to the
`attribute-types/*` block: tag the key on the doc that exercises the type's *declaration*
(`strata_attribute`), and only move it to a value-objects doc when the app exercises the value
class's own API; an SDK value class used merely as a serialization type is not a demonstration of its
attribute-type key.

## P2 — New docs↔code mismatches for the `upstream-issues.md` ledger

Recommending, not editing. This run's documenters grounded around a large crop of source defects;
the highest-value ones to file upstream:

- **`strata-sdk-case-management`** — `humanId` is silently dropped by event serialization
  (`SerializedCaseRecord` has no such field, yet both SQL stores persist it), so webhook payloads and
  `SqliteEventStore` round-trips lose it; `settleAutoTransitions` exists as two near-identical ~90-line
  private copies; `CaseSdkOptions.humanIdGenerator?: any` is untyped though `HumanIdGenerator` is a
  real exported interface; `onTaskCreated`/`onTaskCompleted` are the only hooks not error-isolated;
  the `'event'` transition trigger is accepted by type and Zod schema but filtered nowhere;
  `income-eligibility` sits in a "jurisdiction- and program-agnostic" catalog carrying
  `ruleEvaluatorId: 'snap-income-eligibility-check'`.
- **`strata-sdk-rails`** (found via `strata-paidleave`) — `Strata::Attributes::MoneyAttribute::MoneyType#cast`
  returns `nil` for Strings, silently dropping `money_field` input (the app ships a `MoneyInput`
  workaround "remove once the SDK's MoneyType casts strings", and `BenefitPayment` works around it a
  second, different way); no repeater view component exists (a 50-row wage repeater is hand-built);
  no `:year_quarter` form helper; `Strata::Determinable`'s `has_many` hardcodes
  `class_name: "Strata::Determination"`, forcing every app with a `Determination` subclass to
  re-declare the association; `Strata::ApplicationForm`'s submitted-freeze guard recognizes only the
  literal `submitted` status.
- **`template-infra`** — threat-detection override precedence is asymmetric (`coalesce` for the
  enable flag, a `== true` ternary for the frequency, so setting only the frequency has no effect);
  `enable_storage_malware_scanning` is documented as per-environment but all three shipped env files
  pass one shared local; the 2023-11-28 feature-flags ADR describes CloudWatch Evidently while the
  shipped module writes plain SSM parameters; `docs/feature-flags.md` names the wrong path for the
  defaults map; neither new security doc mentions cost, though malware scanning ships with
  `object_prefixes = []`.
- **`template-infra-azure`** — `make infra-configure-monitoring-secrets` calls a
  `./bin/configure-monitoring-secret` that does not exist, and its `has_incident_management_service`
  flag is referenced nowhere (dead config); blob storage is on by default and entirely undocumented;
  `environment-variables-and-secrets.md` is still substantially AWS text and names
  `environment_variables.tf` where the file is `environment-variables.tf`.
- **`documentai-api`** — `ProcessStatus.is_completed` omits `blurry_document_detected` and
  `password_protected`, while `insert_initial_ddb_record` writes a final response for them, so a
  `wait=true` upload polls for the full timeout and is then rewritten as `failed` while
  `GET /v1/documents/{job_id}` returns the real answer immediately; the two jobs take positional
  arguments in **opposite orders**; README's OpenAPI link points at a path `make openapi-spec` does
  not write.
- **`platform-cli`** — `docs/getting-started/help.md`'s `-v`-count description does not match
  `main.py`/`logging/__init__.py`; `docs/guides/new-project.md` and the tail of
  `migrating-from-legacy-template.md` show invocations the current Typer signatures reject.

## P3 — Empty template-author README is now confirmed across five sources (prior P2, unapplied)

`documentai-api` (`template-only-docs/README.md`, 0 bytes) and `template-infra-azure`
(`docs/README.md`, 0 bytes) both re-flagged it this run, joining `app-template` and the prior run's
finds. The one-liner recommended in 2026-07-21 — that an empty `template-only-docs/README.md` /
`docs/README.md` is expected copier-family boilerplate, skip without flagging — is still unapplied and
still worth a minute.

## P3 — Curator scoping mitigation held again; `.logs/` pruning is the remaining half

The explicit re-documented-source list was passed again and worked. The unaddressed half is pruning:
`.logs/` holds logs for `template-application-flask` and `template-application-nextjs`, which are not
in `sources.md`. If those sources are re-added (P2 above) the logs become useful again; if not, prune
them and record in `SKILL.md` that `.logs/` is not run-scoped.

## P3 — What worked, worth keeping (informational)

- **SHA-pinning held on all 7 sources**, including both NEW ones, and `strata-sdk`'s prior-run fix
  (branch name → resolved SHA in all 14 docs) removed the standing cause of conservative full
  re-documents.
- **Doc-id stability was preserved deliberately everywhere it mattered.** `documentai-api` kept its
  three ids specifically because "`oscer`'s docs already point at `documentai-api` via
  `integrates_with`, so the component id must not move"; `platform-cli` kept four ids while adding
  two; `template-infra` kept all eight; `template-infra-azure` kept five and added one. No churn.
- **`verified: ok` was correctly dropped on every rewritten doc** across five sources, each citing the
  frontmatter contract. That convention is now self-sustaining and needs no further reinforcement.
- **Coverage auditing emerged unprompted.** `template-infra`'s documenter listed which upstream docs
  had *no* coverage in the existing doc set, closed the material gaps, and recorded which four it left
  uncovered and why. Worth promoting from good instinct to a profile instruction for `infra-template`
  and `sdk`: before finishing a re-document, list upstream docs with no doc covering them and record
  the disposition of each.

---

# Update-mode pass — 2026-07-21 (6 sources)

This was an **update-mode** run. The engine re-documented exactly these 6 sources, and ONLY their
distillation logs were curated as part of this run (the curator was handed the explicit source list —
see the `.logs/` staleness item below, now confirmed mitigated):

- **`app-template`** (rails-template) — re-documented at new SHA `6cc2443…`.
- **`documentai-api`** (application-template) — re-documented at new SHA `7c7f30c…`.
- **`oscer`** (example-app) — materially drifted; re-documented at new SHA `c53e711…`.
- **`platform-cli`** (platform-cli) — re-documented at new SHA `57d5d5c…`.
- **`template-infra`** (infra-template) — re-documented at new SHA `80a7cc8…`.
- **`template-infra-azure`** (infra-template) — re-documented at new SHA `e10a383…`.

**All 6 produced a distillation log. None were missing.** `.logs/` still holds 5 additional logs
from prior runs (`strata-sdk`, `strata-template-rules-engine-catala`, `strata-unemployment`,
`template-application-flask`, `template-application-nextjs`); those were NOT re-documented this run
and were correctly excluded from this curation.

## Registry health this run: clean

Every cross-link key the 6 documenters used already existed; **no missing-key hard-fail, no new
registry keys needed this run.** Notably `oscer` added a new `components` example doc, plus
`attribute-types/array` (parity with `range`), `DocAiResult`, and `integrates_with: [documentai-api]`
— all resolved against pre-seeded registry entries (oscer log lines 47-58, 81-92). The
`platform-cli` `manages` edges to `template-application-nextjs`/`-flask` again surfaced as the
intended `build_graph` `GAP:` lines (soft-deprecated canonical ids), not lint failures (platform-cli
log lines 109-116) — consistent with the P3 below.

---

## P0 — Generated docs were silently corrupted by leaked tool-call XML; only caught by a documenter's eye

`template-infra-azure`'s documenter found that **all 5 pre-existing docs ended with stray
`</content></invoke>` tags leaked from a prior write** and had to strip them during the rewrite
(azure log lines 20-22). Separately, the **`oscer` distillation log itself ends with a stray
`</content>` tag** (oscer log line 93). The engine's doc-write path is emitting literal tool-call
markup (`</invoke>`, `</content>`, `<parameter …>`) into the files it writes.

This is a "never silently drop" violation: the corruption shipped in a prior cycle's output, sat
undetected through lint + verify→fix + graph builds, and was only removed because *this* run happened
to rewrite those files. A source that was skipped/unchanged would have kept the corruption
indefinitely. `lint_docs` validates frontmatter but does not scan bodies for leaked markup.

**Action (two parts):**
1. Add a `lint_docs` check that hard-fails on stray tool-call XML in any doc body or distillation log
   (`</invoke>`, `</content>`, `<parameter`, and a bare trailing `</...>` that isn't legitimate
   HTML/markdown). This turns a silent corruption into a pipeline stop, per the invariant.
2. Harden the `source-doc.md` write step so the agent never serializes tool-call scaffolding into
   file content — the recurrence across azure (docs) and oscer (log) says this is systemic, not a
   one-off fat-finger.

## P1 — Update mode cannot diff: the prior `source_ref.ref` SHA is absent from the (shallow) clone

Three of the six re-document runs could not compare old→new because the previously-documented commit
was not in the local checkout:

- **`template-infra`**: "the previously-documented SHA `d2b569e3…` is not present in this checkout's
  object history (shallow/updated clone), so a direct `git diff` … was not possible" (line 17-19).
- **`template-infra-azure`**: "shallow clone (depth 1); the previously-documented SHA `f930f2ba…` is
  not present locally, so no upstream diff was possible" (lines 8-10).
- **`oscer`**: material drift (exemption→exclusion rename, new three-step flow, expanded outcome
  enum, new form base class) forced a **full rewrite of every doc** rather than a scoped edit (lines
  22-44).

The fallback in each case was to **re-verify every load-bearing claim by hand** against the working
tree — expensive, and it puts the burden of catching drift on exhaustive manual reading rather than a
diff. Update mode's whole premise (only touch what changed) is undercut when the documenter can't see
what changed.

**Action:** the setup/clone step should make the prior SHA diffable. Either clone with sufficient
history (not `--depth 1`), or explicitly `git fetch` the prior `source_ref.ref` recorded in the
existing docs before dispatching the documenter, so update-mode agents can run
`git diff <prior-sha>..<new-sha> -- <subpaths>` to scope their re-verification. `source_delta`
already reads the prior ref to classify drift; feed that same SHA into the clone so the documenter
can act on it.

## P1 — `components` feature key flipped run-over-run on the SAME app (prior P1 now confirmed unstable)

The prior report (2026-06-29) flagged `components` as having no documented threshold, citing oscer
DECLINING it for `CaseRowComponent`/`TaskRowComponent` as "incidental UI wiring." **This run oscer
REVERSED that call** — it added a new `example-oscer-components` doc precisely for
`CaseRowComponent`/`TaskRowComponent` (plus direct renders of `Strata::Cases::IndexComponent`,
`Strata::US::AccordionComponent`, and `Strata::DateHelper` mix-ins) and wired it into the overview
(oscer log lines 47-52, 92).

The same app, same symbols, opposite decision two runs apart. This upgrades the prior finding from
"inconsistent across apps" to "unstable within one app across runs" — the cross-link
(`example-of` edge to the SDK components doc) is not reproducible. The prior report's proposed
`feature-keys.md` clarification for `components` is **still unapplied** (or ineffective); it should be
prioritized. Reinforcing, not re-raising: apply the one-line threshold clarification from the
2026-06-29 section.

## P1 — rails-template `integrates_with` also flip-flops on Azure; profile should settle it

`app-template` this run **added `template-infra-azure` to the guide's `integrates_with`**, explicitly
**reversing the prior run's decision to omit Azure** (app-template log lines 70-77). The reversal is
well-grounded — Azure is now a first-class deploy target (`config/initializers/database_auth.rb`
implements Entra ID token auth; `Deployment.md` documents deploying via the Nava Azure infra
template) — but it is exactly the kind of per-run judgment churn a profile should remove.

**Action:** state in `profiles/rails-template.md` that a Rails app template documenting shipped
Entra/Azure DB-auth support should declare **both** `template-infra` and `template-infra-azure` in
`integrates_with` (with the AWS-only walkthrough example free to name just `template-infra`). Stops
the edge from oscillating between runs.

## P2 — Azure infra AWS-terminology drift STILL recurring; prior profile caution not visibly effective

The 2026-06-29 report recommended baking an "Azure docs carry AWS-terminology drift" caution into
`profiles/infra-template.md`. This run's Azure documenter **again re-derived the same handling from
scratch** — flagging `set-up-database.md`'s "Lambda function", the "ECS task definition"/"ECS task
role" references, and `.s3.tfbackend` naming, and documenting the Azure reality (Container App Job,
`azurerm` backends) inline instead (azure log lines 84-95, 96-107). It also again hit the missing
`docs/decisions/` directory (line 98) the prior report's "ADRs if present" softening was meant to
cover.

Either those profile edits were never applied, or they aren't preventing re-derivation. **Action:**
verify `profiles/infra-template.md` actually carries the two prior notes (AWS-term caution; `docs/decisions/*`
"if present"); if present, tighten the wording so the next Azure run reads it as authoritative rather
than reasoning independently.

## P2 — New docs↔code mismatches worth filing to `upstream-issues.md`

This run surfaced source-side defects the documenters correctly grounded around; they belong in the
existing `upstream-issues.md` follow-up ledger (curator is advisory — recommending, not editing that
file):

- **documentai-api** (log lines 92-102): README "Installation" links to `…/demployment.md` (typo for
  `deployment.md`); README "Processing Flow" names a `bda_output_processor` job that does not exist
  (real entry point is `bda_result_processor`); `app.py create_document` defaults `timeout=180` while
  its docstring and README curl example say `120`; `deployment.md` references
  `aws_iam_policy.dynamodb_read_write.arn` where the declared resource is
  `documentai_api_dynamodb_read_write` (copy-paste mismatch).
- **platform-cli** (log lines 122-136): README carries two conflicting uv version floors — `0.6.15+`
  (install) vs `0.5.8+` (development) — easy to conflate; `app update`'s `src_path` has no effect on
  updates (upstream `navapbc/platform-cli#5`).
- **app-template** (log lines 92-98): `decisions/README.md` and `template-only-docs/README.md` are
  empty (ADRs expected, none ship); `code.json` has a malformed `…/strata/blob/…` URL path segment.
- **template-infra-azure** (log lines 96-107): `background-jobs.md` documents a not-yet-implemented
  worker-queue path; the tenant-level Cloud Application Administrator requirement is expected to be
  removable by future work (issue #17). (Complements the AWS-terminology entries already filed.)

## P2 — Empty `template-only-docs/README.md` / `docs/README.md` is a copier-family pattern

Three of this run's copier-based sources note an empty template-author README: `app-template`
(`template-only-docs/README.md`, line 94), `documentai-api` (`template-only-docs/README.md`, line
78), and `template-infra-azure` (`docs/README.md`, line 97). Documenters skip them correctly, but
each re-notes it as a "gap." **Action (minor):** add a one-liner to the `rails-template`,
`application-template`, and `infra-template` profiles that an empty `template-only-docs/README.md` /
`docs/README.md` is expected boilerplate — skip without flagging as a source gap.

## P3 — `.logs/` staleness mitigation from the prior run WORKED (confirming, not re-raising)

The 2026-06-29 report's P2 asked the skill to pass the curator the explicit list of sources
re-documented this run (to avoid mis-attributing stale `.logs/` entries). **This run that mitigation
was in effect** — the curator was handed the 6-source scope explicitly and correctly ignored the 5
stale logs still sitting in `.logs/`. Recommend making this permanent in `SKILL.md` (document that
`.logs/` is not run-scoped and the curator must receive/honor the re-documented source list), and
optionally still prune obsolete logs for removed sources (flask/nextjs remain in `.logs/`).

## P3 — Update-mode drift detection held up (informational)

`oscer` is the strongest evidence the update path works end-to-end: it caught a material rename
(`exemption`→`exclusion` ruleset), a new three-step automated flow, an expanded five-outcome
determination enum, and a new `OscerApplicationForm` abstract base — all correctly re-grounded and
re-pinned (oscer log lines 22-44). SHA-pinning at write time also held across all 6 sources (every
doc re-pinned to its resolved SHA). No regression in the doc-write pinning discipline.

---

# Update-mode pass — 2026-06-29 (4 sources)

This was an **update-mode** run, not a full rebuild. The engine re-documented exactly these 4
sources, and ONLY their distillation logs were curated as part of this run:

- **`oscer`** (example-app) — changed; re-documented at new main SHA `a4fc94b…`.
- **`strata-template-rules-engine-catala`** (application-template) — **NEW** source, first-time
  generation; SHA `60d6db4a…`.
- **`strata-unemployment`** (example-app) — **NEW** source, first-time generation; SHA `480303cf…`.
- **`template-infra-azure`** (infra-template) — changed; re-documented at new SHA `f930f2ba…`.

All 4 produced a distillation log. None were missing.

**Skipped/unchanged this run (NOT re-curated):** `app-template`, `documentai-api`, `platform-cli`,
`strata-sdk`, `template-infra` were unchanged and correctly skipped; their `.logs/` entries are from
a prior run. **Removed sources:** `template-application-flask` / `template-application-nextjs` were
removed from `sources.md` this cycle (now only canonical ids in `platform-components.md` for
`platform-cli`'s `manages` references); their `.logs/` entries are **obsolete**. The earlier
update-mode section below references flask/nextjs as live NEW sources — that content is now stale and
superseded by this section.

## Two prior P0s are now CLOSED — verified fixed, not re-raised

The previous report's two `application-template`-profile P0s were applied and are confirmed gone:

- **DocumentAI framing.** `profiles/application-template.md:6-8` now reads "AWS Bedrock Data
  Automation (BDA) + S3 + DynamoDB" and "classifies/extracts" — the Google-Cloud trap is gone.
- **Install command.** `profiles/application-template.md:20-26` now prescribes `nava-platform app
  install` / `nava-platform app update` (not raw `copier copy`). Confirmed working: the Catala
  documenter followed the corrected guidance directly — README install path, `copier.yml` prompts
  recorded separately, no per-source detour (catala log lines 11-13, 59-77). The fix held.

## Registry health this run: clean

Every cross-link key the 4 documenters used already existed; **no missing-key hard-fail, no new
registry keys needed this run.**

- `strata-template-rules-engine-catala`'s `component_keys` + `integrates_with: [template-infra]`
  resolved against pre-seeded `platform-components.md:24` (catala log lines 64-68).
- `template-infra-azure` used only `component_keys: [template-infra-azure]` +
  `integrates_with: [template-application-rails]` — both present (azure log lines 53-58).
- `strata-unemployment` used `application-form`, `application-form-flow`, `attributes`,
  `attribute-types/{name,memorable-date,address,tax-id}`, `form-builder`, `components` — all present;
  it correctly declined `money`/`us-date`/`case`/`task`/`determination`/etc. that weren't in the code
  (unemployment log lines 38-41).
- `oscer` re-verified its full SDK surface clean at the new SHA; `EventManager` correctly left
  untagged per the `feature-keys.md:47-51` exclusion (oscer log lines 45-49).

---

## P1 — `components` feature key is semantically ambiguous; two documenters made OPPOSITE calls on it

The same `components` key (`feature-keys.md:33` → `docs/strata-sdk-components.md`) was interpreted two
different ways this run:

- **strata-unemployment TAGGED it** for rendering `Strata::Flows::TaskListComponent` + the shared
  `strata/application_forms` index/show templates (unemployment log line 40: "treating the SDK's
  ViewComponents/templates as that feature").
- **oscer DECLINED it** for `Strata::Cases::CaseRowComponent` / `Strata::Tasks::TaskRowComponent`,
  judging them "incidental UI wiring, not a `components` feature demonstration worth a standalone doc"
  (oscer log lines 60-62).

Both are defensible, but the key has no documented threshold for "demonstrates components" vs
"incidental UI wiring," so the cross-link (`example-of` edge to the SDK components doc) is being
applied inconsistently across example apps.

**Action:** add a one-line clarification to `feature-keys.md` for `components` — e.g. *"tag
`components` when the app renders an SDK ViewComponent/shared template as a load-bearing part of its
UI (TaskListComponent, the shared application-form templates); incidental row/cell sub-components
rendered inside another SDK component are not on their own a `components` demonstration."* Makes the
edge reproducible across example apps.

## P1 — `example-app` profile is silent on the two-tier SDK-consumer pattern; documenters re-derived "what NOT to tag"

The two example apps this run sit at opposite ends of SDK usage, and each had to reason from scratch
about which feature keys to leave OFF:

- **oscer** is the full-surface consumer (business-process, task, case, determination, rules-engine,
  audit-log, value-object, attributes, policies, api-auth) — 11 docs (oscer log lines 18-22, 86-99).
- **strata-unemployment** is a minimal flow-only consumer: `application-form` + `application-form-flow`
  + `form-builder` + attribute types, and explicitly NO `case`/`determination`/`business-process`/
  `task`/`audit-log`/`rules-engine`/`auth` because none appear in `app/` (unemployment log lines
  13, 41). It even had to reason that the flow's `task` DSL is part of `application-form-flow`, **not**
  the SDK `Strata::Task` model, to avoid a wrong `task` tag (unemployment log line 41).

Both reached correct answers, so this is hardening, not a correctness gap. The `example-app` profile
(`profiles/example-app.md`) tells documenters what to tag but never says "leave a key off when the
symbol is absent — do not force a near-match," nor warns about the flow-`task`-DSL vs `Strata::Task`
trap.

**Action:** add to `profiles/example-app.md`: (a) *"Tag only feature keys whose SDK symbol you can
grep in the app; an app may legitimately use a tiny slice of the SDK. Leave keys off rather than
forcing a near-match."* (b) a one-line caution that an `ApplicationFormFlow`'s `task` DSL is part of
`application-form-flow`, not the `task` (`Strata::Task`) feature.

## P1 — Catala template: getting-started `poetry install` line is inconsistent with the pyproject extras layout (upstream follow-up)

`template/docs/{{app_name}}/getting-started.md.jinja` shows `poetry install --all-extras --with dev`,
but `pyproject.toml` uses PEP-621 extras and the Dockerfile uses `poetry install --no-root --extras
dev`; the Makefile's `make setup-local` is `poetry install --no-root` (catala log lines 73-77, 87).
The documenter correctly grounded on `make setup-local` and flagged the getting-started line as
possibly stale rather than reproducing it. Also: the README documents `nava-platform app install`
but **no template-specific update command** (catala log lines 69-72, 86). Filed under
upstream-issues.md.

## P1 — Azure infra template: AWS-terminology drift + empty bin/ + filename mismatch (upstream follow-up)

`template-infra-azure`'s shipped docs carry leftover AWS terms while the implementation is Azure
(azure log lines 71-80):

- `set-up-database.md` calls the role manager a **"Lambda function"** — it is an Azure **Container App
  Job**.
- `making-infra-changes.md` / `destroy-infrastructure.md` show `*.s3.tfbackend` and "VPC"/"S3" while
  the backend is `azurerm` and files are `*.azurerm.tfbackend`.
- `environment-variables-and-secrets.md` references an **"ECS task definition"**; it also names the
  file `environment_variables.tf` (underscore) when the real file is `environment-variables.tf`
  (dash, confirmed via `app-config/env-config/` — azure log lines 43-44).
- **`bin/` is empty** in the checkout, yet the root `Makefile` and `infra/accounts/main.tf` reference
  many `./bin/*` scripts (`set-up-account`, `create-tfbackend`, `terraform-init-and-apply`, etc.);
  the documenter documented the Makefile targets as the surface and noted the scripts are absent
  (azure log lines 66-70).
- `docs/README.md` is effectively empty; `background-jobs` worker-queue task type is **not yet
  implemented**; shared-concern doc links point at the **AWS** `template-infra` repo (azure log lines
  77-80, 84-88).

The documenter flagged-but-did-not-propagate correctly. Filed under upstream-issues.md. Engine-side
reinforcement below.

## P2 — `infra-template` profile: bake in the "Azure docs carry AWS-terminology drift" caution

The Azure documenter handled the AWS-term leakage by ad-hoc judgment (documenting Azure reality,
flagging the role-manager naming inline). A profile note would make this reproducible for the next
infra-template run instead of re-derived.

**Action:** add to `profiles/infra-template.md`: *"The Azure template's shipped docs (`template-infra-azure`)
contain leftover AWS terminology (Lambda/ECS/VPC/S3, `*.s3.tfbackend`). Document the Azure reality
(Container App Job, `azurerm`, `*.azurerm.tfbackend`) and flag the drift; do NOT propagate the AWS
terms as fact. The Azure checkout has an empty `bin/` and links shared-concern docs to the AWS repo —
document the Makefile targets as the operator surface and note absent scripts rather than inventing
them."*

## P2 — `infra-template` profile assumes `docs/decisions/*` ADRs that the Azure checkout lacks

The profile (`profiles/infra-template.md:8`) says infra templates ship `docs/decisions/*` MADR ADRs,
but the Azure checkout has **no `docs/decisions/` directory** (azure log lines 44-45). The documenter
handled it gracefully (nothing to distill). Soften the profile to *"if present"* so a future
documenter doesn't treat the absence as a gap to fill.

## P2 — Out-of-scope-but-load-bearing reads remain implicitly relied on (recurring across runs)

Documenters again reached outside the declared `subpaths` for legitimate grounding:

- **catala** read root `README.md`, `copier.yml`, `code.json` to ground commands/vars — explicitly
  noted "allowed — the profile explicitly grounds commands/vars in the README and copier.yml" (catala
  log lines 4-7). Good: the `application-template` profile already legitimizes this.
- **azure** read `app-config/env-config/` to confirm the real `environment-variables.tf` filename
  before correcting the doc (azure log lines 43-44).
- **strata-unemployment** read the backing migration `db/migrate/2026031900…rb` (outside
  `unemployment/app`) only to ground attribute→column expansion (unemployment log lines 15-17, 27).

These all worked by good judgment. The `example-app` and `infra-template` profiles do not yet
explicitly permit a *targeted, read-only* out-of-scope read to verify a claim. The
`application-template` profile already does — propagate that one sentence to the other two profiles so
the practice is legitimized rather than tolerated.

## P2 — Process: `.logs/` accumulates stale logs from removed and skipped sources across runs

`.logs/` currently holds entries for **removed** sources (`template-application-flask`,
`template-application-nextjs` — gone from `sources.md`) and **skipped/unchanged** sources from a prior
full run (`app-template`, `documentai-api`, `platform-cli`, `strata-sdk`, `template-infra`),
intermixed with this run's 4 logs. A curator reading "**all** `*.distillation.md`" per the role file
can mis-attribute stale logs to the current run (the prior update-mode section of this report did
exactly that with flask/nextjs).

**Action:** in update mode, the skill should either (a) pass the curator the explicit list of sources
re-documented this run, or (b) prune `.logs/` of entries whose source is no longer in `sources.md`
before invoking the curator. At minimum, document in `SKILL.md` that `.logs/` is run-scoped and the
curator must scope to the sources actually re-documented this run.

## P3 — Revisit `platform-cli` `manages` edges for removed flask/nextjs ids (informational)

`platform-components.md:10-15, 21-22` keeps `template-application-nextjs` / `template-application-flask`
as canonical ids precisely so `platform-cli`'s `manages` references stay lint-valid even though both
templates were removed as documented sources (each surfaces as a `build_graph` `GAP:` line, by
design). No action this run — just confirming the soft-deprecation handling is the intended state, not
a defect. Revisit only if those templates are re-added or fully retired from the CLI.

## P3 — Source-shape signals that held up (informational)

- **SHA-pinning at write time worked for both NEW sources.** catala (`60d6db4a…`) and
  strata-unemployment (`480303cf…`) recorded resolved SHAs in `source_ref.ref` at first-time
  generation (catala log line 3; unemployment log line 4), and both changed sources (oscer, azure)
  re-pinned to their new SHAs. The doc-write-time pinning discipline from the prior report is holding;
  no churn observed this run.
- **Catala generated-code handling is a good pattern.** The documenter cited the existence of
  `src/generated/*` and the public symbols imported by `paidleave.py` rather than reading the
  machine-generated files (catala log lines 45-50) — a clean precedent for any future
  compiled/generated-output template.

---

# Prior full-run pass (historical — superseded for flask/nextjs by the section above)

Retained for the still-valid systemic recommendations below. NOTE: this section's treatment of
`template-application-flask` / `template-application-nextjs` as live NEW sources is **stale** — both
were since removed from `sources.md`. Read those two bullets as historical only.

## P0 (CLOSED) — `application-template` profile DocumentAI framing and install command

Both fixed; see "Two prior P0s are now CLOSED" above. Left here as a closed-item pointer.

## P1 — Profiles still don't state a target doc count / grouping axis; output shape re-invented per source

Recurring across runs and **still partly live**. The grouping decision is re-derived every time:

- application-template documenters land on 3 docs (overview / using / example) — the catala documenter
  this run also produced exactly that shape (catala log lines 60-62, 90-97), which is good, but only
  because the profile *implies* it.
- infra documenters vary: template-infra-azure collapsed ~20 operational docs into **5** guides this
  run (azure log lines 49-52, 84-95); template-infra kept 8 (prior run); strata-sdk kept 14.

**Action:** make the implied doc set explicit — `application-template.md` should state the 2 guides + 1
optional example as a hard target (it already describes them); `infra-template.md` should state a
target count / grouping axis for collapsing the shipped operational docs (the Azure run's "group by
operator journey, ~5 guides" is a good default to codify).

## P1 — Root-file scope is implicit; reconcile `sources.md` subpaths across sibling application-templates

Root-level files (`README`, `copier.yml`, `code.json`) are needed by every application-template
documenter but live outside the declared `subpaths`. The `application-template` profile now grounds
commands in the README/copier.yml (and the catala documenter relied on that), but `sources.md` subpath
sets still differ across sibling rows (catala + documentai-api both list `template template-only-docs`;
verify any future application-template row matches).

**Action:** state in `application-template.md` that root `README.md`, `copier.yml`, and (when present)
`code.json` are always in-scope grounding files regardless of `subpaths`; keep sibling `sources.md`
rows' subpaths consistent.

## P0/Process — SHA-pinning at write time (root cause of recurring full-re-document churn)

Largely **self-healing now** (see P3 above — both NEW sources and both changed sources pinned resolved
SHAs this run). Keep the rule documented in `agents/source-doc.md` and the frontmatter-schema reference
so `source_ref.ref` always carries the resolved commit, never the branch, to prevent regression.
