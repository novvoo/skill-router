---
name: claude-code-skill-routing
description: Claude Code Skill 系统的纯 LLM 路由与渐进式披露。用于设计/实现/对齐类似的 Skill 发现、加载与冲突处理机制。
origin: community
---

# Claude Code Skill 路由机制（LLM-Only）参考

## 目标

当你想实现或复刻“Claude Code 风格”的 Skill 系统时，用一份可执行的设计参考回答三个问题：

- Skill 如何被“发现、选择、加载”
- 为什么不需要算法路由（regex/embedding/classifier）也能工作
- 如何用渐进式披露控制上下文成本，同时保持可扩展性

## 核心结论：无算法路由，靠 LLM 原生推理选择

该体系不依赖以下传统路由层：

- embeddings 相似度检索
- 关键词/正则匹配
- 训练分类器
- 网关层的显式意图分类与分发逻辑

取而代之的是“声明式的可用 Skill 列表 + 语言模型推理”：

- 把所有可用 Skill 的 `name + description` 格式化成一段文本，作为工具提示的一部分常驻上下文
- 由模型在看到用户输入后，直接根据自然语言理解决定是否调用 Skill 工具以及调用哪个 Skill

这本质上是一次标准的 Transformer 前向推理决策过程，而不是外部路由器的判定。

## Skill 发现与选择：渐进式披露（Progressive Disclosure）

为了让 Skill 数量增长时仍可用，采用三层加载：

| 层级 | 加载内容 | 典型时机 | 目的 |
|---|---|---|---|
| 元数据层 | `name + description`（每个 Skill 很短） | 启动时始终加载 | 让模型“知道有什么可用能力” |
| 指令层 | 对应 Skill 的完整 `SKILL.md` | 被选中后再加载 | 把领域规则/流程注入上下文 |
| 支持文件层 | 脚本、模板、参考文档 | 执行时按需加载 | 只在确实需要时才扩上下文 |

关键点：模型做“选择”只需要元数据层；真正做“执行”才需要指令层与支持文件层。

## 元工具：Skill Tool 的提示结构

系统提供一个特殊的元工具（例如命名为 Skill），与 Read/Write 等并列。它的提示包含可用 Skill 列表，形如：

- `<available_skills>`
  - `"pdf": Extract text from PDF documents - When ...`
  - `"code-reviewer": Review code - When ...`
  - ...
- `</available_skills>`

模型看到用户输入后，会把输入语义与 description 的触发条件做匹配，然后决定调用：

- `command = "<skill-name>"`

## 冲突与优先级：同名覆盖 + 命名空间

当多个来源都可能提供 Skill 时，采用优先级覆盖策略（高优先级覆盖低优先级同名 Skill）：

- 组织/企业托管设置（最高）
- 用户级目录（个人）
- 项目级目录
- 插件（通常用 `plugin-name:skill-name` 做命名空间避免冲突）

实现要点：

- 确保最终“元数据层”列表里同名只出现一个
- 允许插件用命名空间避免与用户/项目同名冲突

## 执行生命周期（建议实现的最小闭环）

当某个 Skill 被选中后，典型流程：

1. 加载该 Skill 的 `SKILL.md`
2. 把 Skill 内容作为“元消息（isMeta）”注入上下文
3. 如有需要，按 Skill 的定义调整工具权限、模型选择等运行时约束
4. 在富化后的上下文中继续处理用户请求

注意：Skill 的本质是“提示模板与约束”，不是可执行服务，不要求运行 Python/Node/HTTP 服务器。

## 与 MCP / 外部网关的关系

把三者清晰拆开，能避免设计上混淆：

- Skill 系统：内部提示与上下文管理机制（选择与执行都在模型内完成）
- MCP：外部工具协议（需要显式配置工具服务器与权限）
- AI Gateway：位于模型提供方之前的代理层（鉴权、成本、路由、审计）

## 实施清单（把概念落地成工程）

如果你要在自己的宿主环境实现类似机制，按以下最小集实现即可：

- 定义 Skill 资产格式
  - 强制 `name + description` 可被稳定解析
  - 强制 description 明确“何时启用/不启用”
- 构建可用 Skill 的元数据索引
  - 启动时只加载元数据层（低 token）
  - 生成 `<available_skills>` 文本块注入到 Skill 元工具提示里
- 实现被选中后的按需加载
  - 仅当模型调用 Skill 工具时，才加载对应 `SKILL.md`
  - 支持文件只在执行环节按需加载
- 处理冲突
  - 同名覆盖 + 插件命名空间
  - 保证“元数据层”呈现给模型的列表干净且可预测
- 记录与观测（可选但强烈建议）
  - 记录：用户输入、候选 Skill 列表、最终选择、失败原因
  - 用于迭代 description 的触发条件，减少重叠与误选

## 环境变量示例（OpenAI 兼容接口）

不要把真实 Key 写进仓库或日志。用占位符即可：

### Windows CMD

```bat
set OPENAI_API_KEY=sk-REDACTED
set OPENAI_BASE_URL=https://api.siliconflow.cn/v1
set OPENAI_MODEL=Qwen/Qwen3.5-4B
```

### PowerShell

```powershell
$env:OPENAI_API_KEY="sk-REDACTED"
$env:OPENAI_BASE_URL="https://api.siliconflow.cn/v1"
$env:OPENAI_MODEL="Qwen/Qwen3.5-4B"
```

说明：

- 访问 `https://api.siliconflow.cn/v1` 返回 Not Found 并不一定代表不可用；很多 OpenAI 兼容服务在根路径不提供资源，实际应调用 `/chat/completions` 等端点。
