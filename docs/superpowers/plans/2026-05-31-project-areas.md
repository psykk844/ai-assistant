# Project Areas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add fixed Demand, Delivery, and Personal buckets to Projects without changing task behavior.

**Architecture:** Store a project-level `area` enum-like text value and filter project lists by area on web and mobile. Existing projects default to `demand`; tasks, subtasks, checklists, and statuses remain unchanged.

**Tech Stack:** Next.js server actions, Supabase/Postgres migration, React web UI, Expo React Native mobile UI, Vitest, Playwright smoke.

---

### Task 1: Domain and Migration

**Files:**
- Create: `supabase/migrations/20260531_project_areas.sql`
- Modify: `lib/projects/types.ts`
- Modify: `lib/projects/status.ts` or new small area helper if clearer.
- Test: `tests/project-migration.test.ts`
- Test: `tests/project-repository.test.ts`

- [ ] Write failing tests for project area validation, defaulting, area-specific ordering, and migration SQL.
- [ ] Add project area constants/helpers.
- [ ] Add migration to add `projects.area text not null default 'demand'` with check constraint and area-aware indexes.
- [ ] Update project type/repository column selection.

### Task 2: Web Projects UI

**Files:**
- Modify: `app/projects/page.tsx`
- Modify: `app/projects/actions.ts`
- Modify: `app/projects/projects-board-client.tsx`
- Test: `tests/projects-web-actions.test.ts`
- Smoke: `.opencode-smoke/projects-web-smoke.spec.ts`

- [ ] Write failing tests for action parsing/defaulting.
- [ ] Read `area` from search params and pass to repository.
- [ ] Add Demand/Delivery/Personal tabs and preserve selected area in project links/forms.
- [ ] Create projects in the current selected area and redirect to `/projects?area=...&project=...`.

### Task 3: Mobile API and UI

**Files:**
- Modify: `app/api/mobile/projects/route.ts`
- Modify: `app/api/mobile/projects/[projectId]/board/route.ts` if needed.
- Modify: `mobile/lib/projects-types.ts`
- Modify: `mobile/lib/projects-api.ts`
- Modify: `mobile/app/(tabs)/projects.tsx`
- Test: `tests/project-mobile-routes.test.ts`
- Test: `tests/project-mobile-contracts.test.ts`

- [ ] Write failing tests for area-filtered mobile payloads and mock board area filtering.
- [ ] Add area query support to mobile API/client.
- [ ] Add mobile area switcher and reload project board by selected area.

### Task 4: Verification and Release

- [ ] Run focused tests red/green, then full `npm test`.
- [ ] Run TypeScript, lint, build, and mobile typecheck.
- [ ] Run local Projects browser smoke.
- [ ] Apply production migration, reload PostgREST schema cache, deploy backend/mobile, and run production smoke.
