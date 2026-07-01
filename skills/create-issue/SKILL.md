---
name: create-issue
description: Guides filing a new GitHub issue: picks the right template, writes it in the right register, applies the matching label, reviews the draft, and files it. Use when opening a new issue for this repo.
---

# Create Issue

Walks from "I have something to file" to a filed issue that follows the repo's conventions. It picks
the right template, helps write it in the right language for its audience, applies the matching
label, runs a review pass, and files only after the draft is approved.

## When to use

Use whenever you are about to open an issue in this repo. It is especially helpful if you are not
sure which template fits or how technical the wording should be.

## Steps

### 1. Choose the template

Pick the template that matches the work. Templates live in `.github/ISSUE_TEMPLATE/`.

| If the work is... | Use |
|---|---|
| A large initiative framed around an outcome, spanning several stories or tasks | `epic.md` |
| A user-facing feature or improvement | `story.md` |
| Something broken or behaving unexpectedly | `bug.md` |
| An implementation handoff a developer or agent must pick up cold | `technical-task.md` |
| A time-boxed investigation whose output is findings, not shipped code | `spike.md` |
| Non-user-visible maintenance (dependency upgrades, CI, tooling) | `chore.md` |

If two seem to fit, prefer the less technical one for anything a non-engineer might file (`story`
over `technical-task`, `bug` over `technical-task`).

### 2. Write in the right register

- **Product templates** (`epic`, `story`): plain, outcome-oriented language. Describe user value and
  what success looks like, not the implementation.
- **Defect and maintenance templates** (`bug`, `chore`): accessible language. For `bug`, include
  reproduction steps and expected versus actual behavior; mark technical fields optional where they are.
- **Investigation template** (`spike`): accessible language; state the question and the time box.
- **Handoff template** (`technical-task`): technical and specific. Fill in the "Starting point" and
  "Constraints and gotchas" thoroughly; these are what an agent or new developer needs to start cold.

Fill in the template's sections. Do not leave a heading with an empty body unless the template says
it is optional.

Write the body one line per paragraph; do not hard-wrap at a column width. GitHub renders a single
newline in an issue body as a line break, so hard-wrapped text shows up as ragged, broken lines. See
"Formatting issue and PR bodies" in `CONTRIBUTING.md`.

### 3. Apply the matching label

Each template declares its label (`epic`, `story`, `bug`, `technical-task`, `spike`, `chore`). Apply
that label when filing. If the label does not exist yet, create it first.

### 4. Review the draft

Run the `review-draft` skill on the issue body before filing. It checks quality, template adherence,
voice, punctuation (no em dashes), formatting (no hard-wrapped body), and house style. Apply the
findings you agree with.

### 5. File

Present the final draft for approval, then file it. Pass the body via a file so multi-line markdown
survives the shell:

```bash
gh issue create --repo navapbc/strata-documentation-engine \
  --title "<title>" --label <label> --body-file <path-to-body.md>
```

Issue titles are plain and imperative, with no bracket prefix (the label carries the type).
