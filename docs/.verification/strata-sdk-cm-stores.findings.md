# Verification findings: strata-sdk-cm-stores (round 2)

Doc: `docs/sources/strata-sdk-case-management/strata-sdk-cm-stores.md`
Source: `.sources/strata-sdk-case-management` @ 579d27695b7f5d655d8de020c65c256db3d05951
Status: VERIFIED — All round 1 findings addressed, no new findings

## Round 1 findings — all resolved

1. **Postgres self-initialization**: ✓ FIXED — Document now correctly states "every method also
   self-initializes" and "a missed call is not an error" (lines 107-109).

2. **`findByHumanId` on Postgres**: ✓ FIXED — Now correctly states "It exists on all three shipped
   adapters but is not part of the `CaseStore` port" (line 151).

3. **Scope of version protection**: ✓ FIXED — Correctly scoped: "Version checking is the only
   protection against writes from separate processes; within a single process `CaseMutex` ...
   additionally serializes operations on the same case" (lines 61-64).

4. **Contract suite gating**: ✓ FIXED — Added note: "The Postgres run is gated on
   `TEST_DATABASE_URL`: when that variable is unset the suite is replaced by a single skipped
   placeholder test" (lines 71-72).

5. **`human_id` migration scope**: ✓ FIXED — Correctly states "so both new and pre-existing
   databases get the column and its partial unique index" (lines 94-95).

6. **Event-store `id` column**: ✓ FIXED — Now includes `id` in column list: "(`id` — an
   autoincrement surrogate key — plus `event_id`, `case_id`, `event_type`, `timestamp`, `actor`,
   `data`)" (lines 115).

## Round 2 verification

Comprehensive re-verification of all claims against current source checkout confirms:

✓ `CaseStore` interface: 8 methods, exact signatures match
✓ Concurrency contract: properly documented as part of port
✓ `CaseQuery` fields: `caseTypeId`, `status`, `configVersion`, `humanId`, `limit`, `offset`
✓ `TaskQuery` fields: `caseId`, `assignee`, `status`
✓ Shared contract suite: parameterized, run against adapters, TEST_DATABASE_URL gate works
✓ InMemoryCaseStore: `structuredClone` copies, duplicate throws `Error`, version mismatch throws
  `ConcurrencyError`, `findByHumanId` convenience method
✓ SqliteCaseStore: WAL + `foreign_keys = ON`, normalized schema (criteria/signals/evidence/
  evaluation_history as tables), human_id via migration, transactional update with delete-and-
  reinsert
✓ PostgresCaseStore: JSONB for criteria/evidence/metadata, TIMESTAMPTZ for dates, self-
  initializing, single version-guarded update, `findByHumanId` method
✓ SqliteEventStore: `case_events` table with autoincrement `id`, serialization via
  `serializeCaseEvent`/`deserializeCaseEvent`, ordered by `timestamp ASC, id ASC`
✓ Optional peer dependencies: lazy `createRequire` loading for both `better-sqlite3` and `pg`
✓ Schema creation timing difference: SQLite in constructor, Postgres on first operation
✓ Task writes: no version check, last-write-wins
✓ `HumanIdStore` port: separate from `CaseStore`, `SqliteHumanIdStore` takes Database object,
  default is `InMemoryHumanIdStore` (sequence resets on restart)
✓ `CaseMutex`: per-case serialization within single process

**No new findings in round 2.**
