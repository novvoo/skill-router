# 目录结构与命名规范

目标：让新增内容“放哪、怎么命名、怎么被索引”这三件事稳定可预测。

## 1) 两类核心资产

### A. Skill（技能包）

- **形态**：一个文件夹 + 该文件夹根目录的 `SKILL.md`
- **命名**：文件夹名使用 `kebab-case`，尽量表达主题/领域，例如 `api-design`、`django-security`
- **必须包含**：`SKILL.md` 且带 frontmatter：

```yaml
---
name: api-design
description: 一句话说明解决什么问题/何时使用
origin: ECC
---
```

- **可选结构**（按需添加，不强制）：
  - `examples/`：示例输入/输出、范例文档
  - `scripts/`：生成脚本、验证脚本
  - `assets/`：图片、图表、静态资源

### B. Agent Prompt（子代理提示词）

- **形态**：一个 `.md` 文件（通常聚集在某个目录下）
- **命名**：文件名用 `kebab-case`，尽量带上域前缀或角色，例如 `engineering-backend-architect.md`
- **必须包含**：frontmatter 至少有 `name` 与 `description`：

```yaml
---
name: code-reviewer
description: 一句话说明你是谁、何时启用
tools: ["Read", "Grep", "Glob"]
model: sonnet
---
```

## 2) 放置位置（避免继续混在一起）

- **通用工具型 Agent Prompt**：放在 `agent-tools/`  
  例如 code reviewer、planner、security reviewer 这类“跨项目通用能力”。
- **角色型 Agent Prompt**：按领域放在 `engineering/`、`design/`、`marketing/`、`product/`、`support/`、`testing/`、`specialized/` 等目录。
- **Skill**：优先以“主题目录 = skill 名称”方式放在根目录（例如 `backend-patterns/`），保持“一目录一个主题”。
- **方法论/流程/手册**：放在 `strategy/`（或新增同级文档树目录时保持结构化）。
- **实验/自动化**：目录内自带 `scripts/` / `hooks/` 并明确用途；不要把脚本散落在根目录。

## 3) 索引要求（保证可检索）

- 新增 Skill：必须有 `SKILL.md`，并填写 `name`、`description`、`origin`。
- 新增 Agent Prompt：必须有 `name`、`description`。
- 新增后更新一次 [CATALOG.md](agents/CATALOG.md)，确保内容能被全量检索到。

## 4) 一致性约束（减少“看不懂”）

- `name` 尽量与目录名/文件名一致（便于 grep 与索引）。
- `description` 用“何时启用/解决什么问题”的口径写，一句话能让人做选择。
- 避免同名 `name`（Skill 与 Agent Prompt 重名会让调用与检索变糊）。

## 5) 路由友好字段（可选，但强烈建议）

为了在 agent 变多时仍然好选，允许在 Agent Prompt 的 frontmatter 增补以下字段（单行字符串，建议用 `|` 分隔）：

```yaml
---
name: xxx
description: 何时启用/解决什么问题
triggers: 触发词1|触发词2|触发短语
anti_triggers: 反向触发词1|不适用短语
deliverables: 输出1|输出2|输出3
---
```

- `triggers`：更可能应该选你的关键词/短语
- `anti_triggers`：出现时更可能不该选你（用于减少误选）
- `deliverables`：强化“产出类型”匹配，帮助同域 agent 去重

## 6) Prompt 正文结构建议（减少重叠）

建议每个 Agent Prompt 在正文中明确三块内容（用标题或清晰的段落即可）：

- 适用场景：你被选为主 agent 的条件
- 不适用：什么情况下应该切换到别的 agent
- 交付物：你最终会产出的结果形态
