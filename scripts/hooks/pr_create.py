"""Nudge `gh pr create` toward the create-pr skill."""
import sys

from scripts.hooks import run

REMINDER = (
    "Reminder: open PRs through the create-pr skill. It fills "
    ".github/PULL_REQUEST_TEMPLATE.md, runs review-draft, and opens the PR as a draft. "
    "If you are already inside create-pr, proceed."
)


def reminder(command):
    return REMINDER if "gh pr create" in command else None


if __name__ == "__main__":
    sys.exit(run(reminder))
