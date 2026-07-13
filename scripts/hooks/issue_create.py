"""Nudge `gh issue create` toward the create-issue skill."""
import sys

from scripts.hooks import matches, run

REMINDER = (
    "Reminder: open issues through the create-issue skill. It picks the matching template, "
    "runs review-draft, and files with the right label. "
    "If you are already inside create-issue, proceed."
)


def reminder(command, cwd=None):
    return REMINDER if matches(command, "gh", "issue", "create") else None


if __name__ == "__main__":
    sys.exit(run(reminder))
