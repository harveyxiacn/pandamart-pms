# Staff Financial Visibility Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restrict staff users from viewing historical and catalog financial data while preserving the active pending-invoice receiving workflow they still need to complete.

**Architecture:** Treat the PRD rule "staff cannot view financial amounts" as the source of truth, but preserve a narrow receiving exception for `pending` invoice workflows. Enforce that boundary server-first through role-aware route behavior and response redaction, then align the client pages so staff cannot browse catalog prices, supplier spend, or historical invoice amounts outside pending receiving.

**Tech Stack:** Express, TypeScript, Knex, React, Vitest, tsx

---

### Task 1: Enforce Server-Side Financial Visibility Boundaries

**Files:**
- Modify: `server/src/routes/invoice.routes.ts`
- Modify: `server/src/routes/product.routes.ts`
- Modify: `server/src/routes/supplier.routes.ts`
- Modify: `server/src/services/invoice.service.ts`
- Modify: `server/src/services/supplier.service.ts`
- Modify: `server/src/models/Invoice.ts` if needed for staff-safe filtering

- [ ] Add failing server regression checks for staff access to historical invoice, price-history, and supplier financial data.
- [ ] Keep staff access to pending invoice receiving endpoints working.
- [ ] Restrict `GET /api/v1/products/:id/price-history` to admin-only.
- [ ] Redact product default price from staff-facing product read endpoints.
- [ ] Redact supplier financial totals from staff-facing supplier detail.
- [ ] Restrict or redact supplier invoice history for staff so historical invoice amounts are not exposed.
- [ ] Restrict staff invoice list/detail/file access to pending receiving scope only, while preserving admin access to all invoice history.

### Task 2: Align Client Financial UI Exposure

**Files:**
- Modify: `client/src/pages/ProductsPage.tsx`
- Modify: `client/src/pages/InvoiceListPage.tsx`
- Modify: `client/src/api/products.ts` if needed
- Modify: `client/src/api/invoices.ts` if needed
- Modify: `client/src/types/index.ts` if needed
- Create or modify tests under: `client/src/__tests__/`

- [ ] Write failing client tests for staff-visible product pricing/history and any invoice-history browsing behavior you change.
- [ ] Hide product default-price UI from staff.
- [ ] Hide product price-history UI from staff.
- [ ] Constrain the invoice list experience for staff to pending receiving scope and remove historical browsing affordances that no longer apply.
- [ ] Preserve pending invoice review/edit/confirm behavior for staff.

### Task 3: Expand Regression Coverage

**Files:**
- Modify: `server/src/scripts/e2e-db-test.ts`
- Modify client tests created in Task 2

- [ ] Add server assertions that staff cannot access product price history.
- [ ] Add server assertions that staff cannot access confirmed/rejected invoice detail or file data.
- [ ] Add server assertions that staff invoice list scope is pending-only.
- [ ] Add server assertions that supplier financial totals/history are blocked or redacted for staff.
- [ ] Add client assertions that staff cannot see product pricing/history UI.
- [ ] Add client assertions that staff cannot browse historical invoice states if that UI remains present.

### Task 4: Verify

**Files:**
- Reference: `docs/PRD.md`
- Reference: `docs/superpowers/runtime/2026-03-26-pandamart-live-team.md`

- [ ] Run `cd client && npm run test`.
- [ ] Run `cd client && npm run build`.
- [ ] Run `cd server && npm run build`.
- [ ] Run `cd server && npm run test:e2e` with explicit DB and secret env vars if local defaults are not suitable.
- [ ] Record the remaining unresolved doc contradiction: staff invoice receiving still involves amount fields in the pending workflow.
