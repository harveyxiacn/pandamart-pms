# PandaMart Live Team Charter

> Date: 2026-03-26
> Project: PandaMart PMS
> Session mode: live multi-agent delivery
> Manager: primary Codex session

## 1. Active roster

- Team Manager: primary session, routing and acceptance owner
- Tech Lead / Architect: `gpt-5.4 xhigh`
- Planner / Delivery Lead: `gpt-5.4 xhigh`
- Frontend Engineer: `gpt-5.3-codex xhigh`
- Backend Engineer: `gpt-5.3-codex xhigh`
- Data / Integration Engineer: `gpt-5.3-codex xhigh`
- QA / Verification Engineer: `gpt-5.3-codex xhigh`

## 2. Project context

- Frontend workspace: `client/`
- Backend workspace: `server/`
- Existing docs: `docs/`
- Product areas: OCR invoice intake, inventory, analytics, AI chat, suppliers, auth
- Current known constraint: the working directory is not a Git repository, so commit workflow is unavailable from this path

## 3. Ownership model

- Tech Lead owns architecture review, interfaces, escalation support, and cross-scope consistency
- Planner owns mission breakdown, dependency tracking, and work sequencing
- Frontend owns `client/src/` UI implementation and view-layer test work
- Backend owns `server/src/routes/`, `server/src/services/`, and API-facing server logic unless explicitly narrowed
- Data / Integration owns `server/src/models/`, `server/src/database/`, OCR pipeline wiring, import/export logic, and integration-heavy service work
- QA owns verification strategy, regression review, and targeted test missions across `client/` and `server/`

## 4. Bootstrap rules

1. Leadership agents read the operating model spec and relevant PandaMart docs first.
2. Specialist agents do not start implementation until they receive a bounded mission with owned files.
3. Parallel work is allowed only with disjoint write scopes.
4. All agents must report changed files, checks run, and unresolved risks.

## 5. Initial bootstrap objective

Produce a project readiness readout that identifies:

- architectural hotspots
- immediate mission slices
- subsystem ownership recommendations
- verification priorities
- first-pass delivery risks

## 6. Bootstrap readiness summary

- Architecture review: PandaMart is organized as a React SPA in `client/` and an Express plus Knex backend in `server/`, with the invoice upload and confirm path in `server/src/routes/invoice.routes.ts`, `server/src/services/ocr.service.ts`, and `server/src/services/invoice.service.ts` acting as the main cross-system mutation hub and the frontend build coupled into `server/public`.
- Delivery slicing: the repo decomposes cleanly into auth and shell, invoice OCR and review, catalog master data, inventory and stocktake, analytics and insights, AI providers and chat, and ops surfaces like notifications, exports, and audit logs, with auth, OCR, and AI/provider work requiring the heaviest coordination.
- Frontend readiness: the client is clustered by domain pages and shared API wrappers, but `client/src/pages/InvoiceListPage.tsx`, `client/src/pages/InvoiceScanPage.tsx`, `client/src/pages/SettingsPage.tsx`, `client/src/App.tsx`, and `client/src/api/client.ts` are the most likely frontend hotspots for future missions.
- Backend readiness: the server mostly follows a thin route-to-service pattern, but `server/src/services/invoice.service.ts`, `server/src/services/ocr.service.ts`, `server/src/services/llm.service.ts`, and `server/src/routes/ai-provider.routes.ts` carry the highest backend risk and should be paired with explicit API or DB verification.
- Data / integration readiness: the strongest schema and integration coupling sits across the invoice, invoice item, inventory, and inventory log tables plus the OCR ingestion path, and current drift includes template-memory logic existing in `server/src/services/template.service.ts` without being wired into `server/src/services/ocr.service.ts`.
- QA readiness: verification coverage is thin, with a small Vitest surface in `client/` and a single main E2E harness in `server/src/scripts/e2e-db-test.ts`, so every mission needs explicit build, route, and flow-level checks, especially for invoice, inventory, analytics, and AI features.
