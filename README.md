# PandaMart PMS — AI-Powered Supermarket Inventory & Procurement System

> 熊猫超市智能库存管理系统 · A full-stack inventory/procurement platform where an LLM agent and an OCR pipeline do the busywork — turning supplier invoices into structured stock data and answering operational questions in natural language.

<!-- A hero screenshot/GIF of the dashboard and the AI chat panel would go here. -->

## Why this is interesting (engineering)

The two hard parts of this system are both about **making LLM output trustworthy in a real business workflow**:

### 1. A hybrid invoice OCR pipeline that doesn't trust the model blindly
`server/src/services/ocr.service.ts` (~780 lines) routes each upload to the right extractor and then **validates the model's output deterministically**:

- **Routing:** PDF → text-extraction first; Excel → direct structured parse; image → Vision.
- **Graceful fallback:** a text-PDF is parsed by template, then by LLM; if that fails it **degrades to rendering the page and using Vision** — so scanned and digital invoices both work.
- **Deterministic post-processing of LLM output:** supplier address/contact extraction, **CAD total reconciliation** (the line items must add up), barcode-line hints, and **fuzzy product matching with a confidence score** per item. The model proposes; regex/heuristics verify.

### 2. A real tool-calling agent, not a chat wrapper
`server/src/services/ai-chat.service.ts` implements a proper **function-calling loop** over **8 database-backed tools** (`get_low_stock`, `search_inventory`, `get_price_changes`, `get_purchase_ranking`, `get_supplier_summary`, `get_sales_summary`, `get_reorder_suggestions`, `get_expiring_batches`):

- Bounded loop (`MAX_ROUNDS = 5`) with a **forced final no-tool round** so the agent always returns an answer instead of looping.
- Tool-call/tool messages are orchestrated **per request and not persisted**, avoiding cross-round `tool_call`/`tool` pairing bugs.
- The response reports exactly **which tools were used** for transparency.

Ask *"what should I reorder this week?"* and the agent calls `get_reorder_suggestions` + `get_low_stock` against live data and explains the answer.

## Tech stack

- **Frontend:** React 18 + TypeScript + Vite + TailwindCSS + shadcn/ui + Recharts
- **Backend:** Node.js + Express + TypeScript
- **Database:** MariaDB/MySQL 10.x via Knex.js (migrations + seeds)
- **AI:** OpenAI-compatible API (multi-provider), Vision for scanned invoices

## Features

1. **Smart invoice OCR** — PDF text extraction / AI Vision / direct Excel parsing, with deterministic validation.
2. **Inventory management** — inbound / outbound / stock-take / low-stock alerts.
3. **Analytics** — dashboards for purchasing trends, fast/slow movers, price movement.
4. **AI chat** — natural-language Q&A over inventory and procurement (the agent loop above).
5. **AI business insights** — anomaly detection, periodic reports, reorder suggestions.
6. **Supplier management** — CRUD + per-supplier invoice-template memory.
7. **Roles** — Admin / Staff permission tiers.

## Project structure

```
PandaMartPMS/
├── client/    React 18 + Vite admin UI
├── server/    Express + TypeScript API
│   └── src/{config,middleware,models,routes,services,database,types,utils}
├── docs/      api-design.md, deployment guide and design notes
└── logo-300x292.png
```

Sample invoices are deliberately not shipped: the ones used to develop the OCR
pipeline were real supplier documents. Put your own PDFs under `sampleinvoice/`
(local only — it is git-ignored) to exercise the invoice flow.

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
cp .env.example .env       # set DB_*, JWT_SECRET, AI_ENCRYPTION_KEY, SEED_ADMIN_PASSWORD
npm install
npm run migrate            # database schema
npm run seed               # demo data (admin password from SEED_ADMIN_PASSWORD)
npm run dev
npm run test:e2e           # E2E (MySQL)
```

> **Secrets:** no credentials are committed — only `.env.example` templates are tracked; `JWT_SECRET`, `AI_ENCRYPTION_KEY` and the admin password are supplied via `server/.env`. The seed data is **fictional**.

## Notes

- API base path: `/api/v1` (see `docs/api-design.md`).
- All demo/seed data is fictional; safe to run and showcase.

## License

Private — All Rights Reserved.

---

*中文说明：基于 AI 的超市库存管理系统，支持发票 OCR 识别、智能库存管理、数据分析与 AI 对话。前端 React 18，后端 Express + TypeScript，数据库 MariaDB。核心亮点是混合 OCR 流水线（PDF 文本/Vision/Excel 分流 + 确定性校验）与 8 工具的 function-calling agent loop。*
