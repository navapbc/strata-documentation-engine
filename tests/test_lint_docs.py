from scripts.lint_docs import (
    validate_doc, validate_docs, load_docs, load_feature_keys,
    load_platform_components,
)

KEYS = {"application-form", "business-process", "attribute-types/name"}
COMPONENTS = {"platform-cli", "template-infra", "template-application-rails"}
VALID = {
    "id": "sdk-app-form", "title": "Application Forms", "source": "strata-sdk",
    "doc_type": "feature", "tags": ["forms"], "related": [], "summary": "AF guide",
    "feature_keys": ["application-form"],
    "source_ref": {"repo": "https://x", "ref": "main", "paths": ["docs"]},
}


def test_validate_doc_accepts_valid():
    assert validate_doc(VALID, KEYS, COMPONENTS) == []


def test_validate_doc_flags_missing_required():
    meta = dict(VALID)
    del meta["title"]
    assert any("title" in e for e in validate_doc(meta, KEYS, COMPONENTS))


def test_validate_doc_flags_bad_doc_type():
    meta = dict(VALID, doc_type="tutorial")
    assert any("doc_type" in e for e in validate_doc(meta, KEYS, COMPONENTS))


def test_validate_doc_flags_unknown_feature_key():
    meta = dict(VALID, feature_keys=["not-a-real-key"])
    assert any("not-a-real-key" in e for e in validate_doc(meta, KEYS, COMPONENTS))


def test_validate_doc_flags_unknown_demonstrates_key():
    meta = dict(VALID, doc_type="example", feature_keys=[], demonstrates=["nope"])
    assert any("nope" in e for e in validate_doc(meta, KEYS, COMPONENTS))


def test_validate_doc_accepts_valid_component_fields():
    meta = dict(VALID, component_keys=["template-infra"],
                integrates_with=["template-application-rails"])
    assert validate_doc(meta, KEYS, COMPONENTS) == []


def test_validate_doc_flags_unknown_component_key():
    meta = dict(VALID, component_keys=["not-a-component"])
    assert any("not-a-component" in e for e in validate_doc(meta, KEYS, COMPONENTS))


def test_validate_doc_flags_unknown_manages_key():
    meta = dict(VALID, manages=["template-application-zzz"])
    assert any("template-application-zzz" in e for e in validate_doc(meta, KEYS, COMPONENTS))


def test_validate_doc_accepts_valid_last_documented():
    meta = dict(VALID, last_documented="2026-06-29")
    assert validate_doc(meta, KEYS, COMPONENTS) == []


def test_validate_doc_flags_bad_last_documented_format():
    meta = dict(VALID, last_documented="June 29, 2026")
    assert any("last_documented" in e for e in validate_doc(meta, KEYS, COMPONENTS))


def test_validate_doc_flags_invalid_last_documented_date():
    meta = dict(VALID, last_documented="2026-13-40")
    assert any("last_documented" in e for e in validate_doc(meta, KEYS, COMPONENTS))


def test_validate_doc_flags_non_string_last_documented():
    meta = dict(VALID, last_documented=["2026-06-29"])
    assert any("last_documented" in e for e in validate_doc(meta, KEYS, COMPONENTS))


def test_validate_doc_accepts_missing_last_documented():
    assert "last_documented" not in VALID  # optional; the default doc omits it
    assert validate_doc(VALID, KEYS, COMPONENTS) == []


def test_validate_docs_flags_duplicate_ids():
    errors = validate_docs([VALID, dict(VALID)], KEYS, COMPONENTS)
    assert any("duplicate" in e.lower() for e in errors)


def test_validate_docs_flags_dangling_related():
    a = dict(VALID, id="a", related=["does-not-exist"])
    assert any("does-not-exist" in e for e in validate_docs([a], KEYS, COMPONENTS))


def test_load_platform_components_parses_fenced_registry(tmp_path):
    reg = tmp_path / "platform-components.md"
    reg.write_text(
        "# Platform components\n\n```\nplatform-cli    # navapbc/platform-cli\n"
        "template-infra\ntemplate-application-rails\n```\n"
    )
    comps = load_platform_components(reg)
    assert {"platform-cli", "template-infra", "template-application-rails"} <= comps


def test_load_feature_keys_parses_fenced_registry(tmp_path):
    reg = tmp_path / "feature-keys.md"
    reg.write_text(
        "# Feature keys\n\n```\nbusiness-process    # app/models/strata/business_process.rb\n"
        "  task/applicant-task\nattribute-types/name\n```\n"
    )
    keys = load_feature_keys(reg)
    assert {"business-process", "task/applicant-task", "attribute-types/name"} <= keys


def test_load_docs_injects_relative_path(tmp_path):
    d = tmp_path / "sources" / "strata-sdk"
    d.mkdir(parents=True)
    fm = ("---\nid: a\ntitle: A\nsource: strata-sdk\ndoc_type: guide\n"
          "tags: []\nrelated: []\nsummary: s\n"
          "source_ref:\n  repo: https://x\n  ref: main\n  paths: []\n---\nbody\n")
    (d / "a.md").write_text(fm)
    docs = load_docs(tmp_path)
    assert docs[0]["path"] == "sources/strata-sdk/a.md"
