# skill_router

一个最小实现的 “Claude Code 风格 Skill 路由器”：

- 启动时只加载 `name + description`（元数据层）用于选择
- 被选中后按需加载对应 `SKILL.md`（指令层）用于执行
- 支持 enterprise/user/project/plugin 多根目录扫描与同名覆盖

## 环境变量

必须：

- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`（OpenAI 兼容接口的 base URL，例如 `https://api.siliconflow.cn/v1`）
- `OPENAI_MODEL`（例如 `Qwen/Qwen3.5-4B`）

可选：

- `SKILL_ROOTS_ENTERPRISE` / `SKILL_ROOTS_USER` / `SKILL_ROOTS_PROJECT` / `SKILL_ROOTS_PLUGIN`
  - 用分号 `;` 分隔多个目录
  - 不设置时默认会扫描：
    - user：`~/.claude/skills`、`~/.agents/skills`
    - project：`./.agents`

## 运行

列出可用 skills：

```bash
python -m skill_router --list
```

仅做路由选择：

```bash
python -m skill_router --choose "我需要设计一个 REST API 的分页与错误格式"
```

选择并执行（把选中 Skill 的 `SKILL.md` 注入系统消息后再生成）：

```bash
python -m skill_router "帮我写一份符合生产实践的 REST API 错误响应规范"
```

