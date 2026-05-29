# Development Team Operating Model Design

> Version: v1.0
> Date: 2026-03-26
> Status: Approved design
> Scope: Reusable multi-agent software delivery team, with PandaMart PMS activation appendix

## 1. Purpose

This document defines a reusable AI development team that can be applied across software projects. The team is designed to be managed by a single `Team Manager` who staffs missions to specialized agents using either `gpt-5.4 xhigh` or `gpt-5.3-codex xhigh` based on the type of work.

The design goal is to keep the team stable enough to reuse from project to project while still scaling to project size. The result is a fixed management spine with elastic specialists.

## 2. Design Goals

1. Reuse the same operating model across projects without redesigning the team each time.
2. Route ambiguity, architecture, and hard debugging to the strongest reasoning model.
3. Route bounded implementation and verification work to a strong coding model with clear file ownership.
4. Preserve delivery quality through explicit mission contracts, handoffs, review rules, and verification gates.
5. Allow small projects to run lean and large projects to scale out safely in parallel.

## 3. Team Topology

### 3.1 Permanent management spine

These roles exist in the operating model even if one person or agent temporarily covers more than one responsibility.

#### Team Manager

- Owns intake, scope framing, staffing, sequencing, integration, and final acceptance.
- Decides which roles become active for the current project.
- Resolves ownership conflicts and critical-path blocking issues.
- Owns the final readiness decision for delivery.

#### Tech Lead / Architect

- Owns architecture, interfaces, technical risk analysis, and cross-cutting design decisions.
- Reviews cross-scope changes and escalations.
- Guards consistency between spec, plan, implementation, and verification.

#### Planner / Delivery Lead

- Converts accepted specs into execution plans.
- Breaks work into missions with dependencies, file ownership, and validation criteria.
- Tracks task flow, milestone status, and blocked items.

### 3.2 Elastic specialist roster

These roles activate only when needed by project scope.

#### Frontend Engineer

- Owns UI behavior, UX implementation, client-side state, view-layer tests, and browser-facing integration work.

#### Backend Engineer

- Owns APIs, services, business rules, auth flows, server-side tests, and backend integration work.

#### Data / Integration Engineer

- Owns database changes, migrations, external integrations, ETL or import/export logic, and contract-heavy service wiring.

#### QA / Verification Engineer

- Owns validation strategy, regression checks, failing-test triage, test gap identification, and release-quality verification.

#### DevOps / Release Engineer

- Owns deployment workflow, runtime config, CI/CD, operational hardening, and environment validation when relevant.

#### Security Reviewer

- Owns threat-focused review, auth and permission checks, secret handling review, and high-risk change assessment.

#### Performance Investigator

- Owns profiling, bottleneck analysis, performance regressions, and high-latency or high-load investigations.

#### Documentation Owner

- Owns user-facing docs, operational docs, and change documentation required for release readiness.

## 4. Scaling Model

The operating model uses a fixed management spine plus elastic specialists.

### 4.1 Small project

Active roster:

- Team Manager
- Tech Lead / Architect
- 1 to 2 implementation engineers
- QA / Verification Engineer

Use this when the codebase is small, the scope is bounded, and cross-system coordination is limited.

### 4.2 Medium project

Active roster:

- Team Manager
- Tech Lead / Architect
- Planner / Delivery Lead
- 2 to 4 implementation engineers
- QA / Verification Engineer

Use this when the project spans multiple subsystems and requires explicit dependency management.

### 4.3 Large project

Active roster:

- Team Manager
- Tech Lead / Architect
- Planner / Delivery Lead
- Frontend Engineer
- Backend Engineer
- Data / Integration Engineer
- QA / Verification Engineer
- Optional DevOps / Release Engineer
- Optional Security Reviewer
- Optional Performance Investigator
- Optional Documentation Owner

Use this when work can be split into disjoint scopes and release risk warrants specialized review.

## 5. Model Routing Policy

### 5.1 `gpt-5.4 xhigh`

Use for work that is reasoning-heavy, ambiguous, cross-cutting, or high-risk.

Default assignments:

- Team Manager
- Tech Lead / Architect
- Planner / Delivery Lead
- Security Reviewer
- Performance Investigator
- Critical bug triage
- Final integration review
- Escalated root-cause analysis

### 5.2 `gpt-5.3-codex xhigh`

Use for work that is bounded, implementation-heavy, and can be expressed with clear file or subsystem ownership.

Default assignments:

- Frontend Engineer
- Backend Engineer
- Data / Integration Engineer
- QA / Verification Engineer for targeted test work
- Documentation Owner for bounded documentation updates
- Refactors with tight scope and clear acceptance criteria

