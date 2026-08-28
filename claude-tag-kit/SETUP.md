# Set up a Claude Tag project channel

How to stand up a Slack channel plus GitHub repository where non-engineers can build a project with
Claude Tag and evaluate the result themselves.

Roles are marked on each step: **[GitHub org]** needs owner access to the GitHub organization,
**[Eden]** goes through an Eden ticket rather than a console you control, **[Repo]** needs write
access to the repository, **[Anyone]** is any channel member.

No step here needs the Owner role in your Claude organization. Everything that does is gathered into
one table under step 2, as things to request rather than things to do.

## Scope: demos and internal tools

This kit is for **demos and internal tools** — things Nava builds for itself. It is deliberately not
written for client-facing work or anything handling client data, and it omits the controls that would
need.

Two platform constraints are therefore treated as out of scope rather than removed. Revisit both
before any client use:

- **Retention.** Claude Tag retains channel memory and session transcripts, and is unavailable to
  organizations with Zero Data Retention enabled. ZDR is not self-serve; Anthropic's account team
  enables it per organization.
- **Enterprise Grid.** On a Grid whose workspaces pair to different Claude organizations, one
  organization's settings govern the entire grid, so restrictions set here may not be enforced. This
  matters when you are relying on restrictions to protect something. For internal work, you mostly
  are not.

## Before you start

Claude Tag is Team and Enterprise only, on Anthropic's first-party service, and your Claude
organization must be paired to your Slack workspace.

