from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from .frontmatter import parse_frontmatter


@dataclass(frozen=True)
class SkillMetadata:
    name: str
    description: str
    origin: str | None
    skill_dir: Path
    skill_md_path: Path
    priority_group: str


def _split_roots(raw: str | None) -> list[Path]:
    if not raw:
        return []
    parts = [p.strip() for p in raw.split(";") if p.strip()]
    return [Path(p) for p in parts]


class SkillIndex:
    def __init__(
        self,
        enterprise_roots: list[Path] | None = None,
        user_roots: list[Path] | None = None,
        project_roots: list[Path] | None = None,
        plugin_roots: list[Path] | None = None,
    ) -> None:
        self.enterprise_roots = enterprise_roots or []
        self.user_roots = user_roots or []
        self.project_roots = project_roots or []
        self.plugin_roots = plugin_roots or []
        self._skills: dict[str, SkillMetadata] = {}
        self._shadowed: dict[str, list[SkillMetadata]] = {}

    @classmethod
    def from_env(cls) -> "SkillIndex":
        home = Path.home()
        default_user = [
            home / ".claude" / "skills",
            home / ".agents" / "skills",
        ]
        default_project = [
            Path.cwd() / ".agents",
        ]
        return cls(
            enterprise_roots=_split_roots(
                _env("SKILL_ROOTS_ENTERPRISE"),
            ),
            user_roots=_split_roots(_env("SKILL_ROOTS_USER")) or default_user,
            project_roots=_split_roots(_env("SKILL_ROOTS_PROJECT")) or default_project,
            plugin_roots=_split_roots(_env("SKILL_ROOTS_PLUGIN")),
        )

    def build(self) -> "SkillIndex":
        self._skills = {}
        self._shadowed = {}
        for group_name, roots in [
            ("enterprise", self.enterprise_roots),
            ("user", self.user_roots),
            ("project", self.project_roots),
            ("plugin", self.plugin_roots),
        ]:
            for root in roots:
                self._scan_root(root=root, group=group_name)
        return self

    def list(self) -> list[SkillMetadata]:
        return sorted(self._skills.values(), key=lambda s: s.name.lower())

    def get(self, name: str) -> SkillMetadata | None:
        return self._skills.get(name)

    def shadowed(self) -> dict[str, list[SkillMetadata]]:
        return {k: list(v) for k, v in self._shadowed.items()}

    def _scan_root(self, root: Path, group: str) -> None:
        if not root.exists() or not root.is_dir():
            return
        for child in root.iterdir():
            if not child.is_dir():
                continue
            skill_md = child / "SKILL.md"
            if not skill_md.exists() or not skill_md.is_file():
                continue
            meta = self._parse_skill_md(skill_dir=child, skill_md=skill_md, group=group)
            if not meta:
                continue
            existing = self._skills.get(meta.name)
            if existing is None:
                self._skills[meta.name] = meta
            else:
                self._shadowed.setdefault(meta.name, []).append(meta)

    def _parse_skill_md(
        self,
        skill_dir: Path,
        skill_md: Path,
        group: str,
    ) -> SkillMetadata | None:
        try:
            content = skill_md.read_text(encoding="utf-8")
        except OSError:
            return None
        fm = parse_frontmatter(content)
        name = fm.data.get("name", "").strip()
        description = fm.data.get("description", "").strip()
        origin = fm.data.get("origin")
        if not name or not description:
            return None
        return SkillMetadata(
            name=name,
            description=description,
            origin=origin,
            skill_dir=skill_dir,
            skill_md_path=skill_md,
            priority_group=group,
        )


def _env(key: str) -> str | None:
    import os

    val = os.getenv(key)
    return val.strip() if val else None

