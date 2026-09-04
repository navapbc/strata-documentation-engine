---
id: strata-sdk-cm-stores
title: Persistence ports and store adapters
source: strata-sdk-case-management
doc_type: feature
tags: [strata-sdk-case-management, persistence, casestore, sqlite, postgres, optimistic-concurrency]
related:
  - strata-sdk-cm-case-lifecycle
  - strata-sdk-cm-events-and-hooks
  - strata-sdk-cm-getting-started
feature_keys: []
demonstrates: []
component_keys: []
manages: []
integrates_with: []
summary: The CaseStore and EventStore ports, the in-memory, SQLite, and Postgres adapters, their optional native drivers, and the optimistic-concurrency contract every adapter must honor.
source_ref:
  repo: https://github.com/navapbc/strata-sdk-case-management
  ref: 579d27695b7f5d655d8de020c65c256db3d05951
  paths:
    - sdk/types/src/ports.ts
    - sdk/types/src/errors.ts
    - sdk/core/package.json
    - sdk/core/src/index.ts
    - sdk/core/src/stores/in-memory-case-store.ts
    - sdk/core/src/stores/sqlite-case-store.ts
    - sdk/core/src/stores/postgres-case-store.ts
    - sdk/core/src/stores/sqlite-event-store.ts
    - sdk/core/src/operations/human-id-generator.ts
    - sdk/core/src/concurrency/case-mutex.ts
    - sdk/core/src/__tests__/postgres-case-store.contract.test.ts
    - sdk/core/src/__tests__/case-store-contract.ts
last_documented: 2026-09-04
verified: ok
---

# Persistence ports and store adapters

The SDK owns no database. `options.store` is required and must implement `CaseStore`; event
persistence is a separate, optional `EventStore`.

## The `CaseStore` port

```ts
interface CaseStore<TMeta = Record<string, unknown>> {
  insert(caseRecord: CaseRecord<TMeta>): Promise<void>;
  update(caseRecord: CaseRecord<TMeta>): Promise<void>;
  findById(caseId: string): Promise<CaseRecord<TMeta> | null>;
  find(query: CaseQuery): Promise<CaseRecord<TMeta>[]>;
  insertTask(task: TaskInstance): Promise<void>;
  updateTask(task: TaskInstance): Promise<void>;
  findTaskById(taskId: string): Promise<TaskInstance | null>;
  findTasks(query: TaskQuery): Promise<TaskInstance[]>;
}
```

Cases and tasks live behind the **same** port — a custom adapter must implement all eight
methods.

**The concurrency contract is part of the port.** `update` receives the full updated record and
replaces the previous version; it MUST compare `caseRecord.version` against the stored version,
throw `ConcurrencyError` when they differ, and increment the version on success. Version
checking is the only protection against writes from separate processes; within a single process
`CaseMutex` (`sdk/core/src/concurrency/case-mutex.ts`) additionally serializes operations on the
same case (see [Case lifecycle](./strata-sdk-cm-case-lifecycle.md)).

`CaseQuery` supports `caseTypeId`, `status` (string or array), `configVersion`, `humanId`,
`limit`, `offset`. `TaskQuery` supports `caseId`, `assignee`, `status`.

A shared contract suite in `sdk/core/src/__tests__/case-store-contract.ts` is parameterized by a
store factory and run against every adapter, so a custom store can be verified against the same
expectations. The Postgres run is gated on `TEST_DATABASE_URL`: when that variable is unset the
suite is replaced by a single skipped placeholder test.

## The adapters

All three are exported from `@nava-strata/case-management`.

### `InMemoryCaseStore`

No arguments. Keeps two `Map`s and deep-copies with `structuredClone` on the way in and out,
so callers never hold a live reference to stored state. Intended for consumer-side testing of
evaluators and guards without a database. `insert` throws a plain `Error` on a duplicate id;
`update` throws `ConcurrencyError` on a version mismatch and bumps the version. It also offers a
convenience `findByHumanId(humanId)` that is not part of the port.

