"""Shared plumbing for the PreToolUse Bash reminder hooks.

Each sibling module is one check: a pure `reminder(command, cwd) -> str | None`. `__main__.py` is
the single entrypoint `.claude/settings.json` invokes; it reads the hook payload once and runs every
check. This module owns the I/O contract with Claude Code so the checks stay pure and self-evident:
read the Bash command (and the tool's working directory) from the payload on stdin, and, when a check
returns text, emit it as non-blocking `additionalContext` that the harness injects into the model's
context. Nothing here blocks the tool.
"""
import json
import re
import sys


def payload_from_stdin():
    """The parsed hook payload on stdin, or {} if unavailable."""
    try:
        return json.load(sys.stdin)
    except Exception:
        return {}


def command_of(payload):
    """The Bash command string from a hook payload, or ''."""
    return (payload.get("tool_input") or {}).get("command") or ""


def cwd_of(payload):
    """The working directory Claude Code reports for the tool call, or None."""
    return payload.get("cwd") or None


def command_from_stdin():
    """The Bash command string from the payload on stdin, or '' (single-check `run` path)."""
    return command_of(payload_from_stdin())


def matches(command, *words):
    """True if `command` runs `words` as a whitespace-separated token sequence.

    The hook payload only carries the raw command string (there is no structured "which binary
    ran" signal), and fully parsing the shell (pipes, quoting, `$()`, aliases) is impractical and
    still defeatable. A word-boundary regex is the right cost/benefit for an advisory, non-blocking
    nudge: it tolerates extra whitespace and, unlike a plain substring test, does not fire on
    hyphenated look-alikes like `gh-pr-create-helper`. A false positive only adds a harmless
    reminder, so we do not chase quoted-string or comment edge cases.
    """
    pattern = r"\b" + r"\s+".join(map(re.escape, words)) + r"\b"
    return re.search(pattern, command) is not None


def emit(message):
    """Inject `message` into the model's context (non-blocking)."""
    json.dump(
        {"hookSpecificOutput": {"hookEventName": "PreToolUse", "additionalContext": message}},
        sys.stdout,
    )


def run(reminder):
    """Wire a single check's `reminder` to the I/O contract for direct invocation. Returns 0."""
    payload = payload_from_stdin()
    message = reminder(command_of(payload), cwd_of(payload))
    if message:
        emit(message)
    return 0
