from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Frontmatter:
    data: dict[str, str]
    body: str


def parse_frontmatter(markdown: str) -> Frontmatter:
    lines = markdown.splitlines(keepends=False)
    if not lines or lines[0].strip() != "---":
        return Frontmatter(data={}, body=markdown)

    data: dict[str, str] = {}
    end_idx = None
    for i in range(1, len(lines)):
        if lines[i].strip() == "---":
            end_idx = i
            break
        raw = lines[i].rstrip()
        if not raw or raw.lstrip().startswith("#"):
            continue
        if ":" not in raw:
            continue
        key, value = raw.split(":", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key:
            data[key] = value

    if end_idx is None:
        return Frontmatter(data={}, body=markdown)

    body = "\n".join(lines[end_idx + 1 :]).lstrip("\n")
    return Frontmatter(data=data, body=body)

