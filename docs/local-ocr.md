# 本地发票 OCR 插件（无需云端 AI）

`server/src/ocr/` 是一个可独立替换引擎的发票识别插件。它把「看图识字」和「理解发票结构」拆成两层：

```
上传文件
  ├─ Excel ────────────────► excel.service（原有，结构化解析）
  ├─ 有文本层的 PDF ───────► pdf-parse → invoice-parser（纯规则）
  ├─ 图片 / 扫描版 PDF ────► Tesseract CLI → TSV → invoice-parser
  └─ 难例（可选）─────────► 已配置的 LLM / Vision（自动降级回本地）
```

落库仍由 `ocr.service.processFile` 统一完成（同一套供应商匹配、别名学习、`invoice_items` 写入），
本地模式与 AI 模式不会产生两套数据。

## 为什么不用逆向 Tesseract

Tesseract 是 Apache-2.0 开源项目，源码、训练数据和编译方式都在
<https://github.com/tesseract-ocr/tesseract>，不需要 RE。这里直接调用系统
`tesseract` / `pdftoppm` 命令行：

- 进程隔离：OCR 崩溃、超时不会拖垮 Node 服务；
- 内存可控：不把 wasm/ONNX 运行时塞进 Node 进程，适合 1GB 内存的 VPS；
- 可替换：`tesseract.provider.ts` 只输出统一的 `OcrDocument`，以后换 PaddleOCR/RapidOCR 不影响解析器。

## 安装

Ubuntu / Debian：

```bash
sudo apt-get update
sudo apt-get install -y tesseract-ocr tesseract-ocr-eng tesseract-ocr-chi-sim poppler-utils
```

macOS：

```bash
brew install tesseract tesseract-lang poppler
```

Windows：安装 Tesseract 与 Poppler，并把 `tesseract.exe`、`pdftoppm.exe` 所在目录加入 `PATH`；
或者用环境变量指定：

```bash
TESSERACT_BIN="C:\Program Files\Tesseract-OCR\tesseract.exe"
PDFTOPPM_BIN="C:\poppler\Library\bin\pdftoppm.exe"
```

## 配置

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| `TESSERACT_BIN` | `tesseract` | Tesseract 可执行文件 |
| `PDFTOPPM_BIN` | `pdftoppm` | Poppler 的 PDF 转图片工具 |
| `TESSERACT_LANG` | `eng+chi_sim` | 语言包，缺失时自动退回可用语言 |
| `TESSERACT_PSM` | `6` | 页面分割模式；整页表格可试 `3` |
| `LOCAL_OCR_MAX_PAGES` | `3` | 扫描版 PDF 最多识别页数 |

系统设置里的「发票识别模式」：

- `auto`（默认）：本地解析优先；置信度低于阈值且有 AI 提供商时才调用 LLM；LLM 失败回退本地。
- `local`：只使用文本解析 + 本地 Tesseract，绝不调用任何 AI。
- `llm`：保持原来的 AI 优先行为，本地作为失败兜底。

识别结果会带 `ocrEngine` / `ocrConfidence` / `ocrWarnings`，前端上传日志会显示识别方式与置信度。

## 解析器做了哪些确定性处理

- 从 TSV 的词坐标重建行，按「商品名 + 行尾三个数字」识别明细，不强依赖表头列对齐；
- 兼容两行式发票（名称一行、数量/单价/金额下一行）、条码 `(12345678)`、`LB/Case` 单位、`E/H` 税码；
- 支持 `Subtotal / HST / Total`、`小计 / 税额 / 总计`，并校验「明细合计 = 小计」；
- 用数据库里的供应商名称做校准：OCR 把 `CBS Wholesale` 识别成 `CBS Wholesa1e` 时，仍能匹配到已存在的供应商；
- 识别不到发票号时生成 `LOCAL-<timestamp>`，不阻塞人工确认；
- 低置信度不会静默入库：返回 warnings，前端展示，确认页仍由人工核对。

## 测试

```bash
cd server
npx vitest run src/ocr/invoice-parser.test.ts
npx vitest run src/services/ocr.service.test.ts
```

纯解析测试不依赖 Tesseract 二进制；`getStatus()` 会检测本机是否安装。

## 后续可扩展点

- 供应商模板：把某个供应商的列顺序/关键词固化成 profile（`invoice-parser.ts` 的 `COLUMN_PATTERNS` 已是数据驱动）。
- 商品字典纠错：用 `products.name_en/name_zh` 对 OCR 名称做编辑距离纠正，减少人工改字。
- 表格线检测：对复杂发票先用 OpenCV/Sharp 找横线，再切行，可提高多栏发票准确率。
