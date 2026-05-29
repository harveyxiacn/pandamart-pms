# Rate Limit Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align runtime rate-limit behavior with the documented policy by making authenticated limits user-scoped, separating dedicated route-class limiters from the general API limiter, and proving the behavior with E2E regressions.

**Architecture:** Keep login limited by IP, but make authenticated route classes share a common user-aware key strategy that falls back safely when no valid token exists. Remove accidental double-limiting by making the general API limiter skip routes that already have their own dedicated limiter, then add low-threshold E2E checks via env overrides to prove both per-user isolation and OCR-specific throttling.

**Tech Stack:** Express, express-rate-limit, TypeScript, JWT, tsx

---

### Task 1: Harden Limiter Keying And Route Boundaries

**Files:**
- Modify: `server/src/middleware/rateLimit.ts`
- Modify: `server/src/app.ts`
- Modify: `server/src/routes/invoice.routes.ts` if needed

- [ ] Add a failing regression path in the E2E script that proves one authenticated user can hit a limit without throttling a second authenticated user on the same IP.
- [ ] Add a failing regression path in the E2E script that proves the invoice OCR upload path uses the stricter OCR limit.
- [ ] Implement a shared authenticated key strategy for non-login limiters.
- [ ] Keep login limiter IP-scoped.
- [ ] Split the dedicated limiter for invoice OCR uploads to 10/min by default.
- [ ] Ensure the general API limiter skips auth, health, ready, OCR upload, AI, export, and AI-provider-test routes so those endpoints are governed by their dedicated limiters only.

### Task 2: Add E2E Verification Controls

**Files:**
- Modify: `server/src/scripts/e2e-db-test.ts`
- Modify: `server/.env.example` if needed

- [ ] Add env-driven low-threshold overrides for general API and OCR limiter tests.
- [ ] Add an E2E assertion that the same staff token hits `429` on repeated general queries once the override threshold is exceeded.
- [ ] Add an E2E assertion that a second staff user on the same IP still succeeds on the same route.
- [ ] Add an E2E assertion that repeated invoice upload requests without a file hit the OCR limiter threshold and return `429`.
- [ ] Add an E2E assertion that a second staff user is not blocked by the first user’s OCR-limit bucket.

### Task 3: Verify

**Files:**
- Reference: `docs/api-design.md`

- [ ] Run `cd server && npm run build`.
- [ ] Run `cd server && npm run test:e2e` with explicit DB, secret, seed-password, and low-threshold rate-limit env vars.
- [ ] Confirm the resulting behavior still matches the API design table: login IP-scoped, OCR 10/min/user by default, AI 20/min/user, ordinary queries 100/min/user, export 5/min/user, AI provider test 5/min/user.
