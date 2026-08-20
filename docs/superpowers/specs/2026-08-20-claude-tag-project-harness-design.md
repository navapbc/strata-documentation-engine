# Claude Tag project harness — design

- **Date:** 2026-08-20
- **Status:** approved design, not yet planned
- **First consumer:** `navapbc/strata-documentation-engine` (this repo)
- **Work store:** [rebar](https://github.com/navapbc/rebar), CLI and library

## Problem

Claude Tag puts a capable agent in a Slack channel with repository access, and out of the box it
already handles a surprising amount: it clones a granted repo, reads `CLAUDE.md` and `.claude/`
configuration, posts a live checklist, and opens draft pull requests as the Claude GitHub App. A
harness that only re-implemented that would be waste.

Two gaps remain, and both bite a team running several concurrent threads a day.

**Authority is per-channel and uniform.** Access comes from the Access bundles attached to the
channel's scope, so every member of that channel has identical capability regardless of their own
repository permissions. Claude Tag has no per-channel responder allowlist, no per-user spend cap on
channel work, and no notion of tiers. Any member can steer any live thread by replying in it without
re-mentioning Claude, can create standing credential-bearing routines, and can write or delete
channel memory.

**There is no cross-thread durable work state.** Each Slack thread gets its own sandbox; two threads
in the same channel are two sessions that share nothing. Sandbox files do not survive idle. Channel
memory is explicitly not a tracker — the documentation describes it as "a curated note, not a
transcript," warns that long entries crowd out everything else, and directs longer material to a
repository instead. Past session transcripts can be listed and read but not full-text searched. So
nothing native holds a backlog, expresses dependencies, or answers "what is ready" and "who is
blocked."

At several threads a day those gaps produce concrete failures: two threads doing the same work, two
threads editing the same files, and no answer to what the project's actual state is.

## Decisions

| Decision | Rationale |
|---|---|
| Rebar is the only work store. No Jira, no GitHub Issues. | Nobody outside the channel needs a tracker surface. A reconciler would add credentials, a CI bridge, drift handling, and two-way sync failure modes for no consumer. |
| One private channel, no tiers. | Claude Tag cannot express per-person authority inside a channel. Channel membership *is* the authority list; that is made explicit and reviewed rather than worked around. |
| Every gate is on the artifact, not the requester. | The platform controls ingestion, not us. A gate that asks "who sent this" is unenforceable; a gate that asks "is this diff allowed" is enforceable. |
| Enforcement is executable, never prose. | Hooks, CI checks, branch protection, and Agent Proxy hold whether or not the model cooperates. Custom instructions are advisory, so nothing important lives only there. |
| Rebar via CLI and library, never MCP. | A repository's `.mcp.json` is never loaded by a Claude Tag session, and connections come only from the Access bundle. Rebar's store is a git branch, so the CLI is sufficient. |
| Split delivery: skills repository plus in-repo spine. | Repository skills load only after Claude clones that repo, and the skills-repo pattern adds auto-sync with mandatory human merge. The platform's loading order forces the split. |
| Never mark a PR ready for review, never merge. | The one authority the harness must not hold. Human review is the last gate and it stays human. |

## Architecture

Three pieces, edited differently.

1. **Skills repository** (new repo, registered as a plugin marketplace with auto-sync). Carries the
   channel verbs. Claude can open pull requests against it to improve its own skills; every change
   requires a human merge before it reaches channels.
2. **In-repo spine** (`harness/` in the consumer repo). Deterministic Python that decides what is
   allowed. Reproducible, testable without a sandbox, and the authority the skills defer to.
3. **In-repo hooks** (`.claude/settings.json`). Blocking `PreToolUse` hooks that turn the spine's
   decisions into refusals inside the session. This repo already registers reminder-only hooks in
   `scripts/hooks/`; these extend the same mechanism to deny rather than nudge.

### Layout in the consumer repo

```
harness/
  __init__.py  config.py  provenance.py  diff_policy.py
  tickets.py   report.py  gate.py        denylist.yml
  PAUSED                       # present only when the harness is stopped
scripts/hooks/harness_guard.py # blocking PreToolUse hook, registered in .claude/settings.json
rules/harness.md               # paths: harness/**, skills/harness-*/**
tests/                         # one test module per spine module, plus fixtures/injections/
.github/workflows/harness-gate.yml   # required check; re-runs the gate outside the sandbox
```

The spine runs as `python -m harness.gate`, matching this repo's existing
`python -m scripts.x` convention; `pyproject.toml` already sets `pythonpath = ["."]`.

### Verbs

Delivered as skills; all available to every channel member.

| Verb | Does | Reuses |
|---|---|---|
| `harness-report` | State of the project, what is ready, what is blocked, what shipped | new |
| `harness-explain` | Answer a question about the repo, read-only | new |
| `file-ticket` | Thread becomes a rebar ticket, duplicate-checked and templated | `create-issue` |
| `refine-ticket` | Product-owner versus senior-engineer debate for readiness | `refine-issue` |
| `link-ticket` | Typed relations, tags, close | new |
| `claim-and-implement` | Claim a ready ticket, branch, test-first, run the pipeline, record file impacts, push | new |
| `open-draft-pr` | Template filled, gate green, opened as draft | `create-pr` |

The existing `create-issue`, `refine-issue`, `create-pr`, and `review-draft` skills stay unchanged
for local Claude Code work. Harness verbs invoke them rather than forking their content, so house
style and review discipline have one definition. `review-draft` runs before every durable artifact,
which is this repo's existing "never file the first draft" rule holding in a new surface.

`claim-and-implement` requires a ticket that already exists and is `ready`. There is no path from a
bare mention to code. Every diff traces to a scoped ticket with a refinement history, which is also
what makes work that arrived by injection stand out — it has no such history.

### Spine modules

| Module | One job | I/O |
|---|---|---|
| `config.py` | Load harness config; check the `PAUSED` file; confirm repo and channel identity | filesystem |
| `provenance.py` | Split a session's input into task and evidence; flag imperatives found in evidence | pure |
| `diff_policy.py` | Path denylist plus change budget, returning pass or a named refusal | pure |
| `tickets.py` | Rebar adapter; stamps every write with requester and thread permalink | rebar |
| `report.py` | Rebar event log replayed into thread-ready markdown | rebar |
| `gate.py` | Run the ladder; print `GATE_OK` or `GATE_REFUSED: <reason>` | orchestrator |

`report.py` carries the principle that makes channel output trustworthy: every number comes from a
deterministic replay of the event log, never from the model's reading of it. The model narrates, the
script computes. This is what `build_graph` already does for documentation.

`provenance.py` is deliberately scoped to what it can actually do. It cannot gate ingestion — thread
replies reach a running session whether or not the harness approves, and any channel member can
steer a thread someone else started. What it can do is refuse to *act* on imperatives sourced from
evidence rather than from a ticket, and report them in the thread as ignored. The stronger control
for who may steer is the Enterprise RBAC capability, under which a restricted member's replies are
not read at all.

**Layering rule**, recorded in `rules/harness.md` with `paths:` frontmatter so it auto-loads: skills
may ask the spine, never re-implement its checks. A skill that decides for itself whether a path is
allowed has defeated the design.

## Enforcement stack

Six layers, five of which hold without model cooperation.

| Layer | Enforces | Model can bypass |
|---|---|---|
| Agent Proxy and bundle | Which hosts and repositories are reachable at all; credentials injected at the boundary, never placed in the sandbox | No |
| Auto mode permission checker | Per-action review, with narrow per-scope allow rules | No |
| `.claude/settings.json` hooks | Path denylist, branch namespace, no pull request without `GATE_OK` | No |
| Required CI check | Ticket linkage, change budget, denylist re-check, provenance stamp | No |
| Branch protection | Human approval to merge; no force-push on `main` or `tickets` | No |
| Channel custom instructions | Standing rules, with member edits blocked | Yes — so nothing important lives only here |

The CI check re-validates what the hooks already checked. That redundancy is the point: hooks run
inside the sandbox, CI runs outside it on GitHub, so a compromised or confused session cannot
advance a pull request past a check it does not control.

### Path denylist

The harness cannot produce a diff touching any of these; changes to them go through an ordinary
human pull request.

- `.github/workflows/` — Claude *can* edit workflow files and open a pull request with the change,
  and a same-repo pull request branch runs CI with repository secrets. This is the sharpest
  escalation path available and the denylist's main reason to exist.
- `.github/CODEOWNERS` — otherwise the file protecting everything else is editable in one pull request.
- `.claude/settings.json` and `scripts/hooks/` — the in-session enforcement itself.
- `harness/denylist.yml` and `rules/` — the policy and the standing rules.

Claude Tag's fixed GitHub App permissions already prevent dispatching a workflow, approving a run
awaiting approval, approving pending deployments, deleting runs or logs, and enabling or disabling
workflows. No admin setting or custom token widens that. The denylist covers what remains.

### Channel configuration

- Private channel. Membership is the authority list, reviewed on a stated cadence. Private also
  keeps the project's memory in the channel's own store; memory from a public channel becomes
  workspace-wide memory readable from every other channel.
- Bundle attached to that channel only — never to the workspace or to Default Slack access, since
  isolation comes from the attachment point rather than from the bundle.
- Repository granted in that bundle only. A repository granted in one bundle is unreachable from a
  channel under a different one.
- Restricted egress: minimal Domains list, and an environment pinned to a stricter network access
  level than the default Trusted access.
- Auto mode allow rules kept narrow or empty, so the permission checker keeps reviewing.
- Guests already excluded by default; Slack Connect channels never run sessions.
- Per-channel spend limit set deliberately. Work that would exceed it is declined, not truncated.
- Custom instructions set at the channel scope with member edits blocked: pin the repository (a
  session starts with nothing checked out and clones only what the request names), require
  ticket-first work, and forbid marking any pull request ready for review.

### Routines are an authority surface

Any channel member can create a routine — a scheduled job, channel watch, or pull request
subscription — that runs with the channel's full credentials. Routines survive their creator leaving
the organization, and stop only if the creator is removed from the channel. The harness therefore
includes a standing weekly routine audit (`@Claude !routines`) whose output is posted to the channel,
so standing work stays visible rather than accumulating unseen.

## Data flow

1. A member mentions `@Claude` in the channel with a task. A sandbox builds for that thread.
2. Claude clones the repository named by the channel's custom instructions. `CLAUDE.md`,
   `.claude/rules/*.md`, `.claude/skills/`, and `.claude/settings.json` hooks load on the next turn.
3. The verb runs. `config.py` checks `PAUSED` and repository identity first; `provenance.py`
   separates task from evidence.
4. Ticket writes go through `tickets.py` to the rebar event log on the `tickets` branch, each stamped
   with requester and thread permalink, auto-committed and pushed.
5. Code work claims a ready ticket first. Concurrent threads cannot claim the same ticket, and
   recorded file impacts keep them off the same files.
6. Before any durable artifact, `gate.py` runs and must print `GATE_OK`. Hooks refuse the action
   otherwise.
7. A draft pull request opens as the Claude GitHub App, linked to both the ticket and the thread. CI
   re-runs the gate as a required check. A human reviews and merges.

## Failure handling

- Everything fails closed. A missing config, an unparseable denylist, a rebar error, or any gate
  error refuses the action and posts the named reason in the thread, so a legitimately blocked
  request is actionable rather than mysterious.
- Claims carry a lease. A sandbox released mid-work leaves a reclaimable ticket rather than a wedged
  one.
- A `tickets` branch push conflict retries once on rebar's union merge, then reports.
- Exceeding the change budget is a handoff, not an error: post the branch and diffstat, and ask a
  human to open the pull request.
- `harness/PAUSED`, committed, stops the harness in a one-line pull request that any contributor can
  land. Setting the scope's Claude Tag version to **Off** is the platform-level equivalent.

## Testing

The guardrails are the product, so they carry the heaviest coverage. Test-first, per this repo's
convention.

- `test_config.py`: `PAUSED` short-circuits everything; wrong repository refused; malformed config
  refuses rather than defaults.
- `test_provenance.py`: task and evidence classified correctly, including directives planted in
  ticket bodies, pull request comments, and fetched pages.
- `test_diff_policy.py`: every denylisted path rejected, including via symlink, `..` traversal, and
  case variants; change budget boundaries.
- `test_gate.py`: ladder ordering and short-circuit behavior; exact sentinel strings.
- `test_report.py`: rendered numbers match a deterministic replay of a fixture event log.
- `test_tickets.py`: every write carries a requester and thread-permalink stamp; a push
  conflict retries exactly once; a rebar error refuses rather than proceeding.
- `tests/fixtures/injections/`: a corpus of injection attempts that provenance and gate must all
  classify as evidence. This is the regression suite for the security model, and every incident adds
  a case.

## Out of scope for v1

- Jira and GitHub Issues, in any direction.
- Multi-repository orchestration.
- Any authority to mark a pull request ready for review or to merge. Not deferred — excluded.
- A custom Slack app or Block Kit surface. Claude Tag is the interface.
- Changes to `generate-strata-docs`. The harness is additive to it.

## Verify before implementation

These are external facts to confirm, not undecided design. Each one can change the plan.

1. **Zero Data Retention.** Claude Tag retains channel memory and session transcripts and is
   therefore unavailable to organizations with ZDR enabled. Confirm Nava's Claude organization does
   not require ZDR before any further work.
2. **Enterprise Grid pairing.** On a Grid whose workspaces pair to different Claude organizations,
   one organization's access settings govern the entire grid, so restrictions set here may not be
   enforced. Confirm Nava's Grid topology.
3. **Environment and setup script.** The cloud environments and customize documentation describe a
   per-scope Environment setting selecting an organization-shared environment with setup scripts,
   environment variables, and network levels. The GitHub configuration page states there is no setup
   script or custom image and directs dependency installs to `CLAUDE.md`, re-run each session.
   Resolve which applies to Claude Tag channel sessions. If no setup script is available, rebar
   installs per session from PyPI on `CLAUDE.md` guidance, which is slower and only advisory —
   worth measuring before committing to the design's latency assumptions.
4. **Rebar availability.** `nava-rebar` must be installable from the sandbox's allowed egress, and
   pinned to a known version.