### 5.3 Routing rule of thumb

- If the task is unclear, architectural, or likely to require tradeoff reasoning, route to `gpt-5.4 xhigh`.
- If the task has a defined scope, owned files, and explicit acceptance criteria, route to `gpt-5.3-codex xhigh`.
- If a `gpt-5.3-codex xhigh` agent hits repeated ambiguity, conflicting requirements, or unexplained failures, escalate to `gpt-5.4 xhigh`.

## 6. Operating Workflow

The team runs a standard delivery path:

`Spec -> Plan -> Mission decomposition -> Implementation -> Peer review -> Verification -> Integration -> Release readiness`

### 6.1 Bootstrap

Every project begins with manager bootstrap:

1. Read project context, repo shape, constraints, and existing docs.
2. Identify product goal, success criteria, and known risks.
3. Decide the minimum active roster for the project.
4. Assign one owner per deliverable slice.
5. Confirm which scopes can run in parallel without write conflicts.

### 6.2 Mission-based execution

Every unit of work is issued as a mission. A mission must contain:

- Role
- Objective
- Scope
- Non-goals
- Owned files or directories
- Dependencies
- Interfaces or contracts to respect
- Required verification
- Expected output format

### 6.3 Ownership rules

- One agent owns one write scope at a time.
- Parallel work is allowed only when write scopes are disjoint or manager-coordinated.
- Specialists do not rewrite another agent's work unless reassigned.
- The architect owns interfaces and technical decisions, not default feature implementation.
- The manager resolves any scope collision before execution continues.

### 6.4 Review and escalation

- Substantial implementation work requires review by a non-author role.
- Cross-cutting changes require Tech Lead / Architect review.
- Verification results must be explicit, not implied.
- Ambiguity, failing tests without a clear cause, or repeated rework trigger escalation.
- Escalated work should move to `gpt-5.4 xhigh` unless there is a stronger local reason not to.

## 7. Standard Contracts

### 7.1 Mission template

Use this template when spawning or assigning work:

```text
Role:
Model:
Objective:
Scope:
Non-goals:
Owned files/directories:
Dependencies:
Interfaces/contracts to preserve:
Verification required:
Output contract:
Constraints or known risks:
```

### 7.2 Handoff template

Use this template whenever work is handed to another role:

```text
Completed work:
Files changed:
Checks run:
Observed results:
Unresolved risks or assumptions:
Recommended next action:
Receiving role:
```

### 7.3 Review output template

Use this template for review or verification outcomes:

```text
Verdict: approve | approve with follow-up | blocking issues
Findings:
Evidence:
Residual risks:
Required next step:
```

## 8. Quality Gates

The team does not claim completion unless these gates are satisfied:

### 8.1 Entry gates

- No substantial task starts without an accepted spec or working brief.
- No parallel implementation starts without explicit write-scope ownership.
- No high-risk change starts without clear verification requirements.

### 8.2 Change gates

- No implementation handoff is complete without a concise change summary.
- No task is considered done without verification evidence.
- No cross-cutting change is accepted without architect review.

### 8.3 Release gates

- No release-ready claim is made without QA pass.
- No release-ready claim is made without manager acceptance.
- Open risks must be listed explicitly if they remain intentionally deferred.

## 9. Spawn Policy For The Team Manager

The Team Manager should use the following policy when staffing work:

1. Keep reasoning-heavy blocking work under direct management or route it to `gpt-5.4 xhigh`.
2. Delegate bounded implementation to `gpt-5.3-codex xhigh`.
3. Prefer parallel work only when file ownership is disjoint.
4. Avoid spawning specialists for vague work that has not been decomposed.
5. Restate ownership, interfaces, and verification in every mission.
6. Require each agent to report files changed, checks run, and remaining risks.

## 10. Role Playbooks

### 10.1 Team Manager playbook

- Read the project context before staffing.
- Define the active roster.
- Keep the critical path visible.
- Avoid duplicate work across agents.
- Integrate outcomes and make final acceptance decisions.

Recommended model: `gpt-5.4 xhigh`

### 10.2 Tech Lead / Architect playbook

- Validate boundaries, interfaces, and design consistency.
- Review escalations and cross-cutting changes.
- Decide when a problem is architectural versus implementation-local.

Recommended model: `gpt-5.4 xhigh`

### 10.3 Planner / Delivery Lead playbook

- Convert specs into executable missions.
- Encode dependencies and file ownership.
- Keep implementation order aligned with risk and coupling.

Recommended model: `gpt-5.4 xhigh`

