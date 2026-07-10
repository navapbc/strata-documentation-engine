"""The single entrypoint `.claude/settings.json` invokes (`python3 -m scripts.hooks`).

Reads the PreToolUse payload once, runs every registered check against the Bash command, and emits
the combined reminder as one non-blocking `additionalContext` block. Register a check by adding its
`reminder` to CHECKS below: the list of active checks lives in tested Python, so settings.json needs
one entry and never changes when a check is added or removed.
"""
import sys

from scripts.hooks import command_of, cwd_of, emit, payload_from_stdin
from scripts.hooks import git_commit, issue_create, pr_create

CHECKS = (pr_create.reminder, issue_create.reminder, git_commit.reminder)


def main():
    payload = payload_from_stdin()
    command, cwd = command_of(payload), cwd_of(payload)
    messages = [m for check in CHECKS if (m := check(command, cwd))]
    if messages:
        emit("\n\n".join(messages))
    return 0


if __name__ == "__main__":
    sys.exit(main())
