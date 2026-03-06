from __future__ import annotations

import argparse
import json
import sys

from .router import SkillRouter
from .skill_index import SkillIndex


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="claude-code-skill-router")
    parser.add_argument("query", nargs="?", help="用户输入/任务描述")
    parser.add_argument("--list", action="store_true", help="列出可用 skills")
    parser.add_argument("--choose", action="store_true", help="仅做路由选择，不执行 skill")
    parser.add_argument("--json", action="store_true", help="输出 JSON 结果")
    parser.add_argument("--api-key", default=None, help="OpenAI API Key（可替代 OPENAI_API_KEY）")
    parser.add_argument("--base-url", default=None, help="OpenAI Base URL（可替代 OPENAI_BASE_URL）")
    parser.add_argument("--model", default=None, help="模型名（可替代 OPENAI_MODEL）")
    args = parser.parse_args(argv)

    if args.list:
        index = SkillIndex.from_env().build()
        skills = [{"name": s.name, "description": s.description} for s in index.list()]
        if args.json:
            print(json.dumps({"skills": skills}, ensure_ascii=False, indent=2))
        else:
            for s in skills:
                print(f'{s["name"]}: {s["description"]}')
        return 0

    if not args.query:
        parser.print_usage()
        return 2

    if args.choose:
        router = SkillRouter(api_key=args.api_key, base_url=args.base_url, model=args.model)
        chosen = router.choose(args.query)
        if args.json:
            print(json.dumps(chosen.__dict__, ensure_ascii=False, indent=2))
        else:
            print(f"skill={chosen.skill} confidence={chosen.confidence}")
            if chosen.reason:
                print(chosen.reason)
        return 0

    router = SkillRouter(api_key=args.api_key, base_url=args.base_url, model=args.model)
    result = router.run(args.query)
    if args.json:
        used_skills = [result.skill_meta.name] if result.skill_meta else []
        payload = {
            "chosen": result.chosen.__dict__,
            "skill": (
                {
                    "name": result.skill_meta.name,
                    "description": result.skill_meta.description,
                    "path": str(result.skill_meta.skill_md_path),
                }
                if result.skill_meta
                else None
            ),
            "used_skills": used_skills,
            "response": result.response,
        }
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        if result.skill_meta:
            print(f"[skill] {result.skill_meta.name}")
        else:
            print("[skill] none")
        print(result.response or "")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