Two organization-level steps are done once and are **already done at Nava**: GitHub is linked at
[`claude.ai/admin-settings/github`](https://claude.ai/admin-settings/github), and the Claude Tag
usage balance is funded with an organization spend limit at
[`claude.ai/admin-settings/usage/claude-tag`](https://claude.ai/admin-settings/usage/claude-tag).
Confirm the balance is funded before you start, because on Team plans Claude will not respond in a
channel at all until it is. Neither step is repeated per channel.

## 1. Create the channel

**[Anyone]** Create a **new** Slack channel with `claude-tag` in its name, then `/invite @Claude`.

Both halves of that matter. Create a new channel rather than reusing one, because access is granted
by attaching a bundle to a channel: point one at a busy existing channel and everyone already in it
inherits that access. Put `claude-tag` in the name so the channel is unmistakable next to
similarly-named ones and its purpose is legible to anyone who finds it. Installing the app adds
Claude to no channels; it responds only where it has been invited and addressed.

Choosing public or private is a real trade-off, not a formality:

| | Public channel | Private channel |
|---|---|---|
| Who can open a hosted page Claude publishes | Everyone in the workspace | Channel members only |
| Where memory goes | Workspace memory, readable from every other channel | This channel's own store |

**For demos and internal tools, default to public.** Being seen is usually the point, and a hosted
page nobody can open is a wasted deliverable. Choose private only for a specific reason — an
unannounced project, or material you would not put in an all-company channel.

Two things to know either way: what Claude learns in a public channel becomes workspace memory
readable from other channels, and memory saved while a channel is private does **not** move to the
workspace store if the channel is later made public.

Two things you cannot change: Claude never operates in Slack Connect channels shared with another
company, and it is off by default in any channel containing a Slack guest (allow it explicitly per
scope if needed, though workspace search stays unavailable there).

## 2. Grant the repository — from both directions

Repository access has to be set from two sides, and neither one alone is enough. Start this early:
the second half is a ticket, not a click, so it carries a lead time the rest of the setup does not.

1. **[GitHub org]** Configure the Claude GitHub App on the GitHub organization and grant it the
   repository. This is what lets the repository be reached by Claude at all.
2. **[Eden]** File an Eden ticket to add that repository to the Claude Tag access bundle for this
   channel. This is what lets *this channel's* Claude see it.

The ticket must name both sides of the pairing, or it cannot be actioned:

- **The Slack channel name.** Exactly as it appears in Slack.
- **The GitHub repository**, by name or URL.
- **That the bundle be attached to this channel only** — not to the workspace, and not to Default
  Slack access. Isolation comes from where a bundle is attached, not from the bundle itself, and a
  bundle on a *public* channel grants its access to anyone who joins.

**[Anyone]** Verify by asking in the channel: `@Claude what can you access from this channel?`

You do not have to guess which half is missing. Claude Tag reports access failures with enough
detail to tell you where the fix belongs — with the Claude admin, or with the owner of the GitHub
repository — so ask in the channel first and take the answer to whichever of the two it names.

### What only the Claude admin can change

Everything below is set by a Claude organization Owner at
[`claude.ai/admin-settings/claude-tag`](https://claude.ai/admin-settings/claude-tag), not by you. It
is listed here so that when Claude reports a limit, you know what to ask for by name in an Eden
ticket rather than describing a symptom.

| Setting | Ask for it when |
|---|---|
| **Repositories** on the bundle | Claude cannot see a repository it should |
| **Domains** on the bundle | A build needs a host that egress blocks. Egress is default-deny, though a new environment's Trusted level already covers common package registries, so ask only for what is genuinely needed |
| **Claude Tag version** set to **New** | The channel behaves like the older version |
| **Per-channel spend limit** | Before the first mention. Work that would exceed it is declined rather than silently truncated, so this bounds cost rather than surprising you with it |
| **Channel member edits** set to **Block** | Channel instructions must not be edited away by members |
| **Channel managers**, and the RBAC restriction toggle | Enterprise only. A non-Owner needs to add repositories and credentials for this channel, or only members holding the **Claude Tag in Slack** capability should be able to invoke Claude |

## 3. Set channel instructions

**[Anyone]** Paste from `channel-instructions.md`. Instructions outrank channel memory,
which makes them the right place for anything that must hold.

If they must not be edited away, request **Channel member edits: Block** per the table above —
otherwise any channel member can change them from the Configure page.

## 4. Prepare the repository

**[Repo]** A session starts with **no repository checked out** and clones one when a request names
it. Once cloned, `CLAUDE.md`, `.claude/CLAUDE.md`, `.claude/rules/*.md`, `.claude/skills/`, and the
hooks in `.claude/settings.json` all load on the next turn.

1. **`CLAUDE.md`** — write dependency installs as preconditions of the work they support ("install
   the SDK before building or running tests"). There is no setup script and the sandbox is fresh
   every session, so installs repeat; Claude follows this as guidance, not as an unconditional step.
   Prefer standard package managers and their default registries, which the sandbox can reach.
2. **`PROJECT.md`** — the project's state: what's done, what's in flight, what was decided and when,
   what's blocked. This is what makes "where are we?" answerable across threads, since threads share
   no state.
3. **Branch protection on the default branch** — require a pull request and passing checks; no
   force-push. Deliberately do **not** require an approving review. The channel instructions let
   Claude mark a pull request ready and merge it once a dispatched Opus subagent has reviewed the
   branch, and a required approval blocks that merge — the pull request then sits until an engineer
   happens by, which is the stall this audience cannot absorb. Required checks are the gate that
   still works, because they judge the artifact rather than who pushed it. If you want a human
   approval instead, that is a defensible choice: reinstate it here and drop the merge paragraph
   from `channel-instructions.md`, so the two do not contradict each other.
4. **`.claude/settings.json` hooks**, if anything must be refused rather than merely discouraged.
   Hooks execute in the session; instructions only advise.

A flat `PROJECT.md` rather than a work-tracking tool is a deliberate choice, not an oversight. Rebar
is the obvious alternative, and it expects `.env-id` and an op-cert signing key to persist across
clones — which a per-thread sandbox cannot do, since it keeps nothing between sessions. The pilot
protocol states the conditions under which the flat file counts as having failed; adopt something
heavier when one of those is observed, not before.

## 5. Give non-engineers something clickable

A pull request is not a deliverable for someone who won't read a diff. Close that gap with a
**hosted page** Claude publishes and keeps current. No infrastructure, no admin, no repository
settings; visibility follows the channel, per step 1.

Use it twice, for two different jobs:

- **Before building**, as the design gate. Ask for the proposed change rendered as a page — the
  layout, the copy, the shape of the thing — and approve that before any code is written. A
  non-engineer can judge a rendered page; they cannot judge a plan written as prose about code.
- **After building**, as the living deliverable. One page per project, updated rather than reposted,
  linked from the channel topic.

That is the whole clickable story for a demo or an internal tool. Deliberately no GitHub Pages: it
needs a repository admin to enable it, a workflow on `push` or `pull_request`, and an unprotected
`github-pages` environment, and it buys nothing a hosted page does not already give this audience.

### Possible future deliverable: a preview deploy

Recorded here rather than built, because it is genuinely useful and genuinely unresolved.

Claude can trigger `push` and `pull_request` workflows by pushing a branch or opening a pull
request, so a per-pull-request preview deploy would turn a pull request into a URL. Two constraints
are fixed and unwidenable: Claude **cannot** dispatch a workflow, so the deploy must never sit
behind `workflow_dispatch` or `repository_dispatch`; and Claude **cannot** approve a run awaiting
approval or a pending deployment, so a deploy environment with protection rules or required
reviewers hangs until a person clicks approve.

The unresolved part is state, not triggers. A demo app backed by a database needs migrations run
against each preview environment, and nothing here says who runs them, when, or what happens to a
preview whose migration fails. Answer that before wiring anything; a preview environment that
silently serves a stale or half-migrated schema is worse than no preview, because it looks
authoritative.

## 6. First run

**[Anyone]**

1. **Name the repository in the first message** of any code task. Claude clones what the request
   names, and repository skills don't exist in the session until it does.
2. Ask for something small and verifiable, and check that the reply includes proof rather than a
   claim.
3. Confirm the model in the footer of Claude's reply.
4. **After any configuration change, start a new top-level thread.** A thread locks in its skills,
   plugins, and instructions when it starts. Connections and domain rules do apply mid-thread, but
   nothing else does.

## 7. Decide now who owns it

Skip this for a throwaway demo. Do not skip it for an internal tool.

A demo succeeds if it convinces someone once. An internal tool succeeds if it still works in six
months, which means someone has to own it after the person who built it moves on. Before the tool has
users, write into `PROJECT.md`: who owns it, what breaks it, and how to run it locally without Claude
Tag. A tool that only its channel can maintain is a tool with one point of failure.

## Gotchas worth knowing up front

Most confusion in a new channel traces to one of these.

- **The sandbox is per-thread and ephemeral.** Files that exist only in the sandbox are gone when the
  thread goes idle. Ask Claude to push branches and post drafts as it goes.
- **Two threads share no state**, even in the same channel. Anything that must persist goes to the
  repository or into the thread.
- **Thread context is capped at about 50 messages** from the start of the thread when you mention
  Claude partway in. In a long thread, restate anything critical.
- **Anyone in the channel can steer a running thread** by replying in it, without mentioning Claude
  again. They can also write or delete channel memory, and create routines that run on a schedule
  with the channel's full credentials. Audit standing work periodically with `@Claude !routines`.
- **Editing a message does not steer Claude.** It reads a note about the edit and won't act on it.
  Say the change in a new reply instead.
- **`.mcp.json` is never loaded.** Connections come only from the Access bundle.
- **Repository skills apply only in sessions that cloned that repository.** To give a skill to every
  channel under a scope, use a skills repository registered as a plugin marketplace.
- **Claude may reply without being mentioned** when it judges a reply is warranted. Tell it to stay
  quiet in a thread if that's unwanted.
- **A Grid-shared channel silently ignores your channel settings.** On Slack Enterprise Grid, a
  channel shared across workspaces takes its access, instructions, and memory from **Default Slack
  access** only — anything you set on the workspace or the channel does not reach it, with no
  per-channel override. Your instructions appear saved and are not in effect. Use a plain
  single-workspace channel. If the workspaces belong to different Claude organizations, Claude
  refuses to reply at all.
- **Treat channel content as untrusted input.** Claude reads the conversation and may follow
  instructions found in it, so keep the channel's membership deliberate.
