"""Parse YAML frontmatter shared by the doc linter and the graph builder."""
import yaml


def parse_frontmatter(text):
    """Return (meta_dict, body_str). ({}, text) when there is no valid block."""
    if not text.startswith("---"):
        return {}, text
    lines = text.split("\n")
    end = None
    for i in range(1, len(lines)):
        if lines[i].strip() == "---":
            end = i
            break
    if end is None:
        return {}, text
    meta = yaml.safe_load("\n".join(lines[1:end])) or {}
    if not isinstance(meta, dict):
        return {}, text
    body = "\n".join(lines[end + 1:])
    return meta, body
