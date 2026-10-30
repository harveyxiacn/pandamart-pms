# PandaMart PMS — AI-Powered Supermarket Inventory & Procurement System

> 熊猫超市智能库存管理系统 · A full-stack inventory/procurement platform where a **local-first assistant**, **local invoice OCR**, and optional LLM do the busywork — turning supplier invoices into structured stock data and answering operational questions over live warehouse data.

<!-- A hero screenshot/GIF of the dashboard and the AI chat panel would go here. -->

## Live demo

**<https://harveyxiacn.github.io/pandamart-pms/>**

A static GitHub Pages build of the client with an **in-browser mock backend** — no server or database required. The mock implements every API the UI calls, so all modules are interactive: invoice upload + OCR review + confirm, inventory, batches, sales, stocktake, products, suppliers, payables, analytics, smart assistant, notifications, settings, users, audit logs, and CSV/JSON exports.

The smart assistant runs **for real** in the demo: the same local rule engine is reimplemented against the in-browser demo database, so questions like *“哪些商品需要补货？”* or *“生姜还有多少库存？”* are answered from the demo stock, sales and expiry data — no API key involved.

Data is generated deterministically in the browser and persisted to `localStorage`. Use **重置演示数据** in the top banner to restore the seeded dataset.

| Role | Username | Password | Access |
| --- | --- | --- | --- |
| Admin | `admin` | `demo1234` | All modules |
| Staff | `staff01` | `demo1234` | Invoices, sales, inventory, batches, products, suppliers, notifications |

Rebuild the demo locally with `cd client && npm run build:demo`; the output in `client/dist-demo/` is deployed by `.github/workflows/deploy-pages.yml`.

## Why this is interesting (engineering)

The hard parts of this system are about **making automation trustworthy in a real business workflow** — and making it work even when no LLM is configured:

### 1. Invoice OCR that works without an AI API
`server/src/ocr/` is a self-contained plugin. The deterministic parser does the semantic work; the OCR engine only supplies words and coordinates:

- **Routing:** Excel → structured parse; digital PDF → `pdf-parse` text + rule parser; image / scanned PDF → Tesseract TSV; hard cases → optional LLM/Vision.
- **Local OCR:** Tesseract CLI (`eng+chi_sim`) plus `pdftoppm` for scanned PDFs, invoked as child processes so an OCR failure cannot take down Node and memory stays bounded on a 1 GB VPS. `apt-get install tesseract-ocr tesseract-ocr-chi-sim poppler-utils` is all it needs.
- **Deterministic parsing:** line-item extraction from trailing numeric tokens (works even when table columns drift), two-line item layouts, barcodes, units, `E/H` tax codes, `Subtotal/HST/Total` and `小计/税额/总计`, with **line-item totals reconciled against the invoice subtotal**.
- **Supplier calibration:** OCR text is matched against supplier names already in the database, so a slightly misread `CBS Wholesale` still lands on the right supplier.
- **LLM stays optional:** `invoice_ocr_mode` = `auto` (local first, LLM only when confidence is low), `local` (never call AI) or `llm` (AI first). Any LLM failure falls back to the local result.

### 2. A real tool-calling agent, not a chat wrapper
`server/src/services/ai-chat.service.ts` implements a proper **function-calling loop** over **8 database-backed tools** (`get_low_stock`, `search_inventory`, `get_price_changes`, `get_purchase_ranking`, `get_supplier_summary`, `get_sales_summary`, `get_reorder_suggestions`, `get_expiring_batches`):

- Bounded loop (`MAX_ROUNDS = 5`) with a **forced final no-tool round** so the agent always returns an answer instead of looping.
- Tool-call/tool messages are orchestrated **per request and not persisted**, avoiding cross-round `tool_call`/`tool` pairing bugs.
- The response reports exactly **which tools were used** for transparency.
- Every request injects a compact **knowledge-base snapshot** into the system prompt, so the agent starts with a reliable floor instead of guessing.

Ask *"what should I reorder this week?"* and the agent calls `get_reorder_suggestions` + `get_low_stock` against live data and explains the answer.

### 3. A local-first assistant that needs no LLM at all
`server/src/services/knowledge.service.ts` turns the live database into a **cached knowledge snapshot** (inventory, low stock, expiring batches, 1/7/30/90-day sales & purchases, supplier concentration, price movement, payables, reorder suggestions). `server/src/services/assistant-engine.ts` is a pure, unit-tested rule engine on top of it:

- **Intent + entity parsing** for Chinese and English questions, including fuzzy product lookup (`苹果` → `红富士苹果`) and SKU/barcode matching.
- **Deterministic answers** with real numbers: reorder quantities, expiry countdowns, margin breakdowns, supplier balances, per-product stock status.
- **Inventory alerts** derived from the same snapshot: stockout risk, expired/expiring batches, pending invoices, price spikes, slow movers and payables.
- **Automatic invalidation** on invoice confirm / sales / stock adjustments; otherwise a 60-second cache.
- **Graceful LLM fallback:** if `llm` or `auto` mode fails (no provider, timeout, rate limit), the request is answered by the local engine instead of erroring.

