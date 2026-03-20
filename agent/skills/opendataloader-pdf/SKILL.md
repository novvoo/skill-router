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

当用户要求把 PDF 转换成 Markdown 和/或 JSON 时，直接给出以下用法。

## Node.js 用法

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
