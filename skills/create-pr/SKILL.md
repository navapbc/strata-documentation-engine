---
name: create-pr
description: Guides opening a pull request: names the branch correctly, fills the PR template, reviews the description, and opens it as a draft. Use when opening a PR for this repo.
---

# Create PR

Walks from a set of committed changes to an opened pull request that follows the repo's conventions.
It checks the branch name, fills the PR template, runs a review pass on the description, and opens
the PR as a draft.

## When to use

Use when your work is committed and ready to go up for review, or when you want a work-in-progress
PR open early.

## Steps

### 1. Name the branch

Use the team's branch shape:

```
<github-username>/<issue-number>-<short-kebab-description>
```

Skip the repo-name prefix when the branch lives in the same repo as the work. Include the
originating project name only when a branch in this repo addresses an issue from a different project
(for example `jeffhorn/oscer-42-short-description`). If the current branch does not follow this
shape and has not been pushed yet, rename it with `git branch -m`.

### 2. Decide the base

- Most PRs target `main`.
- If this work builds on another open PR's branch, target that branch instead (a stacked PR) and say
  so in the PR's "Notes for reviewers" so the merge order is clear.

### 3. Fill the PR template

Use `.github/PULL_REQUEST_TEMPLATE.md`. Keep it terse and technical, in complete sentences: what
changed and why, how (if not obvious from the diff), a checkable test plan, and notes for reviewers.
Reference the issue with `Closes #n` or `Relates to #n`.

Write the description one line per paragraph; do not hard-wrap it. See "Formatting issue and PR
bodies" in `CONTRIBUTING.md` for why.

### 4. Review the description

Run the `review-draft` skill on the PR description before opening it. Apply the findings you agree
with.

### 5. Open as a draft

Open the PR as a draft; this is the repo default. Pass the body via a file so multi-line markdown
survives the shell:

```bash
git push -u origin <branch>
gh pr create --draft --repo navapbc/strata-documentation-engine \
  --base <base> --title "<title>" --body-file <path-to-body.md>
```

Mark the PR ready for review only after self-review is complete and CI passes.
