---
id: strata-sdk-cm-getting-started
title: Getting started with the Strata Case Management SDK
source: strata-sdk-case-management
doc_type: guide
tags: [strata-sdk-case-management, getting-started, typescript, monorepo, pnpm]
related:
  - strata-sdk-cm-case-type-config
  - strata-sdk-cm-case-lifecycle
  - strata-sdk-cm-blueprints
  - strata-sdk-cm-maturity
feature_keys: []
demonstrates: []
component_keys: []
manages: []
integrates_with: []
summary: What the TypeScript Strata Case Management SDK packages are, how to build them, and the minimal wiring needed to stand up a CaseSdk instance.
source_ref:
  repo: https://github.com/navapbc/strata-sdk-case-management
  ref: 579d27695b7f5d655d8de020c65c256db3d05951
  paths:
    - README.md
    - AGENTS.md
    - docs/sdk-maturity-and-workarounds.md
    - package.json
    - sdk/case-management-blueprints/README.md
    - sdk/core/package.json
    - sdk/types/package.json
    - sdk/config-schema/package.json
    - sdk/case-management-blueprints/package.json
    - sdk/core/src/index.ts
    - sdk/core/src/sdk-factory.ts
    - sdk/types/src/sdk.ts
    - sdk/core/src/__tests__/create-case-sdk.test.ts
last_documented: 2026-09-04
verified: ok
---

# Getting started with the Strata Case Management SDK

This is a **TypeScript/pnpm monorepo** (`navapbc/strata-sdk-case-management`), not the Rails
Strata SDK. The root package itself is `"private": true`;
the packages under `sdk/` are the publishable units, a family of `@nava-strata/*` npm packages for
modelling government
case management: a case record with a workflow, decision criteria, evidence, signals, and
tasks, all driven by a declarative `CaseTypeConfig`.

**Status.** `README.md` marks the repo **discovery mode** and `docs/sdk-maturity-and-workarounds.md`
marks the SDK **moving from proof of concept into alpha**. `AGENTS.md` is explicit that existing
code is "a hypothesis under test — a snapshot of current thinking, not a settled specification".
Read [SDK maturity and workarounds](./strata-sdk-cm-maturity.md) before you build on it.

## The packages

All four live under `sdk/` and are at version `0.1.0`, ESM-only (`"type": "module"`), published
under the `@nava-strata/*` scope. `README.md` names the target registry as GitHub Packages and
describes it as **private** (access required), yet every `sdk/*/package.json` sets
`publishConfig.access: "public"` — treat that discrepancy as unsettled rather than as a statement
of who can install these packages.

| Package (dir) | npm name | What it is |
|---|---|---|
| `sdk/types` | `@nava-strata/case-management-types` | Interfaces and error classes only; zero runtime dependencies |
| `sdk/core` | `@nava-strata/case-management` | The runtime: `createCaseSdk`, engines, operations, stores, event buses |
| `sdk/config-schema` | `@nava-strata/config-schema` | Zod schema + structural validators + standalone `validateConfig` |
| `sdk/case-management-blueprints` | `@nava-strata/case-management-blueprints` | Off-the-shelf PFML/SNAP program blueprints and a decision-criteria catalog |

Dependency direction (from the `package.json` files): `core` depends on `types` and
`config-schema`; `config-schema` depends on `types` and `zod`; `blueprints` depends only on
`types`. `types` depends on nothing at runtime, which is why the Zod schema cannot live there.

`core` declares `better-sqlite3` and `pg` as **optional peer dependencies** — see
[Stores and persistence ports](./strata-sdk-cm-stores.md).

## Prerequisites and repo commands

`README.md` states the prerequisites as **Node.js 24 LTS or higher** and **pnpm 11.1.1 or higher**.
The enforced floor is lower: root `package.json` `engines` only requires `node >=18.0.0` and
`pnpm >=8.0.0` (with `packageManager` pinned to `pnpm@11.1.1`), so the README numbers are guidance
rather than a hard gate.

```bash
npm install -g pnpm@11.1.1
pnpm install
pnpm build     # Turborepo build across all packages
pnpm test      # Vitest, run once (never watch)
```