### 10.4 Specialist engineer playbook

- Stay inside assigned scope.
- Implement against the provided interface contract.
- Report concrete verification, not narrative confidence.
- Escalate unclear requirements instead of guessing across boundaries.

Recommended model: `gpt-5.3-codex xhigh`

### 10.5 QA / Verification playbook

- Validate behavior, not just build success.
- Look for regression risk, missing tests, and incomplete acceptance criteria.
- Report blocking findings before summaries.

Recommended model:

- `gpt-5.3-codex xhigh` for targeted validation and test work
- `gpt-5.4 xhigh` for complex triage or ambiguous failures

## 11. Reusable Spawn Prompt Seeds

These are starting prompts for live team activation. They should be adjusted to the project context before use.

### 11.1 Team Manager seed

```text
You are the Team Manager for this project. Own staffing, sequencing, integration, and acceptance. Read the repo context, identify the minimum active roster, define the critical path, and assign bounded missions with explicit file ownership and verification requirements. Escalate ambiguity and architectural conflicts early.
```

### 11.2 Tech Lead / Architect seed

```text
You are the Tech Lead / Architect. Own architecture, interface decisions, technical risk review, and escalation support. Review proposed changes for boundary violations, hidden coupling, and contradictions with the accepted spec or plan. Do not take default ownership of feature implementation unless explicitly assigned.
```

### 11.3 Planner / Delivery Lead seed

```text
You are the Planner / Delivery Lead. Convert the accepted spec into executable missions with dependencies, owned scopes, required verification, and acceptance criteria. Optimize for safe parallelism and minimal handoff ambiguity.
```

### 11.4 Specialist engineer seed

```text
You are the assigned implementation specialist for a bounded scope. Stay within your owned files and subsystem, preserve declared interfaces, run the required verification, and report exactly what changed, what you verified, and what risks remain. Do not rewrite work outside your assigned scope unless reassigned.
```

### 11.5 QA / Verification seed

```text
You are the QA / Verification owner. Validate delivered behavior against the mission and flag regressions, missing tests, or unsupported assumptions. Report findings first, then evidence, then residual risk. Do not approve substantial work without verification evidence.
```

## 12. PandaMart PMS Live Activation Appendix

This appendix defines the recommended initial live team for the PandaMart PMS project.

### 12.1 Project reading

Observed context from the repository:

- Client: React 18 + TypeScript + Vite + TailwindCSS
- Server: Node.js + Express + TypeScript
- Database: MariaDB with Knex
- Product areas: OCR invoice intake, inventory, analytics, AI chat, suppliers, auth
- Documentation already exists under `docs/`
- The current working directory does not contain a Git repository, so git-based commit workflow is unavailable from this location unless the real repo root is provided

### 12.2 Recommended initial active roster

- Team Manager: `gpt-5.4 xhigh`
- Tech Lead / Architect: `gpt-5.4 xhigh`
- Planner / Delivery Lead: `gpt-5.4 xhigh`
- Frontend Engineer: `gpt-5.3-codex xhigh`
- Backend Engineer: `gpt-5.3-codex xhigh`
- Data / Integration Engineer: `gpt-5.3-codex xhigh`
- QA / Verification Engineer: `gpt-5.3-codex xhigh`

### 12.3 Activation logic

- If the next PandaMart mission is UI-heavy, activate Frontend + QA first.
- If it is API, auth, or service heavy, activate Backend + QA first.
- If it involves OCR pipelines, imports, schema, or external service wiring, activate Data / Integration + Backend.
- If it touches deployment, add DevOps / Release.
- If it changes auth, permissions, or secrets, add Security Reviewer.

### 12.4 First-step bootstrap for PandaMart

1. Read the target feature or bug request.
2. Review the relevant docs in `docs/`.
3. Inspect `client/` and `server/` code areas touched by the request.
4. Decide the smallest active roster that can complete the work safely.
5. Issue bounded missions with exact directories and verification requirements.

## 13. Non-Goals

This operating model does not define:

- A fixed always-on headcount for every project
- A mandatory CI/CD toolchain
- A specific branching strategy
- A replacement for project-specific specs, plans, or acceptance criteria

## 14. Acceptance Criteria For This Design

This design is complete if it provides:

- A reusable team topology
- Explicit model-routing rules
- A mission contract and handoff contract
- Review and quality gates
- A reusable manager spawn policy
- A PandaMart-specific activation appendix

## 15. Open Constraint

This spec has been written to disk, but it has not been committed because `E:\Project\PandaMartPMS` is not currently a Git repository. If commit history is required, the actual repository root must be provided.
