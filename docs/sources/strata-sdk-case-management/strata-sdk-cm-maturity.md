---
id: strata-sdk-cm-maturity
title: SDK maturity, gaps, and host-app workarounds
source: strata-sdk-case-management
doc_type: guide
tags: [strata-sdk-case-management, alpha, discovery-mode, workarounds, governance]
related:
  - strata-sdk-cm-getting-started
  - strata-sdk-cm-blueprints
  - strata-sdk-cm-case-type-config
feature_keys: []
demonstrates: []
component_keys: []
manages: []
integrates_with: []
summary: What alpha means for this SDK, which surfaces are still moving, and the expected process for unblocking yourself and tracking a workaround until the upstream fix lands.
source_ref:
  repo: https://github.com/navapbc/strata-sdk-case-management
  ref: 579d27695b7f5d655d8de020c65c256db3d05951
  paths:
    - docs/sdk-maturity-and-workarounds.md
    - AGENTS.md
    - README.md
    - docs/proposals/program-workflow-generator.md
    - skills/file-sdk-gap/SKILL.md
    - sdk/config-schema/src/version.ts
    - sdk/case-management-blueprints/README.md
last_documented: 2026-09-04
verified: ok
---

# SDK maturity, gaps, and host-app workarounds

This is a distillation of the SDK's own `docs/sdk-maturity-and-workarounds.md`, plus the
posture stated in `AGENTS.md` and `README.md`. Read it before you plan work that depends on
this SDK.

## Where the SDK is

`@nava-strata/case-management` and its sibling packages are **moving from proof of concept into
alpha**. Expect gaps, rough edges, and occasional breaking changes. The repository as a whole
is in **discovery mode**: `README.md` calls the patterns provisional and subject to removal,
and `AGENTS.md` tells contributors to treat existing code as "a hypothesis under test — a
snapshot of current thinking, not a settled specification".

Early adopter projects — benefits programs exercising the SDK against real workflows — are
**intentional**. Friction you hit while integrating is treated as useful signal about what the
SDK should become, not as evidence you picked the wrong library.

## Surfaces still maturing

The SDK's own doc names these explicitly:

- Registry contracts for rule evaluators, guards, and task handlers
- Task outcome handling and host-app effects after staff actions
- Evidence and signal ingestion patterns
- Host timeline and operational metadata beyond the core case record
- Packaging, optional dependencies, and cloud deployment ergonomics

## Configs are structural drafts

Generated or hand-authored `CaseTypeConfig` files are **structural drafts**. They help you model
lifecycle, criteria, and tasks; they are **not production-ready program specifications** until
your agency has validated policy, notices, appeals, and calculations. The same caveat applies to
the blueprint program types (see [Blueprints](./strata-sdk-cm-blueprints.md)).

## When you hit a bug or a gap

The guidance is unusually permissive, and deliberately so: **do what you need to do to get
unblocked.** A local workaround in your host application is always acceptable when the SDK does
not yet support what you need — **as long as it is visible, tracked, and removable.**

Don't run this by hand: the SDK ships a **`file-sdk-gap` skill** that covers steps 1-5 and is
the recommended way to do them. Given the gap, the host repo, and the workaround's code
location, it drafts all three artifacts — the upstream SDK issue, the host-repo tracking issue
carrying the `strata-sdk-gap` label, and the code comment at the workaround site — and reminds
you to remove the workaround once upstream is fixed. It *drafts*; it does not run `gh` for you,
so you review each artifact and run the commands yourself. The steps below are the underlying
contract the skill implements, and what you follow if you do it manually:

1. **Reproduce** the problem and reduce it to a minimal example where possible.
2. **File an issue** on the SDK repository:
   ```bash
   gh issue create --repo navapbc/strata-sdk-case-management --title "…" --body "…"
   ```
3. **Add a local workaround** in your host application if you need to keep shipping.
4. **Track the workaround in your host repo** — open an issue in the *application* repository
   describing the workaround and linking the SDK issue. Use a consistent label (for example
   `strata-sdk-gap`) so your team can find open workarounds later.
5. **Comment at the workaround site** in code, referencing your host-repo tracking issue so the
   bypass is discoverable and easy to remove.
6. **Remove the workaround** when the SDK issue is resolved, and close the tracking issue.

A tracking issue in each repository (rather than a static list in a README) lets GitHub
cross-link status and gives one live source of truth per repo. Beyond unblocking yourself,
report problems upstream so they get fixed in the SDK rather than becoming permanent, invisible
tech debt — and work with the Strata SDK team on the upstream fix if you have the bandwidth or
there is no clean local workaround.

`AGENTS.md` adds a standing obligation on top of any task: **surface contradictions and gaps
rather than smoothing them over**, offer to file an issue for each, and annotate the related
code with a reference back to it. GitHub issues are the single source of truth for all work in
that repo.

## "Unimplemented hooks" is not an error

If you explore a config in the workflow viewer and its validation report lists **unimplemented
hooks**, that is expected: the config names registry keys your host app must provide. The viewer
surfaces the contract; your application still implements the evaluators, guards, and task
handlers. See [Case type configuration and validation](./strata-sdk-cm-case-type-config.md).

## Gotchas

- **Breaking changes are anticipated, and `schemaVersion` is the tripwire.** Every generated
  config should carry one so a validator can warn when it was authored against a different
  schema. A config with no `schemaVersion` warns too.
- **The repo's narrative docs are thin by design.** `docs/` contains only this maturity note and
  one proposal; the operational instructions live in the agent skills under `skills/`, which
  `AGENTS.md` treats as authoritative for their tasks.
- **`docs/proposals/program-workflow-generator.md` is a build plan, not a description of shipped
  behavior.** Much of it has landed (`@nava-strata/config-schema`, the generator skill, the
  viewer app), but read the code before trusting any detail in it — and its Phase 3
  (in-website generation via MCP/API) is explicitly out of scope.
- **A workaround with no tracking issue is the failure mode this process exists to prevent.**
  Steps 4 and 5 are the ones that make the debt removable; skipping them is what turns a
  workaround into permanent tech debt. Running the `file-sdk-gap` skill is the cheapest way not
  to skip them.
