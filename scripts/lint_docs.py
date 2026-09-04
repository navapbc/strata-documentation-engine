"""Validate generated doc frontmatter, cross-links, and registry usage (feature keys + platform components).

Also enforces two "never silently drop" checks over the whole doc set:
- ownership collisions: a feature key / component id claimed by more than one doc (the graph
  builder would otherwise pick the lexicographically-first owner and silently ignore the rest);
- leaked tool-call markup: literal `</invoke>`, `</content>`, `<parameter ...>` etc. serialized
  into a doc body or distillation log by a bad agent write step.
"""
import re
import sys
from datetime import date
from pathlib import Path

from scripts.frontmatter import parse_frontmatter

REQUIRED = ["id", "title", "source", "doc_type", "summary", "source_ref"]
DOC_TYPES = {"guide", "feature", "example"}
VERIFIED = {"ok", "needs-review"}
DEFAULT_DOCS_DIR = "docs"
DEFAULT_FEATURE_KEYS = "skills/generate-strata-docs/references/feature-keys.md"
DEFAULT_PLATFORM_COMPONENTS = "skills/generate-strata-docs/references/platform-components.md"
DEFAULT_LOGS_DIR = ".logs"

# Tool-call scaffolding that must never appear in a doc body or log. Matched case-sensitively
# on exact lowercase tag shapes so legitimate markdown/HTML (`<details>`, `Array<Content>`) is untouched.
LEAKED_MARKUP = re.compile(
    r"</?(?:antml:)?(?:invoke|parameter|function_calls|function_results|content)(?:\s[^>]*)?>"
)


def _parse_fenced_keys(path):
    """Parse kebab-case keys from the fenced code block(s) of a registry file.

    Each line inside a ``` fence is a key; leading indentation and inline
    `# ...` annotations are stripped. (empty set if the file is missing.)
    """
    path = Path(path)
    if not path.exists():
        return set()
    keys = set()
    in_fence = False
    for line in path.read_text().split("\n"):
        if line.strip().startswith("```"):
            in_fence = not in_fence
            continue
        if not in_fence:
            continue
        token = line.split("#", 1)[0].strip()
        if token:
            keys.add(token)
    return keys


def load_feature_keys(path):
    """Canonical SDK feature keys from feature-keys.md (cross-link anchor)."""
    return _parse_fenced_keys(path)


def load_platform_components(path):
    """Canonical platform component ids from platform-components.md (cross-link anchor)."""
    return _parse_fenced_keys(path)


def validate_doc(meta, feature_keys=frozenset(), component_keys=frozenset()):
    errors = []
    did = meta.get("id", "?")
    for key in REQUIRED:
        if not meta.get(key):
            errors.append(f"{did}: missing required field '{key}'")
    if meta.get("doc_type") and meta["doc_type"] not in DOC_TYPES:
        errors.append(f"{did}: doc_type must be one of {sorted(DOC_TYPES)}")
    for listkey in ("tags", "related", "feature_keys", "demonstrates",
                    "component_keys", "manages", "integrates_with"):
        if listkey in meta and not isinstance(meta[listkey], list):
            errors.append(f"{did}: '{listkey}' must be a list")
    for listkey in ("feature_keys", "demonstrates"):
        for k in meta.get(listkey, []) or []:
            if k not in feature_keys:
                errors.append(f"{did}: {listkey} key '{k}' not in feature-keys registry")
    for listkey in ("component_keys", "manages", "integrates_with"):
        for k in meta.get(listkey, []) or []:
            if k not in component_keys:
                errors.append(f"{did}: {listkey} key '{k}' not in platform-components registry")
    if "verified" in meta and meta["verified"] not in VERIFIED:
        errors.append(f"{did}: verified must be one of {sorted(VERIFIED)}")
    # Optional: the date this doc was last documented; drives the update-mode staleness throttle
    # (scripts/source_delta.py). Not required — older/hand-edited docs may omit it.
    if "last_documented" in meta:
        try:
            date.fromisoformat(str(meta["last_documented"]))
        except (ValueError, TypeError):
            errors.append(f"{did}: last_documented must be an ISO date (YYYY-MM-DD)")
    ref = meta.get("source_ref")
    if isinstance(ref, dict):
        for k in ("repo", "ref"):
            if not ref.get(k):
                errors.append(f"{did}: source_ref.{k} missing")
    return errors


