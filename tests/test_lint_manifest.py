from scripts.lint_manifest import parse_manifest, validate_manifest

MANIFEST = """# Sources

| id | type | repo | ref | subpaths | notes |
|----|------|------|-----|----------|-------|
| strata-sdk | sdk | https://github.com/navapbc/strata-sdk-rails | main | docs lib | The SDK |
| app-template | rails-template | https://github.com/navapbc/template-application-rails | main |  | Template |
"""


def test_parse_reads_rows_and_splits_subpaths():
    sources = parse_manifest(MANIFEST)
    assert [s["id"] for s in sources] == ["strata-sdk", "app-template"]
    assert sources[0]["type"] == "sdk"
    assert sources[0]["subpaths"] == ["docs", "lib"]
    assert sources[1]["subpaths"] == []


def test_validate_passes_when_profiles_exist(tmp_path):
    (tmp_path / "sdk.md").write_text("x")
    (tmp_path / "rails-template.md").write_text("x")
    errors = validate_manifest(parse_manifest(MANIFEST), tmp_path)
    assert errors == []


def test_validate_flags_missing_profile(tmp_path):
    (tmp_path / "sdk.md").write_text("x")  # rails-template profile missing
    errors = validate_manifest(parse_manifest(MANIFEST), tmp_path)
    assert any("rails-template" in e for e in errors)


def test_validate_flags_duplicate_ids(tmp_path):
    (tmp_path / "sdk.md").write_text("x")
    dup = MANIFEST + "| strata-sdk | sdk | https://x | main |  | dup |\n"
    errors = validate_manifest(parse_manifest(dup), tmp_path)
    assert any("duplicate" in e.lower() and "strata-sdk" in e for e in errors)


def test_validate_flags_empty_ref(tmp_path):
    (tmp_path / "sdk.md").write_text("x")
    bad = """| id | type | repo | ref | subpaths | notes |
|----|------|------|-----|----------|-------|
| x | sdk | https://x |  |  |  |
"""
    errors = validate_manifest(parse_manifest(bad), tmp_path)
    assert any("ref" in e.lower() for e in errors)
