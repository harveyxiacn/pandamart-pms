# PandaMart Live Team Activation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a reusable live multi-agent delivery team for PandaMart PMS, with a saved runtime charter and an active roster bootstrapped in the current Codex session.

**Architecture:** Keep the user-facing manager role in the primary session, save a PandaMart-specific runtime charter under `docs/superpowers/runtime/`, then spawn a leadership layer followed by specialist agents with strict owned scopes and explicit bootstrap missions. Use the approved operating model spec as the contract source for routing, ownership, handoffs, and quality gates.

**Tech Stack:** Codex multi-agent tooling, Markdown documentation, PowerShell repo inspection, React + Express + TypeScript project context

---

### Task 1: Create The PandaMart Runtime Charter

**Files:**
- Create: `docs/superpowers/runtime/2026-03-26-pandamart-live-team.md`
- Reference: `docs/superpowers/specs/2026-03-26-development-team-operating-model-design.md`
- Reference: `docs/technical-design.md`

- [ ] **Step 1: Create the runtime directory**

Run: `New-Item -ItemType Directory -Force docs\superpowers\runtime | Out-Null`
Expected: command exits with code `0`

- [ ] **Step 2: Write the runtime charter**

```md
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
```

- [ ] **Step 3: Review the runtime charter for role and scope consistency**

Run: `Get-Content -Raw docs\superpowers\runtime\2026-03-26-pandamart-live-team.md`
Expected: file includes the six non-manager live roles, explicit ownership boundaries, and the initial bootstrap objective

### Task 2: Activate The Leadership Layer

**Files:**
- Reference: `docs/superpowers/runtime/2026-03-26-pandamart-live-team.md`
- Reference: `docs/superpowers/specs/2026-03-26-development-team-operating-model-design.md`
- Reference: `docs/technical-design.md`
- Reference: `docs/PRD.md`

- [ ] **Step 1: Spawn the Tech Lead / Architect**

```text
Role: Tech Lead / Architect
Model: gpt-5.4
Reasoning: xhigh
Message:
You are the Tech Lead / Architect for PandaMart PMS. Read the operating model spec at docs/superpowers/specs/2026-03-26-development-team-operating-model-design.md, the runtime charter at docs/superpowers/runtime/2026-03-26-pandamart-live-team.md, and the relevant PandaMart docs under docs/. Produce a concise bootstrap report covering architecture boundaries, likely integration hotspots, risky coupling, and review priorities for future missions. Do not take ownership of feature implementation. Report findings as: architecture map, hot spots, review gates, escalation triggers.
```

- [ ] **Step 2: Spawn the Planner / Delivery Lead**

```text
Role: Planner / Delivery Lead
Model: gpt-5.4
Reasoning: xhigh
Message:
You are the Planner / Delivery Lead for PandaMart PMS. Read the operating model spec at docs/superpowers/specs/2026-03-26-development-team-operating-model-design.md, the runtime charter at docs/superpowers/runtime/2026-03-26-pandamart-live-team.md, and the project docs under docs/. Produce a concise bootstrap report covering likely delivery slices, dependency clusters, and the minimum safe active roster for common mission types in this repo. Report as: candidate mission slices, dependency notes, activation order, verification checkpoints.
```

- [ ] **Step 3: Wait for both leadership bootstrap reports**

Expected: one report from the Tech Lead and one report from the Planner, each grounded in the PandaMart docs rather than generic team advice

### Task 3: Activate The Specialist Layer

**Files:**
- Reference: `docs/superpowers/runtime/2026-03-26-pandamart-live-team.md`
- Reference: `client/src/`
- Reference: `server/src/`

- [ ] **Step 1: Spawn the Frontend Engineer**

```text
Role: Frontend Engineer
Model: gpt-5.3-codex
Reasoning: xhigh
Message:
You are the Frontend Engineer for PandaMart PMS. Your default owned scope is client/src/. Read the runtime charter at docs/superpowers/runtime/2026-03-26-pandamart-live-team.md and inspect the client app structure. Return a bootstrap summary with key page clusters, shared UI dependencies, likely high-change files, and verification entry points for future frontend missions. Do not change code yet.
```

- [ ] **Step 2: Spawn the Backend Engineer**

