# Verification findings: strata-sdk-cm-events-and-hooks (round 2)

Doc: `docs/sources/strata-sdk-case-management/strata-sdk-cm-events-and-hooks.md`
Source: `.sources/strata-sdk-case-management` @ `579d27695b7f5d655d8de020c65c256db3d05951`

## Summary

Round 1 identified three findings regarding event publication framing, the `afterTransition` hook timing, and the hook-runner helper usage. All three have been addressed in the updated document:

1. **Event publication timing** (round 1, finding 1) — Document now correctly qualifies that `EvaluationEngine` publishes `rule-evaluated`, `rule-evaluation-failed`, and `criterion-status-changed` inline before the caller persists, while operations classes publish after the atomic store write. Opening section (lines 41–53) accurately states: "the evaluation event can be delivered for a change that never commits."

2. **`afterTransition` hook timing** (round 1, finding 2) — Gotchas section (lines 177–181) now correctly states the hook fires at step 8, before auto-transition settling, the `updatedAt` bump, and the store write, directly addressing the contradiction in the type comment.

3. **Hook-runner wrappers usage** (round 1, finding 3) — Gotchas section (lines 169–176) updated to state the wrappers are "exported but unused by the SDK itself" rather than "not used everywhere," with evidence of how every call site inlines its own try/catch.

## Verification

Re-verified all major claims against source:
- The 13-member `CaseEvent` discriminated union, payloads, and publication semantics ✓
- BaseEvent structure, MessageBus/EventStore ports ✓
- CompositeMessageBus dual-publish and internal-error isolation ✓
- InProcessEventBus parallel handlers with try/catch, `on()` returning unsubscribe ✓
- WebhookMessageBus config defaults (5000 ms, 2 retries, 1000 ms delay), best-effort behavior, throwing `on`/`onAll` ✓
- Event serialization: `Map`→object, `Date`→ISO string, `humanId` absent from `SerializedCaseRecord` ✓
- Eight lifecycle hooks with correct names and descriptions ✓
- All gotchas: `humanId` loss, error-message-only in `rule-evaluation-failed`, `WebhookMessageBus.on()` throws, `InProcessMessageBus` alias, `getForCase` returning `[]` with no store, unguarded task hooks ✓
- SDK factory wiring: `options.events` defaults to `InProcessEventBus` (sdk-factory.ts:49) ✓
- `afterTransition` hook runs before persistence (workflow-operations.ts:141–156 before store.update at :166) ✓

## Findings

None — the document is fully supported by the source. Round 1 findings have been properly incorporated.
