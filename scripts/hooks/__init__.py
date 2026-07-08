"""Shared plumbing for the PreToolUse Bash reminder hooks.

Each sibling module is one check. A check defines a pure `reminder(command) -> str | None`
and, under `__main__`, calls `run(reminder)`. This module owns the single I/O contract with
Claude Code so the checks stay pure and self-evident: read the Bash command from the hook
payload on stdin, and, when a check returns text, emit it as non-blocking `additionalContext`
that the harness injects into the model's context. Nothing here blocks the tool.
"""
import json
import sys


def command_from_stdin():
    """The Bash command string from the hook payload on stdin, or '' if unavailable."""
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return ""
    return (payload.get("tool_input") or {}).get("command") or ""


def emit(message):
    """Inject `message` into the model's context (non-blocking)."""
    json.dump(
        {"hookSpecificOutput": {"hookEventName": "PreToolUse", "additionalContext": message}},
        sys.stdout,
    )


def run(reminder):
    """Wire a check's `reminder(command)` to the hook I/O contract. Always returns 0."""
    message = reminder(command_from_stdin())
    if message:
        emit(message)
    return 0
