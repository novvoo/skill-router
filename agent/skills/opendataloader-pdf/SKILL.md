---
name: opendataloader-pdf
description: >-
  Convert PDFs to Markdown and/or JSON using @opendataloader/pdf. Use when the user asks
  to convert PDF files (single, multiple, or folders) into markdown/json outputs.
license: MIT
metadata:
  author: opendataloader
  version: "1.0"
---

# PDF 转 Markdown / JSON（@opendataloader/pdf）

当用户要求把 PDF 转换成 Markdown 和/或 JSON 时，必须遵循以下要求：

1. **不要在对话中直接输出转换后的完整文本内容**。
2. **优先使用服务器自动生成的下载地址**：检查上下文中的“用户上传的参考文档”块，如果其中包含“下载地址”，请直接将该地址提供给用户。
3. **如果没有自动生成的地址（例如用户提供的是本地路径）**：
   - 必须将转换后的文件保存到 `output/` 目录下。
   - 在对话中提供该文件的下载地址。下载地址格式为 `http://127.0.0.1:<PORT>/outputs/<relative-path-under-output>`（通常端口为 8080）。

## 执行流程示例

### 场景 A：用户上传了文件（推荐）
1. **查找下载地址**：在上下文的“用户上传的参考文档”块中找到类似 `下载地址: http://127.0.0.1:8080/outputs/pdf-conversion/...` 的信息。
2. **回复用户**：告诉用户转换已完成，并提供该链接。例如：“PDF 已转换完成，您可以点击此处下载：[下载 Markdown](http://127.0.0.1:8080/outputs/pdf-conversion/...)”。

### 场景 B：用户提供本地文件路径或在线 PDF 链接
**重要**：你必须实际执行以下命令，不要伪造或猜测结果。必须确认文件已经生成在 `output/pdf-conversion/` 目录下，才能将链接发给用户。

1. **准备文件**：
   - 如果是在线链接：先使用 `curl` 下载，例如 `curl -L -o temp/input.pdf "https://.../file.pdf"`
   - 如果是本地文件：直接使用本地路径。
2. **执行转换**：运行转换脚本：
   `npx tsx scripts/convert_opendataloader_pdf.ts <文件路径> --outputDir output/pdf-conversion --format markdown`
3. **验证并构造链接**：检查终端输出确认生成了哪些文件。如果原文件名为 `input.pdf`，输出通常为 `output/pdf-conversion/input.md`。提供下载链接：`http://127.0.0.1:<PORT>/outputs/pdf-conversion/input.md`（注意：处理文件名中的特殊字符或空格）。

## Node.js 库用法 (供参考)

```bash
npm install @opendataloader/pdf
```

```ts
import { convert } from '@opendataloader/pdf';

await convert(['file1.pdf', 'file2.pdf', 'folder/'], {
  outputDir: 'output/',
  format: 'markdown,json'
});
```
