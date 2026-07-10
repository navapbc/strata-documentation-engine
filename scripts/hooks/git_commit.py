"""Before `git commit`, surface the staged vs unstaged file lists.

A commit records only what is staged. Printing the three lists at commit time makes a missing
`git add` visible in context, so the intended change set and the staged set can be reconciled
before the commit lands.
"""
import subprocess
import sys

from scripts.hooks import matches, run


def _git(cwd, *args):
    """Trimmed stdout of a git command run in `cwd`, or '' on any failure."""
    prefix = ["-C", cwd] if cwd else []
    try:
        result = subprocess.run(["git", *prefix, *args], capture_output=True, text=True, timeout=5)
        return result.stdout.strip()
    except Exception:
        return ""


def reminder(command, cwd=None):
    if not matches(command, "git", "commit"):
        return None
    # cwd is the tool's reported working directory, so the lists match the repo the commit runs in
    # rather than the hook's own process cwd. A `cd` buried inside the command still isn't reflected.
    staged = _git(cwd, "diff", "--cached", "--name-only") or "(none)"
    unstaged = _git(cwd, "diff", "--name-only") or "(none)"
    untracked = _git(cwd, "ls-files", "--others", "--exclude-standard") or "(none)"
    return (
        "git commit reminder. Confirm the staged set matches your intended change set "
        "before committing.\n\n"
        f"Staged (will be committed):\n{staged}\n\n"
        f"Modified but NOT staged:\n{unstaged}\n\n"
        f"Untracked:\n{untracked}"
    )


if __name__ == "__main__":
    sys.exit(run(reminder))
