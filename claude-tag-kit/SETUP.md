# Set up a Claude Tag project channel

How to stand up a Slack channel plus GitHub repository where non-engineers can build a project with
Claude Tag and evaluate the result themselves.

Roles are marked on each step: **[Owner]** needs the Owner role in your Claude organization,
**[Repo]** needs write access to the repository, **[Anyone]** is any channel member.

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

## 1. Link GitHub — once per organization

**[Owner]** At [`claude.ai/admin-settings/github`](https://claude.ai/admin-settings/github), connect
Claude to GitHub. The person completing this must be **both** an owner of the GitHub organization and
an Admin in the Claude organization. A greyed-out **Link** button means you aren't a GitHub org
owner; the page has a **Copy message** button to send someone who is.

**[Owner]** Fund the usage balance and set an organization spend limit at
[`claude.ai/admin-settings/usage/claude-tag`](https://claude.ai/admin-settings/usage/claude-tag). On
Team plans Claude won't respond in channels at all until the balance is funded.

## 2. Create the channel

**[Anyone]** Create the Slack channel, then `/invite @Claude`. Installing the app adds Claude to no
channels; it responds only where it has been invited and addressed.

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

## 3. Give the channel access

**[Owner]** At [`claude.ai/admin-settings/claude-tag`](https://claude.ai/admin-settings/claude-tag):

1. Create an Access bundle and attach it **to this channel only** — not to the workspace, and not to
   Default Slack access. Isolation comes from where you attach a bundle, not from the bundle itself.
   A bundle on a *public* channel grants its access to anyone who joins.
2. On the bundle's **Repositories** tab, add the repository.
3. On the **Domains** tab, add only hosts the project genuinely needs. Egress is default-deny, and a
   new environment's Trusted access level already covers common package registries.
4. Set the channel scope's **Claude Tag version** to **New**.
5. Set a **per-channel spend limit**. Work that would exceed it is declined rather than silently
   truncated.

**[Owner]** Optional, Enterprise only: name **channel managers** so a non-Owner can add repositories
and credentials for this channel, and turn on the RBAC restriction toggle if only members holding the
**Claude Tag in Slack** capability should be able to invoke Claude.

**[Anyone]** Verify by asking in the channel: `@Claude what can you access from this channel?`

## 4. Set channel instructions

**[Owner or Anyone]** Paste from `channel-instructions.md`. Instructions outrank channel memory,
which makes them the right place for anything that must hold.

**[Owner]** If they must not be edited away, set the scope's **Channel member edits** to **Block** —
otherwise any channel member can change them from the Configure page.

## 5. Prepare the repository

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
3. **Branch protection on the default branch** — require a pull request, a human approval, and
   passing checks; no force-push.
4. **`.claude/settings.json` hooks**, if anything must be refused rather than merely discouraged.
   Hooks execute in the session; instructions only advise.

## 6. Give non-engineers something clickable

A pull request is not a deliverable for someone who won't read a diff. Two ways to close that gap:

**A hosted page**, published by Claude and kept current. No infrastructure and no admin. Visibility
follows the channel, per step 2. Start here.

**A deployed preview.** Claude can trigger `push` and `pull_request` workflows by pushing a branch or
opening a pull request, so a preview deploy behind those triggers turns a pull request into a URL.
Two constraints, both fixed and unwidenable:

- Claude **cannot** dispatch a workflow. Never put the deploy behind `workflow_dispatch` or
  `repository_dispatch`.
- Claude **cannot** approve a run awaiting approval or a pending deployment. If the deploy
  environment has protection rules or required reviewers, every deploy hangs until a person clicks
  approve. Leave it unprotected, or accept the manual step.

**[Repo]** For GitHub Pages specifically, a repository admin must enable Pages once; it is off by
default.

## 7. First run

**[Anyone]**

1. **Name the repository in the first message** of any code task. Claude clones what the request
   names, and repository skills don't exist in the session until it does.
2. Ask for something small and verifiable, and check that the reply includes proof rather than a
   claim.
3. Confirm the model in the footer of Claude's reply.
4. **After any configuration change, start a new top-level thread.** A thread locks in its skills,
   plugins, and instructions when it starts. Connections and domain rules do apply mid-thread, but
   nothing else does.

## 8. Decide now who owns it

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
- **Treat channel content as untrusted input.** Claude reads the conversation and may follow
  instructions found in it, so keep the channel's membership deliberate.
