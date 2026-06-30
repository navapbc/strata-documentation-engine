"""Parse and validate the sources.md manifest (a markdown table)."""
import json
import sys
from pathlib import Path

COLUMNS = ["id", "type", "repo", "ref", "subpaths", "notes"]
DEFAULT_MANIFEST = "sources.md"
DEFAULT_PROFILES = "skills/generate-strata-docs/references/profiles"


def parse_manifest(text):
    """Parse the first markdown table in `text` into a list of source dicts."""
    rows = []
    in_table = False
    for line in text.split("\n"):
        stripped = line.strip()
        if not stripped.startswith("|"):
            if in_table:
                break  # table ended
            continue
        cells = [c.strip() for c in stripped.strip("|").split("|")]
        header = [c.lower() for c in cells]
        if not in_table:
            if header[: len(COLUMNS)] == COLUMNS:
                in_table = True
            continue
        if set(cells[0]) <= {"-", ":"} and cells[0]:
            continue  # separator row (---)
        row = dict(zip(COLUMNS, cells + [""] * (len(COLUMNS) - len(cells))))
        row["subpaths"] = row["subpaths"].split() if row["subpaths"] else []
        rows.append(row)
    return rows


def validate_manifest(sources, profiles_dir):
    """Return a list of human-readable error strings (empty = valid)."""
    errors = []
    profiles_dir = Path(profiles_dir)
    seen = set()
    for s in sources:
        sid = s.get("id", "")
        if not sid:
            errors.append("a row has an empty id")
            continue
        if sid in seen:
            errors.append(f"duplicate id: {sid}")
        seen.add(sid)
        if not s.get("ref"):
            errors.append(f"{sid}: empty ref")
        if not s.get("repo", "").startswith(("http://", "https://", "git@")):
            errors.append(f"{sid}: repo is not a valid git URL")
        stype = s.get("type", "")
        if not stype:
            errors.append(f"{sid}: empty type")
        elif not (profiles_dir / f"{stype}.md").exists():
            errors.append(f"{sid}: no profile for type '{stype}' "
                          f"(expected {profiles_dir}/{stype}.md)")
    return errors


def main(argv=None):
    argv = argv if argv is not None else sys.argv[1:]
    manifest_path = Path(DEFAULT_MANIFEST)
    sources = parse_manifest(manifest_path.read_text())
    if "--json" in argv:
        print(json.dumps(sources, indent=2))
        return 0
    errors = validate_manifest(sources, DEFAULT_PROFILES)
    for e in errors:
        print(f"ERROR: {e}")
    print(f"MANIFEST_OK {len(sources)} sources" if not errors
          else f"MANIFEST_FAILED {len(errors)} errors")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
