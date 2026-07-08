import io
import json

from scripts.hooks import command_from_stdin, run
from scripts.hooks import git_commit, issue_create, pr_create


def test_pr_create_matches_even_in_compound_command():
    assert pr_create.reminder("cd repo && gh pr create --draft") == pr_create.REMINDER


def test_issue_create_matches():
    assert issue_create.reminder("gh issue create --label bug") == issue_create.REMINDER


def test_checks_ignore_unrelated_commands():
    assert pr_create.reminder("ls -la") is None
    assert issue_create.reminder("git status") is None
    assert git_commit.reminder("echo hi") is None


def test_git_commit_lists_staged_and_unstaged(monkeypatch):
    outputs = {
        ("diff", "--cached", "--name-only"): "a.py",
        ("diff", "--name-only"): "b.py",
        ("ls-files", "--others", "--exclude-standard"): "c.py",
    }
    monkeypatch.setattr(git_commit, "_git", lambda *args: outputs[args])
    message = git_commit.reminder("git commit -m x")
    assert "a.py" in message and "b.py" in message and "c.py" in message
    assert "Staged (will be committed)" in message


def test_command_from_stdin_handles_bad_input(monkeypatch):
    monkeypatch.setattr("sys.stdin", io.StringIO("not json"))
    assert command_from_stdin() == ""


def test_run_emits_valid_hook_json(monkeypatch):
    out = io.StringIO()
    monkeypatch.setattr("sys.stdin", io.StringIO(json.dumps({"tool_input": {"command": "x"}})))
    monkeypatch.setattr("sys.stdout", out)
    assert run(lambda command: "hello") == 0
    assert json.loads(out.getvalue())["hookSpecificOutput"]["additionalContext"] == "hello"


def test_run_is_silent_when_check_returns_none(monkeypatch):
    out = io.StringIO()
    monkeypatch.setattr("sys.stdin", io.StringIO(json.dumps({"tool_input": {"command": "x"}})))
    monkeypatch.setattr("sys.stdout", out)
    assert run(lambda command: None) == 0
    assert out.getvalue() == ""
