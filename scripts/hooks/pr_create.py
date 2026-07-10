"""Nudge `gh pr create` toward the create-pr skill."""
import sys

from scripts.hooks import matches, run

REMINDER = (
    "Reminder: open PRs through the create-pr skill. It fills "
    ".github/PULL_REQUEST_TEMPLATE.md, runs review-draft, and opens the PR as a draft. "
    "If you are already inside create-pr, proceed."
)


def reminder(command, cwd=None):
    return REMINDER if matches(command, "gh", "pr", "create") else None


if __name__ == "__main__":
    sys.exit(run(reminder))
