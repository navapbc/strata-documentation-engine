# Curation report — documentation-gathering improvements

Advisory only. Produced once after the verify→fix loop. These are recommendations for improving how
the engine *gathers* docs (profiles, registries, source-access, process) — not edits to the docs
themselves. Nothing here touches frontmatter, the graph, or the verify loop.

This file is **cumulative**: each run preserves still-valid recommendations and appends/merges new
ones under a dated section. The most recent pass is at the top.

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
