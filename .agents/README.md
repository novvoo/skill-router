# Agents / Skills 索引

这里是一套可复用的“技能包（Skill）”与“子代理提示词（Agent Prompt）”集合。当前仓库内容很多且类型混杂，本目录通过统一的索引与规范，把“怎么找、怎么用、怎么加”变得可预测。

## 你在这里会看到什么

- **Skill 目录**：以一个文件夹为单位，文件夹内包含 `SKILL.md`（带 frontmatter：`name`/`description`/`origin`）。例如 `api-design/`、`django-security/`。
- **Agent Prompt 目录**：以一个或多个 `.md` 文件为单位，文件自带 frontmatter：`name`/`description`（以及可选的 `tools`/`model`）。例如 `agent-tools/`、`engineering/`、`design/`。
- **流程/手册**：以文档树为主，偏“方法论/流程”。例如 `strategy/`。
- **实验/脚本**：带有 `scripts/`、`hooks/`、`*.sh`、`*.py` 的目录，通常用于评估、自动化或演示。例如 `continuous-learning-v2/`、`skill-stocktake/`。

## 快速入口

- 总目录：[CATALOG.md](agents/CATALOG.md)
- 顶层目录地图：[DIRECTORY_MAP.md](agents/DIRECTORY_MAP.md)
- 结构与命名规范：[CONVENTIONS.md](agents/CONVENTIONS.md)
- Agent 路由与写作建议：[AGENT_ROUTING.md](agents/AGENT_ROUTING.md)
- 端到端策略与交付流程：`strategy/`（建议从 QUICKSTART 开始）  
  - [QUICKSTART.md](agents/strategy/QUICKSTART.md)
  - [EXECUTIVE-BRIEF.md](agents/strategy/EXECUTIVE-BRIEF.md)

## 使用建议（减少“乱”的体感）

- 需要“怎么做”与“检查清单”时，优先用 Skill（看 `SKILL.md`）。
- 需要“扮演一个角色”或“在特定工具集内执行”时，优先用 Agent Prompt（看对应目录下的 `.md`）。
- 不要靠记忆找文件：先看本 README → 再看 [DIRECTORY_MAP.md](agents/DIRECTORY_MAP.md) 定位目录 → 再用 [CATALOG.md](agents/CATALOG.md) 按描述筛。

## 维护方式

- 新增/调整内容后，更新 [CATALOG.md](agents/CATALOG.md)（用于全量可检索）与 [DIRECTORY_MAP.md](agents/DIRECTORY_MAP.md)（用于顶层导航）。
- 新增内容前先看 [CONVENTIONS.md](agents/CONVENTIONS.md) 的放置位置与 frontmatter 规范，避免继续变乱。
