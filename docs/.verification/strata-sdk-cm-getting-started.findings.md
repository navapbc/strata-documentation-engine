# Verification findings: strata-sdk-cm-getting-started

- Doc: `docs/sources/strata-sdk-case-management/strata-sdk-cm-getting-started.md`
- Source: `.sources/strata-sdk-case-management` @ `579d27695b7f5d655d8de020c65c256db3d05951`
- Round: 2
- Verdict: fully supported; all round 1 findings addressed, no new findings.

## Checked and confirmed (Round 2)

All claims from Round 1 re-verified and confirmed current:

- Status framing ("discovery mode", "hypothesis under test", "moving from proof of concept into
  alpha") — verified against `README.md:5`, `AGENTS.md:10`, `docs/sdk-maturity-and-workarounds.md:4`.
- Four packages (types, core, config-schema, blueprints) at `0.1.0`, `"type": "module"`, all
  `@nava-strata/*` scope — confirmed in `sdk/*/package.json`.
- Dependency direction: `core` → `types` + `config-schema`; `config-schema` → `types` + `zod`;
  `blueprints` → `types` (runtime) — verified against all package.json `dependencies` sections.
- `better-sqlite3` / `pg` optional peer dependencies in `core` — confirmed in
  `sdk/core/package.json` `peerDependenciesMeta`.
- Root `package.json` prerequisites (Node >=18.0.0, pnpm >=8.0.0) vs README guidance (Node 24 LTS,
  pnpm 11.1.1) — **now clearly stated** in doc: "README numbers are guidance rather than a hard
  gate" (matching Round 1 fix).
- Eight namespaces and their methods match interface definitions in `sdk/types/src/sdk.ts` and
  return object in `sdk/core/src/sdk-factory.ts:199-209`.
- CaseOperations: create, get, list, updateMetadata (verified).
- SignalOperations: push (verified).
- EvidenceOperations: add, addWithSignals, list, get (verified).
- CriteriaOperations: reopen, evaluate (verified).
- WorkflowOperations: transition, getAvailable (verified).
- EventOperations: on, onAll, getForCase (verified).
- ConfigOperations: register, resolve, current (verified).
- TaskOperations: full lifecycle (create, complete, cancel, assign, get, listForCase,
  listForAssignee) — verified.
- Minimal-wiring example follows `validLinearConfig` fixture and test
  `sdk/core/src/__tests__/create-case-sdk.test.ts:258-268`; `store` and `evaluators` only required
  options; RuleEvaluatorFn accepts both sync and async returns.
- CaseTypeConfig example has all required fields (id, version, workflow, criteria); shape
  matches `sdk/types/src/workflow.ts:58-66` and `sdk/types/src/entities.ts:24-35`.
- Gotchas re-verified:
  - ConfigurationRegistryImpl throws ConfigurationError (`sdk/core/src/config/configuration-registry.ts:40,57,62,76,94`).
  - `humanIdGenerator?: any` in CaseSdkOptions (`sdk/types/src/sdk.ts:51`); HumanIdGenerator
    interface exists in `sdk/core/src/operations/human-id-generator.ts:11`.
  - Types package emits runtime code: error classes (`errors.ts`) and signal helper functions
    (`signals.ts`: findSignal, hasSignal, signalValue).
- Publishing claim — **fixed in Round 1**: doc now states "README.md names the target registry as
  GitHub Packages and describes it as **private** (access required)" and notes the `publishConfig.access: "public"` discrepancy.
- Per-package README — **fixed in Round 1**: doc now says "the blueprints package README
  (`sdk/case-management-blueprints/README.md`, the only per-package README today)".
- Docs under `docs/`: only `sdk-maturity-and-workarounds.md` and `proposals/program-workflow-generator.md` exist (verified with `find`).
- All 8 internal doc links (case-lifecycle, evidence-signals-criteria, workflow, case-type-config, events-and-hooks, stores, tasks, maturity) resolve to existing files in `docs/sources/strata-sdk-case-management/`.
- Skills exist (7 found: audit-sdk-integration, file-sdk-gap, implement-config-checklist, program-workflow, sdk-data-model, task-outcome-wiring, verify-external-check, wire-external-evidence).

## Findings

None. The document is fully supported by the source and all Round 1 findings have been appropriately addressed.
