# Agent 路由方案（可解释 + 低维护）

目标：在 agent 数量变多时，依然能稳定地“选对一个主 agent”，并且能说清楚为什么选它。

## 核心思路：三层路由

### 1) 资产层：让每个 Agent Prompt 可被稳定检索

- 必须有 frontmatter：`name`、`description`
- `description` 用“何时启用/解决什么问题”的口径写到足够明确，避免泛化描述
- 尽量做到“一个 prompt 一个主用途”，把“顺手也能做”的能力写在次要位置

### 2) 语义层：用轻量匹配给出候选与理由

不依赖任何脚本，直接用“索引文件 + 精读候选 prompt”来做路由：

- 先读入口说明：[README.md](agents/README.md)
- 再读顶层导航：[DIRECTORY_MAP.md](agents/DIRECTORY_MAP.md)
- 再读全量目录：[CATALOG.md](agents/CATALOG.md)
- 从 CATALOG 里基于 `description` 做 3 个候选，再逐个打开候选 `.md`，选 1 个主 agent

### 3) 规范层：减少重叠，让“选错”的代价更低

建议每个 Agent Prompt 明确三件事（放在正文里即可）：

- 适用场景：我什么时候被选为主 agent
- 不适用：遇到什么情况应该换别的 agent
- 交付物：我最终会产出什么

## 推荐的可选 frontmatter 字段

为了让路由更稳，允许在 frontmatter 里补充“路由提示”。为了兼容当前解析器（逐行 `key: value`），建议用 `|` 分隔的单行字符串：

```yaml
---
name: code-reviewer
description: 负责对代码变更做结构化评审与风险把关
triggers: 评审|code review|PR|diff|reviewer
anti_triggers: 写新功能|从零搭建|需求拆解
deliverables: 评审结论|风险清单|可执行修改建议
---
```

字段含义：

- `triggers`：出现这些词时更可能应该选你
- `anti_triggers`：出现这些词时更可能不该选你
- `deliverables`：用于强化“产出类型”匹配

## 给 LLM 的路由步骤（推荐）

1) 先用一句话把任务归类为：评审/实现/排错/测试/安全/文档/产品/运营（不要超过 12 个字）
2) 打开 [DIRECTORY_MAP.md](agents/DIRECTORY_MAP.md) 定位最相关的 1–2 个目录
3) 打开 [CATALOG.md](agents/CATALOG.md)，在对应目录小节里按 `description` 选 3 个候选
4) 逐个读取候选 prompt 的正文，核对：
   - 是否明确写了“何时启用 / When to use”
   - 是否明确写了“不适用 / When not to use”
   - 交付物是否匹配你要的结果
5) 只选 1 个作为主 agent；如果需要协作，再从候选里补 1 个辅助 agent（例如 reviewer/security/test）

## 示例（LLM 读索引的做法）

- “我需要对一段 diff 做评审” → DIRECTORY_MAP 里优先 `agent-tools/` → CATALOG 里找 reviewer 类 → 打开 `code-reviewer`/语言专用 reviewer → 选一个
- “build 报错/TypeScript 类型炸了” → `agent-tools/` → 选 `build-error-resolver`
- “做一次安全审计/鉴权/输入校验” → `agent-tools/` → 选 `security-reviewer`
- “端到端测试策略/写 e2e” → `agent-tools/` 或 `testing/` → 选 `e2e-runner` 或测试相关角色
