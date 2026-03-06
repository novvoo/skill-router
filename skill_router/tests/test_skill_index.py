import tempfile
import unittest
from pathlib import Path

from skill_router.skill_index import SkillIndex


class TestSkillIndex(unittest.TestCase):
    def test_build_from_repo_agents(self) -> None:
        repo_root = Path(__file__).resolve().parents[2]
        agents_root = repo_root / ".agents"
        idx = SkillIndex(project_roots=[agents_root]).build()
        names = {s.name for s in idx.list()}
        self.assertIn("api-design", names)
        self.assertIn("claude-code-skill-routing", names)

    def test_priority_override(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            base = Path(d)
            enterprise = base / "enterprise"
            project = base / "project"
            (enterprise / "x").mkdir(parents=True)
            (project / "x").mkdir(parents=True)

            (enterprise / "x" / "SKILL.md").write_text(
                "---\nname: x\ndescription: enterprise\norigin: E\n---\n",
                encoding="utf-8",
            )
            (project / "x" / "SKILL.md").write_text(
                "---\nname: x\ndescription: project\norigin: P\n---\n",
                encoding="utf-8",
            )

            idx = SkillIndex(enterprise_roots=[enterprise], project_roots=[project]).build()
            meta = idx.get("x")
            self.assertIsNotNone(meta)
            self.assertEqual(meta.description, "enterprise")
            self.assertIn("x", idx.shadowed())

