"""Before `git commit`, surface the staged vs unstaged file lists.

A commit records only what is staged. Printing the three lists at commit time makes a missing
`git add` visible in context, so the intended change set and the staged set can be reconciled
before the commit lands.
"""
import subprocess
import sys

from scripts.hooks import matches, run


def _git(cwd, *args):
    """Trimmed stdout of a git command run in `cwd`, or None on failure (including timeouts)."""
    prefix = ["-C", cwd] if cwd else []
    try:
        result = subprocess.run(["git", *prefix, *args], capture_output=True, text=True, timeout=5)
    except subprocess.TimeoutExpired:
        return None
    except Exception:
        return None
    if result.returncode != 0:
        return None
    return result.stdout.strip()


def reminder(command, cwd=None):
    if not matches(command, "git", "commit"):
        return None
    # cwd is the tool's reported working directory, so the lists match the repo the commit runs in
    # rather than the hook's own process cwd. A `cd` buried inside the command still isn't reflected.
    staged = _git(cwd, "diff", "--cached", "--name-only")
    unstaged = _git(cwd, "diff", "--name-only")
    untracked = _git(cwd, "ls-files", "--others", "--exclude-standard")
    staged = "(unavailable)" if staged is None else (staged or "(none)")
    unstaged = "(unavailable)" if unstaged is None else (unstaged or "(none)")
    untracked = "(unavailable)" if untracked is None else (untracked or "(none)")
    return (
        "git commit reminder. Confirm the staged set matches your intended change set "
        "before committing.\n\n"
        f"Staged (will be committed):\n{staged}\n\n"
        f"Modified but NOT staged:\n{unstaged}\n\n"
        f"Untracked:\n{untracked}"
    )


if __name__ == "__main__":
    sys.exit(run(reminder))
