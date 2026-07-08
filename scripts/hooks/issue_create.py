"""Nudge `gh issue create` toward the create-issue skill."""
import sys

from scripts.hooks import run

REMINDER = (
    "Reminder: open issues through the create-issue skill. It picks the matching template, "
    "runs review-draft, and files with the right label."
)


def reminder(command):
    return REMINDER if "gh issue create" in command else None


if __name__ == "__main__":
    sys.exit(run(reminder))
