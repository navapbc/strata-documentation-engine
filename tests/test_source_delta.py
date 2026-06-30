from datetime import date

from scripts.source_delta import (
    _is_sha, _recorded_documented_at, _recorded_ref, compute_delta,
)

SHA_A = "a" * 40
SHA_B = "b" * 40
TODAY = date(2026, 6, 29)


def _doc(source, ref, last_documented=None):
    """A minimal doc-frontmatter dict as load_docs would return it."""
    meta = {"id": f"{source}-doc", "source": source,
            "source_ref": {"repo": "https://x", "ref": ref, "paths": []}}
    if last_documented is not None:
        meta["last_documented"] = last_documented
    return meta


def _src(sid):
    return {"id": sid, "type": "sdk", "repo": "https://x", "ref": "main"}


def test_is_sha():
    assert _is_sha(SHA_A)
    assert not _is_sha("main")
    assert not _is_sha("a" * 39)
    assert not _is_sha("")


def test_new_source_has_no_docs():
    d = compute_delta([_src("brand-new")], docs=[], resolved={})
    assert d["new"] == ["brand-new"]
    assert d["changed"] == [] and d["unchanged"] == []


def test_changed_when_sha_differs():
    d = compute_delta([_src("s")], [_doc("s", SHA_A)], {"s": SHA_B})
    assert d["changed"] == ["s"]
    assert d["unchanged"] == [] and d["new"] == []


def test_unchanged_when_sha_matches():
    d = compute_delta([_src("s")], [_doc("s", SHA_A)], {"s": SHA_A})
    assert d["unchanged"] == ["s"]
    assert d["changed"] == [] and not d["warnings"]


def test_orphaned_when_docs_without_manifest_row():
    d = compute_delta([_src("kept")], [_doc("gone", SHA_A)], {})
    assert d["orphaned"] == ["gone"]
    assert d["new"] == ["kept"]


def test_branch_name_ref_falls_back_to_changed_with_warning():
    d = compute_delta([_src("s")], [_doc("s", "main")], {"s": SHA_A})
    assert d["changed"] == ["s"]
    assert any("not a resolved SHA" in w for w in d["warnings"])


def test_missing_resolved_sha_falls_back_to_changed_with_warning():
    d = compute_delta([_src("s")], [_doc("s", SHA_A)], resolved={})
    assert d["changed"] == ["s"]
    assert any("no resolved SHA" in w for w in d["warnings"])


def test_recorded_ref_disagreement_is_surfaced():
    ref, warn = _recorded_ref([_doc("s", SHA_A), _doc("s", SHA_B)])
    assert ref == SHA_A  # sorted()[0]
    assert warn and "disagree" in warn


def test_mixed_manifest_buckets_correctly():
    sources = [_src("new1"), _src("chg"), _src("same")]
    docs = [_doc("chg", SHA_A), _doc("same", SHA_B), _doc("orphan", SHA_A)]
    resolved = {"chg": SHA_B, "same": SHA_B}
    d = compute_delta(sources, docs, resolved)
    assert d["new"] == ["new1"]
    assert d["changed"] == ["chg"]
    assert d["unchanged"] == ["same"]
    assert d["orphaned"] == ["orphan"]
    assert d["throttled"] == []


def test_drifted_recent_doc_is_throttled():
    # drifted (SHA differs) but documented 3 days ago -> throttled, not re-documented
    docs = [_doc("s", SHA_A, last_documented="2026-06-26")]
    d = compute_delta([_src("s")], docs, {"s": SHA_B}, now=TODAY)
    assert d["throttled"] == ["s"]
    assert d["changed"] == []
    assert any("throttled" in w for w in d["warnings"])


def test_drifted_stale_doc_is_changed():
    # drifted and documented 8 days ago -> re-document
    docs = [_doc("s", SHA_A, last_documented="2026-06-21")]
    d = compute_delta([_src("s")], docs, {"s": SHA_B}, now=TODAY)
    assert d["changed"] == ["s"]
    assert d["throttled"] == []


def test_drifted_exactly_one_week_is_changed():
    # exactly stale_after_days old (7) -> not < 7 -> re-document (boundary)
    docs = [_doc("s", SHA_A, last_documented="2026-06-22")]
    d = compute_delta([_src("s")], docs, {"s": SHA_B}, now=TODAY)
    assert d["changed"] == ["s"]
    assert d["throttled"] == []


def test_drifted_without_timestamp_is_changed():
    # no last_documented (legacy doc) -> not throttled (safe default, backward compatible)
    d = compute_delta([_src("s")], [_doc("s", SHA_A)], {"s": SHA_B}, now=TODAY)
    assert d["changed"] == ["s"]
    assert d["throttled"] == []


def test_unparseable_timestamp_is_changed_with_warning():
    docs = [_doc("s", SHA_A, last_documented="last-tuesday")]
    d = compute_delta([_src("s")], docs, {"s": SHA_B}, now=TODAY)
    assert d["changed"] == ["s"]
    assert d["throttled"] == []
    assert any("unparseable last_documented" in w for w in d["warnings"])


def test_recent_doc_without_drift_stays_unchanged():
    # throttle only gates re-documents; an unchanged source is never throttled
    docs = [_doc("s", SHA_A, last_documented="2026-06-28")]
    d = compute_delta([_src("s")], docs, {"s": SHA_A}, now=TODAY)
    assert d["unchanged"] == ["s"]
    assert d["throttled"] == [] and d["changed"] == []


def test_min_age_days_override_changes_threshold():
    # documented 3 days ago; a 2-day threshold makes it stale -> re-document
    docs = [_doc("s", SHA_A, last_documented="2026-06-26")]
    d = compute_delta([_src("s")], docs, {"s": SHA_B}, now=TODAY, stale_after_days=2)
    assert d["changed"] == ["s"]
    assert d["throttled"] == []


def test_recorded_documented_at_takes_latest():
    docs = [
        _doc("s", SHA_A, last_documented="2026-06-20"),
        {"id": "s-doc2", "source": "s", "last_documented": "2026-06-27",
         "source_ref": {"repo": "https://x", "ref": SHA_A, "paths": []}},
    ]
    dt, warn = _recorded_documented_at(docs)
    assert dt == date(2026, 6, 27)
    assert warn is None
