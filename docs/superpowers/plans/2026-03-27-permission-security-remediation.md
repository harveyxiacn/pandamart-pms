# Permission Security Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the audited permission and credential defects in PandaMart PMS by tightening server-side authorization, aligning client route exposure, and adding regression checks that fail on future drift.

**Architecture:** Treat the server as the source of truth for authorization and account state, then make the client route tree and UI exposure match that contract. Add focused regression coverage in the existing client Vitest suite and the server E2E harness so the main admin-only surfaces cannot silently regress.

**Tech Stack:** Express, TypeScript, Knex, JWT, React, Vite, Vitest, PowerShell, tsx

---

### Task 1: Harden Server Authorization And Credential Handling

**Files:**
- Modify: `server/src/routes/analytics.routes.ts`
- Modify: `server/src/routes/ai-chat.routes.ts`
- Modify: `server/src/routes/inventory.routes.ts`
- Modify: `server/src/middleware/auth.ts`
- Modify: `server/src/services/auth.service.ts`
- Modify: `server/src/routes/auth.routes.ts`
- Modify: `server/src/routes/user.routes.ts`
- Modify: `server/src/config/env.ts`
- Modify: `server/src/database/seeds/01_admin_user.ts`
- Modify: `server/src/database/seeds/03_default_ai_providers.ts`
- Modify: `server/.env.example`

- [ ] Write a failing backend regression path in the E2E harness for staff access to analytics, AI, and inventory adjust.
- [ ] Run the backend E2E script and confirm the new permission checks fail against the current implementation.
- [ ] Add admin-only protection to analytics routes, AI routes, and inventory adjust.
- [ ] Rehydrate the authenticated user from the database on each protected request and reject disabled or missing users.
- [ ] Enforce the documented password policy on create, reset, and self-service password change flows.
- [ ] Remove hard-coded fallback JWT and AI encryption secrets from runtime config.
- [ ] Replace seeded admin password and seeded AI API key defaults with operator-supplied environment variables or secure no-default behavior.
- [ ] Re-run the targeted backend E2E script and confirm the authorization regressions now pass.

### Task 2: Align Client Route And UI Exposure

**Files:**
- Modify: `client/src/App.tsx`
- Modify: `client/src/hooks/usePermission.ts`
- Modify: `client/src/pages/InventoryPage.tsx`
- Modify: `client/src/pages/LoginPage.tsx`
- Modify: `client/src/components/layout/Sidebar.tsx`
- Modify: `client/src/components/layout/MobileNav.tsx`
- Create or modify tests under: `client/src/components/layout/__tests__/`
- Create or modify tests under: `client/src/__tests__/` if needed

- [ ] Write failing client tests for staff-visible admin-only navigation or route behavior.
- [ ] Run the affected client tests and confirm they fail against the current route tree or menu exposure.
- [ ] Move dashboard and AI assistant access behind admin-only routing or an equivalent role-safe redirect path.
- [ ] Hide inventory adjustment actions for staff users.
- [ ] Remove default admin credentials from the login screen and state initialization.
- [ ] Re-run the targeted client tests and confirm the new role restrictions pass.

### Task 3: Expand Verification Coverage

**Files:**
- Modify: `server/src/scripts/e2e-db-test.ts`
- Modify client tests created in Task 2

- [ ] Add server E2E assertions for:
- [ ] Staff gets `403` on analytics routes.
- [ ] Staff gets `403` on AI routes.
- [ ] Staff gets `403` on inventory adjust.
- [ ] Disabled users are rejected after login token issuance.
- [ ] Demoted users lose admin access even with an older token.
- [ ] Weak passwords are rejected on admin user creation or password-change paths.
- [ ] Add client assertions for:
- [ ] Staff does not see admin-only nav entries.
- [ ] Staff is redirected away from dashboard and AI assistant surfaces if they navigate directly.
- [ ] Staff cannot access the inventory-adjust entrypoint.

### Task 4: Verify And Report

**Files:**
- Reference: `docs/superpowers/runtime/2026-03-26-pandamart-live-team.md`

- [ ] Run `cd client && npm run test`.
- [ ] Run `cd client && npm run build`.
- [ ] Run `cd server && npm run build`.
- [ ] Run `cd server && npm run test:e2e` with explicit secure env vars for JWT secret, AI encryption key, and E2E admin password if they are not already present in the local environment.
- [ ] Record any remaining residual risks that were not addressed in this pass, especially broader token-storage architecture if left unchanged.

### Task 5: Execution Note

**Files:**
- Reference: `docs/superpowers/specs/2026-03-26-development-team-operating-model-design.md`

- [ ] Respect the current workspace constraint: `E:\Project\PandaMartPMS` is not a Git repository, so no commit step is available from this location.
