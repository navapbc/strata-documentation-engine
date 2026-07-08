"""Before `git commit`, surface the staged vs unstaged file lists.

A commit records only what is staged. Printing the three lists at commit time makes a missing
`git add` visible in context, so the intended change set and the staged set can be reconciled
before the commit lands.
"""
import subprocess
import sys

from scripts.hooks import run


def _git(*args):
    """Trimmed stdout of a git command, or '' on any failure."""
    try:
        result = subprocess.run(["git", *args], capture_output=True, text=True, timeout=5)
        return result.stdout.strip()
    except Exception:
        return ""


def reminder(command):
    if "git commit" not in command:
        return None
    staged = _git("diff", "--cached", "--name-only") or "(none)"
    unstaged = _git("diff", "--name-only") or "(none)"
    untracked = _git("ls-files", "--others", "--exclude-standard") or "(none)"
    return (
        "git commit reminder. Confirm the staged set matches your intended change set "
        "before committing.\n\n"
        f"Staged (will be committed):\n{staged}\n\n"
        f"Modified but NOT staged:\n{unstaged}\n\n"
        f"Untracked:\n{untracked}"
    )


if __name__ == "__main__":
    sys.exit(run(reminder))
