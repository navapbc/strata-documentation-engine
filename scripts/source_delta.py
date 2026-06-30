"""Classify manifest sources as new / changed / unchanged / orphaned for the skill's update mode.

Deterministic core: `compute_delta` is a pure function of (manifest sources, existing doc
frontmatter, {source_id: resolved_sha}). The skill resolves each clone's HEAD SHA after cloning
and passes the map in, so this module stays git- and network-free (and unit-testable).

Drift detection compares the resolved upstream SHA against the `source_ref.ref` recorded in a
source's existing docs (see references/doc-frontmatter-schema.md — that field MUST be the resolved
commit SHA). When the recorded ref is not a full SHA (e.g. a bare branch like `main`) we cannot
compare reliably, so we classify the source as *changed* (safe: it re-documents) and emit a
warning rather than silently skip it.

Staleness throttle: a frequently-drifting source would otherwise be re-documented every run. So a
source we would re-document is held back (classified *throttled*) until its docs are at least
`STALE_AFTER_DAYS` old, read from the `last_documented` date in its frontmatter. A throttled source
is skipped this run but surfaced (with a warning), never silently dropped. `now` is injected so the
core stays a pure, time-free, unit-testable function.
"""
import json
import re
import sys
from datetime import date, datetime, timezone
from pathlib import Path

from scripts.lint_docs import load_docs
from scripts.lint_manifest import parse_manifest

DEFAULT_MANIFEST = "sources.md"
DEFAULT_DOCS_DIR = "docs"
STALE_AFTER_DAYS = 7
_SHA_RE = re.compile(r"[0-9a-f]{40}")


def _is_sha(value):
    """True when `value` is a full 40-char hex commit SHA (what we can drift-compare)."""
    return bool(value) and bool(_SHA_RE.fullmatch(str(value)))


def _recorded_ref(docs_for_source):
    """The `source_ref.ref` shared by a source's docs, plus any disagreement warning.

    Returns (ref_or_None, warning_or_None). Docs for one source are written in a single run
    against one checkout, so they should agree; a disagreement is surfaced, not hidden.
    """
    refs = set()
    for d in docs_for_source:
        sr = d.get("source_ref")
        if isinstance(sr, dict) and sr.get("ref"):
            refs.add(str(sr["ref"]))
    if not refs:
        return None, None
    if len(refs) > 1:
        return sorted(refs)[0], f"docs disagree on source_ref.ref: {sorted(refs)}"
    return refs.pop(), None


def _recorded_documented_at(docs_for_source):
    """The latest parseable `last_documented` date (ISO `YYYY-MM-DD`) among a source's docs.

    Returns (date_or_None, warning_or_None). A source's docs are written in one run so they
    should share a date; we take the max (most recent) and surface any unparseable value rather
    than silently ignoring it. A missing date is normal (legacy/hand-edited docs) and yields None.
    """
    dates, bad = [], []
    for d in docs_for_source:
        v = d.get("last_documented")
        if not v:
            continue
        try:
            dates.append(date.fromisoformat(str(v)))
        except ValueError:
            bad.append(str(v))
    warn = f"unparseable last_documented {sorted(set(bad))}" if bad else None
    return (max(dates) if dates else None), warn