```text
Role: Backend Engineer
Model: gpt-5.3-codex
Reasoning: xhigh
Message:
You are the Backend Engineer for PandaMart PMS. Your default owned scope is server/src/routes/ and server/src/services/. Read the runtime charter at docs/superpowers/runtime/2026-03-26-pandamart-live-team.md and inspect the server app structure. Return a bootstrap summary with API clusters, service boundaries, likely high-change files, and verification entry points for future backend missions. Do not change code yet.
```

- [ ] **Step 3: Spawn the Data / Integration Engineer**

```text
Role: Data / Integration Engineer
Model: gpt-5.3-codex
Reasoning: xhigh
Message:
You are the Data / Integration Engineer for PandaMart PMS. Your default owned scope is server/src/models/, server/src/database/, OCR pipeline wiring, and integration-heavy flows. Read the runtime charter at docs/superpowers/runtime/2026-03-26-pandamart-live-team.md and inspect the relevant server code. Return a bootstrap summary with schema and migration hotspots, OCR/integration touchpoints, and likely cross-service dependencies. Do not change code yet.
```

- [ ] **Step 4: Spawn the QA / Verification Engineer**

```text
Role: QA / Verification Engineer
Model: gpt-5.3-codex
Reasoning: xhigh
Message:
You are the QA / Verification Engineer for PandaMart PMS. Read the runtime charter at docs/superpowers/runtime/2026-03-26-pandamart-live-team.md and inspect the available client and server test entry points. Return a bootstrap summary with current verification surfaces, likely regression-sensitive areas, missing-signal risks, and the checks you would expect to run for frontend, backend, and integration missions. Do not change code yet.
```

- [ ] **Step 5: Wait for specialist bootstrap acknowledgements**

Expected: each specialist returns a scope-aware bootstrap summary tied to PandaMart files and verification surfaces

### Task 4: Integrate The Bootstrap Round

**Files:**
- Modify: `docs/superpowers/runtime/2026-03-26-pandamart-live-team.md`

- [ ] **Step 1: Synthesize the six-role bootstrap output into a readiness summary**

Append a `## 6. Bootstrap readiness summary` section to `docs/superpowers/runtime/2026-03-26-pandamart-live-team.md` with exactly six bullets:

- `Architecture review:` followed by one concrete sentence from the Tech Lead report
- `Delivery slicing:` followed by one concrete sentence from the Planner report
- `Frontend readiness:` followed by one concrete sentence from the Frontend report
- `Backend readiness:` followed by one concrete sentence from the Backend report
- `Data / integration readiness:` followed by one concrete sentence from the Data / Integration report
- `QA readiness:` followed by one concrete sentence from the QA report

Do not save placeholders or bracketed notes in the final file.

- [ ] **Step 2: Update the runtime charter with the live status**

Run: `Get-Content -Raw docs\superpowers\runtime\2026-03-26-pandamart-live-team.md`
Expected: charter includes an added readiness summary section backed by actual bootstrap outputs, not placeholders

- [ ] **Step 3: Confirm live team readiness**

Expected: the manager can name the active roles, owned scopes, escalation path, and the first mission-routing decision for PandaMart without re-reading the spec

### Task 5: Verification And Handoff

**Files:**
- Reference: `docs/superpowers/specs/2026-03-26-development-team-operating-model-design.md`
- Reference: `docs/superpowers/plans/2026-03-26-pandamart-live-team-activation.md`
- Reference: `docs/superpowers/runtime/2026-03-26-pandamart-live-team.md`

- [ ] **Step 1: Review the plan against the spec**

Check that the plan covers:

- reusable live-team activation for PandaMart
- runtime charter persistence under `docs/superpowers/runtime/`
- leadership and specialist activation
- bootstrap synthesis and readiness confirmation

Expected: every part of the approved design needed for PandaMart activation maps to a concrete task in this plan

- [ ] **Step 2: Scan the plan for placeholders or vague language**

Run: `$patterns = @('T'+'BD', 'TO'+'DO', 'implement'+' later', 'fill'+' in details', 'appropriate'+' error handling', 'Write tests'+' for the above', 'Similar'+' to Task'); Select-String -Path 'docs\\superpowers\\plans\\2026-03-26-pandamart-live-team-activation.md' -Pattern $patterns`
Expected: no matches

- [ ] **Step 3: Note the git constraint in the execution handoff**

```text
Execution note:
The working directory E:\Project\PandaMartPMS is not a Git repository. Save docs normally, but skip commit steps unless the actual repository root is provided later.
```
