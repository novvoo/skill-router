# Node.js/TypeScript 版 skill_router

这个目录把仓库里的 `skill_router`（Python CLI）改成 Node.js 的 TypeScript HTTP 服务：

- `GET /skills`：列出可用 skills
- `POST /choose`：仅做路由选择
- `POST /run`：路由选择 + 注入 skill 内容后调用模型（可选：上传文档，作为任务上下文一起分析）
- `POST /documents/extract`：上传文档并使用 `@kreuzberg/node` 在本机提取

skills 来源直接读取仓库里的 `.agents/` 目录（包含 `CATALOG.md` 和各个 `*/SKILL.md`）。

## 配置

支持两种方式提供 3 个 OpenAI 配置（每个请求都会用到）：

- 方式 A：在服务器进程环境变量里设置
  - `OPENAI_API_KEY`
  - `OPENAI_BASE_URL`（例如 `https://api.openai.com/v1` 或你的兼容端点）
  - `OPENAI_MODEL`（例如 `gpt-4.1-mini`）
- 方式 B：由网页在浏览器本地保存（localStorage），并通过请求头传入（同一浏览器下关闭/重新打开仍保留，可手动清空）
  - `X-OpenAI-API-Key`
  - `X-OpenAI-Base-URL`
  - `X-OpenAI-Model`

## 本地运行

在本目录下：

```bash
npm i
npm run dev
```

浏览器打开启动日志里输出的地址（默认 `http://127.0.0.1:8080/`；如果端口被占用会自动顺延），即可在页面里配置并调用接口。

## Vercel 部署

本项目使用 `public/` 提供静态页面，使用 `api/index.ts` 提供后端接口，并通过 `vercel.json` 把 `/skills`、`/choose`、`/run`、`/documents/extract` 重写到后端函数。

## 调用示例

```bash
curl -s http://127.0.0.1:8080/skills | head
```

```bash
curl -s http://127.0.0.1:8080/choose ^
  -H "content-type: application/json" ^
  -d "{\"query\":\"帮我设计一个 REST API 的分页规范\"}"
```

```bash
curl -s http://127.0.0.1:8080/run ^
  -H "content-type: application/json" ^
  -d "{\"query\":\"帮我设计一个 REST API 的分页规范\"}"
```

```bash
curl -s http://127.0.0.1:8080/run ^
  -F "query=请根据文档内容，提炼关键结论并给出执行建议" ^
  -F "file=@./path/to/document.pdf"
```

```bash
curl -s http://127.0.0.1:8080/documents/extract ^
  -F "file=@./path/to/document.pdf"
```

说明：
- `mime_type`/`mimeType` 字段可选；后端会优先按上传文件自带的 Content-Type、文件内容特征（magic bytes）与文件扩展名自动识别。
- 如果你需要强制指定解析类型（例如把无扩展名文件当作 PDF），再手动传 `mime_type=application/pdf`。