### `SqliteCaseStore`

`new SqliteCaseStore(dbPath)`. Creates the parent directory, opens `better-sqlite3` with
`journal_mode = WAL` and `foreign_keys = ON`, and initializes a **normalized relational schema**
— domain entities as first-class tables rather than JSON blobs:

`cases` (aggregate root) → `evidence`, `criteria` → `signals`, `evaluation_history`, plus
`tasks`. `metadata`, signal `value`, and resolved values are JSON-encoded text; dates are ISO
strings. `human_id` is added by a migration step rather than by the base `CREATE TABLE`, so both
new and pre-existing databases get the column and its partial unique index.

`update` runs in a transaction: a version-guarded `UPDATE ... WHERE id = ? AND version = ?`
(writing `version + 1`), then a delete-and-reinsert of the criteria and evidence children.
Zero affected rows means either not-found (plain `Error`) or `ConcurrencyError`.

### `PostgresCaseStore`

`new PostgresCaseStore(connectionString)` or `new PostgresCaseStore(pool)`. Unlike the SQLite
adapter it uses **JSONB for `criteria`, `evidence`, and `metadata`** and native `TIMESTAMPTZ`
for dates, with a `tasks` table carrying a `CHECK` on status.

`initialize()` is idempotent and can be awaited explicitly to create the tables and indexes up
front, but every method also self-initializes: each one begins with a `if (!this.isInitialized)
{ await this.initialize(); }` guard, so a missed call is not an error. `update` is a single
version-guarded statement writing `version + 1`.

### `SqliteEventStore`

`new SqliteEventStore(dbPath)` — an `EventStore` implementation keeping a `case_events` table
(`id` — an autoincrement surrogate key — plus `event_id`, `case_id`, `event_type`, `timestamp`,
`actor`, `data`) indexed by case, type, and
timestamp. Events are stored via `serializeCaseEvent` and read back with
`deserializeCaseEvent`, ordered by `timestamp ASC, id ASC`. It also exposes `close()`.

## Optional native drivers

`sdk/core/package.json` declares `better-sqlite3` and `pg` as **optional peer dependencies**.
Both adapters `createRequire`-load their driver lazily inside the constructor, so importing the
package barrel does not resolve a driver you are not using — install only the one your backend
needs.

```ts
import { createCaseSdk, SqliteCaseStore, SqliteEventStore } from '@nava-strata/case-management';

const sdk = createCaseSdk({
  store: new SqliteCaseStore('./data/cases.db'),
  eventStore: new SqliteEventStore('./data/events.db'),
  evaluators: { /* ... */ },
});
```

## Gotchas

- **The two SQL adapters model the case differently.** SQLite normalizes criteria, signals,
  evidence, and evaluation history into tables; Postgres stores them as JSONB columns. Queries
  and migrations you write against one do not transfer to the other, even though both satisfy
  the port.
- **Schema creation happens at different times.** SQLite creates its schema in the constructor;
  Postgres creates it on the first awaited call (or on an explicit `await initialize()`), so with
  Postgres the first operation pays the schema-creation round trip.
- **`update` is a whole-record replace.** The SQLite adapter deletes and re-inserts the criteria
  and evidence children on every update, so throughput is proportional to case size, not to what
  changed.
- **Task writes have no version check.** `insertTask` / `updateTask` carry no optimistic
  concurrency token, so concurrent task updates are last-write-wins.
- **`findByHumanId` is adapter-specific.** It exists on all three shipped adapters but is not part
  of the `CaseStore` port; use `find({ humanId })` for portable code.
- **`HumanIdStore` is a separate port from `CaseStore`.** `SqliteHumanIdStore` takes an already
  open `better-sqlite3` `Database` (not a path) and manages its own `human_id_sequences` table;
  the default is `InMemoryHumanIdStore`, whose sequence resets on restart.
