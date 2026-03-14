# 顶层目录地图

把“这是什么目录 / 去哪里找东西”固定下来，减少来回翻找。

| 目录 | 类型 | 说明 |
|---|---|---|
| `agent-tools/` | Agent Prompts | 通用工具型子代理提示词（reviewer、planner、resolver 等） |
| `design/` | Agent Prompts | 设计/品牌/UX 等角色型子代理提示词 |
| `engineering/` | Agent Prompts | 工程角色型子代理提示词（前端/后端/DevOps 等） |
| `marketing/` | Agent Prompts | 市场增长与内容分发角色型子代理提示词 |
| `product/` | Agent Prompts | 产品相关角色型子代理提示词 |
| `project-management/` | Agent Prompts | 项目管理与运营角色型子代理提示词 |
| `support/` | Agent Prompts | 支持/法务/财务等运营支持角色型子代理提示词 |
| `testing/` | Agent Prompts | 测试相关角色型子代理提示词 |
| `specialized/` | Agent Prompts | 专项能力子代理提示词（编排、数据、分发等） |
| `spatial-computing/` | Agent Prompts | XR/visionOS/空间计算相关角色型子代理提示词 |
| `strategy/` | 手册/流程 | 交付流程、runbook、playbook、协调模板等 |
| `*_patterns/`、`*-patterns/` | Skills | 各类架构/工程实践技能包（以 `SKILL.md` 为入口） |
| `django-*`、`springboot-*`、`swift*`、`python-*`、`golang-*`、`cpp-*`、`java-*` | Skills | 语言/框架专项技能包（以 `SKILL.md` 为入口） |
| `continuous-learning*/` | 实验/系统 | 会话学习/观察系统与相关脚本 |
| 其它包含 `SKILL.md` 的目录 | Skills | 单主题技能包（以 `SKILL.md` 为入口） |

## 建议的查找路径

- 找“主题/最佳实践/清单”：先看 [CATALOG.md](agents/CATALOG.md) 的 Skills 部分
- 找“角色/执行方式/工具集”：看 [CATALOG.md](agents/CATALOG.md) 的 Agent Prompts 部分（按目录）
