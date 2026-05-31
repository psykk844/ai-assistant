# Project Archive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let one user archive and restore whole projects without deleting project tasks, subtasks, or checklists.

**Architecture:** Reuse `projects.archived_at` as the source of truth. Normal project boards list only active projects; archived mode lists archived projects in the selected area and allows restore.

**Tech Stack:** Next.js server actions, Supabase repository helpers, Expo mobile UI/API, Vitest, Playwright smoke.

---

### Task 1: Repository and Actions

**Files:**
- Modify: `lib/projects/repository.ts`
- Modify: `app/projects/actions.ts`
- Test: `tests/project-repository.test.ts`
- Test: `tests/projects-web-actions.test.ts`

- [ ] Write failing tests for listing archived projects and setting/restoring `archived_at`.
- [ ] Add repository options for active vs archived project lists.
- [ ] Add archive/restore project helpers and form parsing.

### Task 2: Web UI

**Files:**
- Modify: `app/projects/page.tsx`
- Modify: `app/projects/projects-board-client.tsx`
- Smoke: `.opencode-smoke/projects-web-smoke.spec.ts`

- [ ] Add `archived=1` route mode per area.
- [ ] Add Archive button to active project header.
- [ ] Add Archived view in the sidebar with Restore buttons.
- [ ] Preserve Demand/Delivery/Personal selection in all links.

### Task 3: Mobile API and UI

**Files:**
- Modify: `app/api/mobile/projects/route.ts`
- Modify: `mobile/lib/projects-api.ts`
- Modify: `mobile/lib/projects-types.ts`
- Modify: `mobile/app/(tabs)/projects.tsx`
- Test: `tests/project-mobile-routes.test.ts`
- Test: `tests/project-mobile-contracts.test.ts`

- [ ] Add mobile API support for archived mode and archive/restore project updates.
- [ ] Add mobile Archived toggle and Archive/Restore button.
- [ ] Keep normal mobile project list active-only by default.

### Task 4: Verification and Release

- [ ] Run focused archive tests.
- [ ] Run full tests, typecheck, lint, build, mobile typecheck.
- [ ] Run local and production Projects browser smoke.
- [ ] Push/deploy backend/web and mobile; update handoff docs.