Other root scripts from `README.md`: `pnpm test:watch`, `pnpm test:ui`, `pnpm test:coverage`,
`pnpm lint`, `pnpm format`, `pnpm format:check`, `pnpm type-check`. Releases go through
Changesets (`pnpm changeset`).

## Minimal wiring

`createCaseSdk(options)` in `sdk/core/src/sdk-factory.ts` is the composition root. Only two
options are required: a `store` and an `evaluators` map. The shape below follows the
fixtures in `sdk/core/src/__tests__/create-case-sdk.test.ts`.

```ts
import { createCaseSdk, InMemoryCaseStore } from '@nava-strata/case-management';
import type {
  CaseTypeConfig,
  EvaluationContext,
  EvaluationResult,
} from '@nava-strata/case-management-types';

const config: CaseTypeConfig = {
  id: 'simple-case',
  version: '1.0',
  criteria: [
    {
      id: 'income-check',
      name: 'Income Verification',
      dependsOn: [],
      initialStatus: 'pending',
      terminalStatuses: ['verified', 'rejected'],
      statusProgression: ['pending', 'under-review', 'verified', 'rejected'],
      ruleEvaluatorId: 'income-evaluator',
    },
  ],
  workflow: {
    id: 'simple-workflow',
    initialStatus: 'open',
    transitions: [
      { from: 'open', to: 'in-progress', trigger: { type: 'manual', action: 'start' } },
      { from: 'in-progress', to: 'closed', trigger: { type: 'manual', action: 'complete' } },
    ],
  },
};

const sdk = createCaseSdk({
  store: new InMemoryCaseStore(),
  evaluators: {
    'income-evaluator': (ctx: EvaluationContext): EvaluationResult => ({ status: 'verified' }),
  },
  configs: [config],
});

const caseRecord = await sdk.cases.create({
  caseTypeId: 'simple-case',
  metadata: { applicantName: 'A. Applicant' },
});
```

## The `CaseSdk` surface

`createCaseSdk` returns eight namespaces (`sdk/types/src/sdk.ts`):

- `sdk.cases` — `create`, `get`, `list`, `updateMetadata` ([case lifecycle](./strata-sdk-cm-case-lifecycle.md))
- `sdk.signals` — `push` ([evidence, signals, criteria](./strata-sdk-cm-evidence-signals-criteria.md))
- `sdk.evidence` — `add`, `addWithSignals`, `list`, `get`
- `sdk.criteria` — `reopen`, `evaluate`
- `sdk.workflow` — `transition`, `getAvailable` ([workflow and transitions](./strata-sdk-cm-workflow.md))
- `sdk.tasks` — full task lifecycle ([tasks](./strata-sdk-cm-tasks.md))
- `sdk.events` — `on`, `onAll`, `getForCase` ([events and hooks](./strata-sdk-cm-events-and-hooks.md))
- `sdk.config` — `register`, `resolve`, `current` ([case type configuration](./strata-sdk-cm-case-type-config.md))

## Gotchas

- **`options.evaluators` is required and validated at registration.** `configs` passed to the
  factory are registered immediately, and `ConfigurationRegistryImpl.register` throws
  `ConfigurationError` if any `ruleEvaluatorId` or custom `guardId` in the config has no entry
  in `evaluators` / `guards`. Register the code first, the config second.
- **`options.humanIdGenerator` is typed `any`** in `CaseSdkOptions` (`sdk/types/src/sdk.ts`),
  even though `HumanIdGenerator` is a real exported interface in
  `sdk/core/src/operations/human-id-generator.ts`. You get no type checking on it today.
- **The types package is interfaces plus error classes.** `sdk/types/src/errors.ts` and
  `sdk/types/src/signals.ts` do emit runtime code (error classes; `findSignal`, `hasSignal`,
  `signalValue`), so "zero runtime dependencies" means no third-party deps, not no runtime output.
- **Where the repo's own docs live.** Only `docs/sdk-maturity-and-workarounds.md` and
  `docs/proposals/program-workflow-generator.md` exist under `docs/`. The rest of the
  narrative documentation is in `README.md`, `AGENTS.md`, `GOVERNANCE.md`, `CHANGESETS.md`, the
  blueprints package README (`sdk/case-management-blueprints/README.md`, the only per-package
  README today), and the agent skills under `skills/` (which `AGENTS.md` lists as the
  authoritative task instructions).
