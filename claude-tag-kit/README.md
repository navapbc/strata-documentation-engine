# Claude Tag project kit

Files and skills that turn a Slack channel plus a GitHub repository into a place where
**non-engineers can build a demo or an internal tool with Claude Tag** and get a result they can
evaluate themselves.

Scoped to work Nava builds for itself. Not written for client-facing work or client data, and it
omits the controls that would need — see the scope note in `SETUP.md`.

## Status: under pilot, not yet a deliverable

Nothing here is packaged or installable yet, deliberately. The contents are being tested against a
real project first — see `docs/superpowers/specs/2026-08-20-claude-tag-pilot-protocol.md` — and only
what demonstrably helps will be packaged.

That ordering is the point. A kit written before the pilot would encode guesses about what
non-engineers struggle with; a kit written after it encodes findings. Expect `SETUP.md` and
`channel-instructions.md` to be corrected *from* pilot experience rather than defended.

This directory will move to its own repository once its contents have earned it. It lives at the top
level, rather than under `docs/`, so that extraction is a directory move and so it is never confused
with the documentation engine's generated output.

## Contents

| File | What it is | Maturity |
|---|---|---|
| `SETUP.md` | Step-by-step setup for a new project channel and its repository | Draft, under test |
| `channel-instructions.md` | Paste-ready channel instructions, generic template plus the pilot's filled-in version | Draft, under test |

Skills will be added only where the pilot shows prose is insufficient. An empty `skills/` directory
would be a promise the pilot has not yet justified.

## Design rules

1. **Native first.** If a Claude Tag feature already does the job, use it and package nothing.
2. **Non-engineers must be able to verify the result themselves.** A screenshot, a clickable URL, or
   a walked checklist — never a summary asserting success.
3. **Nothing important lives only in prose.** Custom instructions and memory are advisory; anything
   that must hold goes in hooks, required CI checks, or branch protection.
4. **Every gate judges the artifact, not the requester.** Claude Tag controls message ingestion, so
   a check asking "who sent this" cannot be enforced.