The default mode is `local`, so a fresh install has a working assistant with no API key, no network dependency and no per-question cost.

## Tech stack

- **Frontend:** React 18 + TypeScript + Vite + TailwindCSS (custom tokens) + Lucide + Recharts
- **Backend:** Node.js + Express + TypeScript
- **Database:** MariaDB/MySQL 10.x via Knex.js (migrations + seeds)
- **AI:** local rule engine (default) + optional OpenAI-compatible API (multi-provider)
- **OCR:** PDF text parser + Tesseract CLI (local, default) + optional Vision LLM

## Features

1. **Invoice OCR** — Excel / text PDF / scanned image, with a **local Tesseract engine** and deterministic parsing; no AI API required.
2. **Inventory management** — inbound / outbound / stock-take / low-stock alerts.
3. **Analytics** — dashboards for purchasing trends, fast/slow movers, price movement.
4. **Local smart assistant** — a live knowledge base plus deterministic Q&A and inventory alerts; no LLM required.
5. **LLM agent (optional)** — tool-calling Q&A, business insights and narrative reorder advice when a provider is configured.
6. **Supplier management** — CRUD + per-supplier product-alias learning.
7. **Roles** — Admin / Staff permission tiers.

## Project structure

```
PandaMartPMS/
├── client/    React 18 + Vite admin UI
├── server/    Express + TypeScript API
│   ├── src/{config,middleware,models,routes,services,database,types,utils}
│   └── src/ocr/   local invoice OCR plugin (Tesseract + deterministic parser)
├── docs/      api-design.md, local-ocr.md, deployment guide and design notes
└── LICENSE
```

Sample invoices are deliberately not shipped: the ones used to develop the OCR
pipeline were real supplier documents. Put your own PDFs under `sampleinvoice/`
(local only — it is git-ignored) to exercise the invoice flow.

## Interface

The UI is a dense operations console, not a marketing app: neutral surfaces,
one primary action per screen, red reserved for destructive/error states.
Colour, spacing and type come from semantic tokens in
[`docs/design-system.md`](docs/design-system.md) — components reference roles
(`primary`, `danger`, `line`), never raw hex, so the palette can change in one
place.

Accessibility work already in place: skip-to-content link, a single
`:focus-visible` treatment across the app, `prefers-reduced-motion` fallback,
labelled icon-only buttons, `role="alert"` on login errors, and tabular figures
in every table so numbers do not shift columns.

## Quick start

**Frontend**
```bash
cd client
cp .env.example .env       # set VITE_API_BASE_URL
npm install
npm run dev                # http://localhost:5173
npm run build              # production bundle
```

**Backend**
```bash
cd server
cp .env.example .env       # set DB_*, JWT_SECRET, AI_ENCRYPTION_KEY, SEED_ADMIN_PASSWORD, SEED_STAFF_PASSWORD
npm install
npm run migrate            # database schema
npm run seed               # demo data: suppliers, products, invoices, sales, batches, payables, aliases
npm run dev
npm run test:e2e           # E2E (MySQL)
```

> **No AI key required:** the assistant defaults to `local` mode and works straight from the database; invoice OCR falls back to the local Tesseract engine. Install the OCR packages with `sudo bash scripts/install-ocr-deps.sh` (Ubuntu/Debian) or see `docs/local-ocr.md`. To enable LLM mode, add a provider in **系统设置 → AI 提供商** and switch **智能助手模式** / **发票识别模式** to `llm` (or `auto`).

> **Secrets:** no credentials are committed — only `.env.example` templates are tracked; `JWT_SECRET`, `AI_ENCRYPTION_KEY` and the demo account passwords are supplied via `server/.env`. The seed data is **fictional**.

## Notes

- API base path: `/api/v1` (see `docs/api-design.md`).
- All demo/seed data is fictional; safe to run and showcase.

## License

Private — All Rights Reserved.

---

*中文说明：基于 AI 的超市库存管理系统，支持发票 OCR 识别、智能库存管理、数据分析与智能助手。前端 React 18，后端 Express + TypeScript，数据库 MariaDB。发票识别默认**本地优先**：文本 PDF 用规则解析，图片/扫描件用 Tesseract（eng+chi_sim）本地 OCR，结果由确定性解析器整理后入库，无需 AI API；配置提供商后可切换 LLM/Vision 兜底。智能助手默认使用**本地资料库 + 规则引擎**（无需 LLM、无外部调用、结果可复现），可回答问题并生成库存/保质期/应付预警；配置 AI 提供商后可切换 LLM 增强模式，失败会自动降级到本地。核心亮点还包括混合 OCR 流水线、金额勾稽校验与 8 工具的 function-calling agent loop。*
