from scripts.frontmatter import parse_frontmatter


def test_extracts_meta_and_body():
    text = "---\nid: a\ntitle: A\ntags:\n  - x\n---\nbody here\n"
    meta, body = parse_frontmatter(text)
    assert meta == {"id": "a", "title": "A", "tags": ["x"]}
    assert body.strip() == "body here"


def test_no_frontmatter_returns_empty_meta():
    meta, body = parse_frontmatter("plain text\n")
    assert meta == {}
    assert body == "plain text\n"


def test_unterminated_frontmatter_returns_empty_meta():
    meta, body = parse_frontmatter("---\nid: a\nno closing fence\n")
    assert meta == {}
