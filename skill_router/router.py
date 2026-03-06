from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path

from .openai_compat import ChatMessage, OpenAICompatClient
from .skill_index import SkillIndex, SkillMetadata


@dataclass(frozen=True)
class ChosenSkill:
    skill: str
    confidence: float
    reason: str


@dataclass(frozen=True)
class RouteResult:
    chosen: ChosenSkill
    skill_meta: SkillMetadata | None
    response: str | None


class SkillRouter:
    def __init__(
        self,
        index: SkillIndex | None = None,
        client: OpenAICompatClient | None = None,
        api_key: str | None = None,
        base_url: str | None = None,
        model: str | None = None,
        timeout_s: float = 60.0,
    ) -> None:
        self.index = index or SkillIndex.from_env().build()
        self.client = client or OpenAICompatClient(
            api_key=api_key,
            base_url=base_url,
            model=model,
            timeout_s=timeout_s,
        )

    def choose(self, user_input: str) -> ChosenSkill:
        skills = self.index.list()
        prompt = _build_available_skills_prompt(skills)
        system_content = "\n\n".join(
            [
                (
                    "你是一个 Skill 路由器。你只能从可用列表中选择一个最合适的 skill，"
                    "或者返回 none。只输出 JSON，不要输出其它内容。"
                ),
                prompt,
            ]
        )
        messages = [
            ChatMessage(
                role="system",
                content=system_content,
            ),
            ChatMessage(
                role="user",
                content=(
                    "用户输入如下，请选择 skill：\n\n"
                    f"{user_input}\n\n"
                    '输出格式：{"skill":"<name|none>","confidence":0-1,"reason":"..."}'
                ),
            ),
        ]
        try:
            result = self.client.chat_completions(
                messages=messages,
                temperature=0.0,
                max_tokens=300,
                response_format={"type": "json_object"},
            )
        except RuntimeError:
            result = self.client.chat_completions(messages=messages, temperature=0.0, max_tokens=300)
        parsed = _parse_choice_json(result.content)
        if parsed is None:
            return ChosenSkill(skill="none", confidence=0.0, reason="模型输出无法解析为 JSON")
        skill = parsed.get("skill", "none") or "none"
        if skill != "none" and not self.index.get(skill):
            return ChosenSkill(
                skill="none",
                confidence=float(parsed.get("confidence", 0.0) or 0.0),
                reason=f'选择了不存在的 skill: "{skill}"',
            )
        return ChosenSkill(
            skill=skill,
            confidence=float(parsed.get("confidence", 0.0) or 0.0),
            reason=str(parsed.get("reason", "") or ""),
        )

    def run(self, user_input: str) -> RouteResult:
        chosen = self.choose(user_input)
        if chosen.skill == "none":
            messages = [
                ChatMessage(role="system", content="你是一个有帮助的助手。"),
                ChatMessage(role="user", content=user_input),
            ]
            result = self.client.chat_completions(messages=messages, temperature=0.2)
            return RouteResult(chosen=chosen, skill_meta=None, response=result.content)

        meta = self.index.get(chosen.skill)
        if meta is None:
            messages = [
                ChatMessage(role="system", content="你是一个有帮助的助手。"),
                ChatMessage(role="user", content=user_input),
            ]
            result = self.client.chat_completions(messages=messages, temperature=0.2)
            return RouteResult(chosen=chosen, skill_meta=None, response=result.content)

        skill_text = _read_text(meta.skill_md_path)
        system_content = "\n\n".join(
            [
                (
                    "你是一个具备工具/技能注入能力的助手。"
                    "以下内容是当前选中的 Skill，必须遵循。"
                ),
                skill_text,
            ]
        )
        messages = [
            ChatMessage(
                role="system",
                content=system_content,
            ),
            ChatMessage(role="user", content=user_input),
        ]
        result = self.client.chat_completions(messages=messages, temperature=0.2)
        return RouteResult(chosen=chosen, skill_meta=meta, response=result.content)


def _build_available_skills_prompt(skills: list[SkillMetadata]) -> str:
    lines = ["<available_skills>"]
    for s in skills:
        desc = " ".join(s.description.split())
        lines.append(f'"{s.name}": {desc}')
    lines.append("</available_skills>")
    return "\n".join(lines)


def _parse_choice_json(text: str) -> dict | None:
    raw = text.strip()
    try:
        return json.loads(raw)
    except Exception:
        pass
    m = re.search(r"\{[\s\S]*\}", raw)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except Exception:
        return None


def _read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except OSError as e:
        raise RuntimeError(f"Failed to read skill file: {path}") from e