def find_ownership_collisions(docs):
    """Errors for every feature key / component id claimed by more than one doc.

    `build_graph` resolves ownership with first-wins over sorted paths, so a second claimant
    would otherwise be dropped silently and every inbound edge re-pointed at whichever doc
    sorts first. Two docs with the same id are reported separately as duplicates, not here.
    """
    errors = []
    for field, registry in (("feature_keys", "feature key"), ("component_keys", "component id")):
        claimants = {}
        for d in docs:
            for k in d.get(field, []) or []:
                claimants.setdefault(k, [])
                if d.get("id") not in claimants[k]:
                    claimants[k].append(d.get("id"))
        for k, ids in sorted(claimants.items()):
            if len(ids) > 1:
                errors.append(f"COLLISION: {registry} '{k}' is claimed via {field} by "
                              f"{len(ids)} docs: {', '.join(map(str, ids))}")
    return errors


def validate_docs(docs, feature_keys=frozenset(), component_keys=frozenset()):
    errors = []
    seen = set()
    ids = {d.get("id") for d in docs}
    for d in docs:
        errors.extend(validate_doc(d, feature_keys, component_keys))
        did = d.get("id")
        if did in seen:
            errors.append(f"duplicate doc id: {did}")
        seen.add(did)
        for r in d.get("related", []) or []:
            if r not in ids:
                errors.append(f"{did}: related id '{r}' does not exist")
    errors.extend(find_ownership_collisions(docs))
    return errors


def find_leaked_markup(text):
    """Return [(line_no, token), ...] for every leaked tool-call tag in `text` (1-based lines)."""
    hits = []
    for i, line in enumerate(text.split("\n"), start=1):
        for m in LEAKED_MARKUP.finditer(line):
            hits.append((i, m.group(0)))
    return hits


def scan_for_leaked_markup(docs_dir, logs_dir=DEFAULT_LOGS_DIR):
    """Errors for leaked tool-call markup in any doc under docs/sources or any log in logs_dir.

    `logs_dir` is runtime and gitignored, so a missing directory is not an error.
    """
    errors = []
    paths = list(sorted((Path(docs_dir) / "sources").rglob("*.md")))
    logs_dir = Path(logs_dir)
    if logs_dir.is_dir():
        paths += sorted(logs_dir.glob("*.md"))
    for path in paths:
        for line_no, token in find_leaked_markup(path.read_text()):
            errors.append(f"{path}:{line_no}: leaked tool-call markup '{token}'")
    return errors


def load_docs(docs_dir):
    docs_dir = Path(docs_dir)
    out = []
    for path in sorted((docs_dir / "sources").rglob("*.md")):
        meta, _ = parse_frontmatter(path.read_text())
        if not meta:
            continue
        meta["path"] = str(path.relative_to(docs_dir))
        out.append(meta)
    return out


def main(argv=None):
    docs = load_docs(DEFAULT_DOCS_DIR)
    feature_keys = load_feature_keys(DEFAULT_FEATURE_KEYS)
    component_keys = load_platform_components(DEFAULT_PLATFORM_COMPONENTS)
    errors = validate_docs(docs, feature_keys, component_keys)
    errors += scan_for_leaked_markup(DEFAULT_DOCS_DIR, DEFAULT_LOGS_DIR)
    for e in errors:
        print(f"ERROR: {e}")
    print(f"DOCS_OK {len(docs)} docs" if not errors
          else f"DOCS_FAILED {len(errors)} errors")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
