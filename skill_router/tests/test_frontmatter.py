import unittest

from skill_router.frontmatter import parse_frontmatter


class TestFrontmatter(unittest.TestCase):
    def test_parse_with_frontmatter(self) -> None:
        md = """---
name: api-design
description: hello world
origin: ECC
---

# Title
Body
"""
        fm = parse_frontmatter(md)
        self.assertEqual(fm.data["name"], "api-design")
        self.assertEqual(fm.data["description"], "hello world")
        self.assertEqual(fm.data["origin"], "ECC")
        self.assertTrue(fm.body.startswith("# Title"))

    def test_parse_without_frontmatter(self) -> None:
        md = "# Title\nBody\n"
        fm = parse_frontmatter(md)
        self.assertEqual(fm.data, {})
        self.assertEqual(fm.body, md)