def compute_delta(sources, docs, resolved, now=None, stale_after_days=STALE_AFTER_DAYS):
    """Classify each manifest source against existing docs and resolved SHAs.

    Returns {new, changed, unchanged, throttled, orphaned, warnings} with sorted id lists.

    A source whose upstream SHA drifted is re-documented (`changed`) only once its docs are at
    least `stale_after_days` old; a drifted source documented more recently is `throttled` (skipped
    this run but surfaced via a warning — never silently dropped). `now` (a date; a datetime is
    accepted and truncated to its date) is injected to keep this pure and testable; it defaults to
    today in UTC. Missing/unparseable `last_documented` => not throttled (re-document — the safe
    default, mirroring how a missing SHA already forces `changed`).
    """
    if now is None:
        now = datetime.now(timezone.utc).date()
    elif isinstance(now, datetime):
        now = now.date()

    by_source = {}
    for d in docs:
        by_source.setdefault(d.get("source"), []).append(d)

    manifest_ids = [s.get("id") for s in sources if s.get("id")]
    new, changed, unchanged, warnings = [], [], [], []

    for sid in manifest_ids:
        docs_for = by_source.get(sid, [])
        if not docs_for:
            new.append(sid)
            continue
        recorded, warn = _recorded_ref(docs_for)
        if warn:
            warnings.append(f"{sid}: {warn}")
        current = resolved.get(sid)
        if not current:
            warnings.append(f"{sid}: no resolved SHA provided; treating as changed")
            changed.append(sid)
        elif not _is_sha(recorded):
            warnings.append(
                f"{sid}: recorded source_ref.ref {recorded!r} is not a resolved SHA; "
                "cannot detect drift, treating as changed")
            changed.append(sid)
        elif str(current) != recorded:
            changed.append(sid)
        else:
            unchanged.append(sid)

    # Throttle: hold back a source we would re-document if its docs are younger than
    # `stale_after_days`, so a frequently-drifting repo isn't re-documented on every run.
    throttled, still_changed = [], []
    for sid in changed:
        documented_at, dwarn = _recorded_documented_at(by_source.get(sid, []))
        if dwarn:
            warnings.append(f"{sid}: {dwarn}")
        if documented_at is not None and (now - documented_at).days < stale_after_days:
            throttled.append(sid)
            warnings.append(
                f"{sid}: documented {(now - documented_at).days}d ago "
                f"(< {stale_after_days}d); throttled, not re-documenting")
        else:
            still_changed.append(sid)

    orphaned = sorted(set(by_source) - set(manifest_ids) - {None})
    return {
        "new": sorted(new),
        "changed": sorted(still_changed),
        "unchanged": sorted(unchanged),
        "throttled": sorted(throttled),
        "orphaned": orphaned,
        "warnings": warnings,
    }


def _load_shas(argv):
    """Resolve the {source_id: sha} map from --shas <json> or --shas-file <path> ({} if absent)."""
    if "--shas" in argv:
        return json.loads(argv[argv.index("--shas") + 1])
    if "--shas-file" in argv:
        return json.loads(Path(argv[argv.index("--shas-file") + 1]).read_text())
    return {}


def _flag_value(argv, name):
    """The token following `name` in argv, or None if the flag is absent."""
    return argv[argv.index(name) + 1] if name in argv else None


def main(argv=None):
    argv = argv if argv is not None else sys.argv[1:]
    sources = parse_manifest(Path(DEFAULT_MANIFEST).read_text())
    docs = load_docs(DEFAULT_DOCS_DIR)
    now_arg = _flag_value(argv, "--now")          # ISO YYYY-MM-DD; defaults to today (UTC)
    age_arg = _flag_value(argv, "--min-age-days")  # staleness threshold; defaults to STALE_AFTER_DAYS
    delta = compute_delta(
        sources, docs, _load_shas(argv),
        now=date.fromisoformat(now_arg) if now_arg else None,
        stale_after_days=int(age_arg) if age_arg else STALE_AFTER_DAYS,
    )
    if "--json" in argv:
        print(json.dumps(delta, indent=2))
        return 0
    for w in delta["warnings"]:
        print(f"WARN: {w}")
    for t in delta["throttled"]:
        print(f"THROTTLED: {t} (drifted but documented recently — skipping this run, surfaced not dropped)")
    for o in delta["orphaned"]:
        print(f"ORPHANED: {o} (docs exist but no longer in sources.md — review manually)")
    print(f"SOURCE_DELTA_OK {len(delta['new'])} new "
          f"{len(delta['changed'])} changed {len(delta['unchanged'])} unchanged "
          f"{len(delta['throttled'])} throttled {len(delta['orphaned'])} orphaned")
    return 0


if __name__ == "__main__":
    sys.exit(main())
