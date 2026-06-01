# Unified Projects Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show Demand, Delivery, and Personal projects on one color-coded Projects board with time-priority columns.

**Architecture:** Keep existing project task status values to avoid a migration, but relabel and reorder them as Today, Next, Later, Waiting, Done. When `/projects` has no area/project filter, load all active projects and all their active tasks; each task node carries lightweight project metadata for card badges.

**Tech Stack:** Next.js app router, Supabase repository helpers, React client board, Expo mobile project screen, Vitest, Playwright smoke.

---

### Task 1: Status Labels And Repository Shape

**Files:**
- Modify: `lib/projects/status.ts`
- Modify: `lib/projects/types.ts`
- Modify: `lib/projects/repository.ts`
- Test: `tests/projects-web-actions.test.ts`
- Test: `tests/project-repository.test.ts`

- [x] Write failing tests proving project statuses label as Today/Next/Later and all-area board loading returns tasks from multiple project areas with project metadata.
- [x] Run `npm test -- tests/projects-web-actions.test.ts tests/project-repository.test.ts` and confirm the new tests fail.
- [x] Update status order/labels without changing stored status values.
- [x] Extend `ProjectTaskNode` with `project` metadata and load all project tasks when no active project is selected.
- [x] Run targeted tests and confirm they pass.

### Task 2: Unified Web Projects Board

**Files:**
- Modify: `app/projects/page.tsx`
- Modify: `app/projects/projects-board-client.tsx`
- Modify: `.opencode-smoke/projects-web-smoke.spec.ts`

- [x] Make `/projects` default to All areas.
- [x] Add All/Demand/Delivery/Personal filters with color-coded area badges.
- [x] Show all project tasks by default, grouped into Today/Next/Later/Waiting/Done.
- [x] Preserve project-focused task creation by selecting a project chip before adding tasks.
- [x] Update smoke to verify all-area visibility and project area badges.

### Task 3: Mobile Alignment

**Files:**
- Modify: `app/api/mobile/projects/route.ts`
- Modify: `mobile/app/(tabs)/projects.tsx`
- Modify: `mobile/lib/projects-api.ts`
- Modify: `mobile/components/ProjectTaskRow.tsx`

- [x] Allow mobile project board fetches without an area filter.
- [x] Default mobile Projects to All and relabel status tabs as Today/Next/Later/Waiting/Done.
- [x] Keep project selection chips for narrowing and adding new tasks.
- [x] Run mobile typecheck.

### Task 4: Verification And Release

**Files:**
- Modify: `README_FIRST.md`
- Modify: `progress.md`
- Modify: `HANDOFF.md`

- [x] Run `npm test`.
- [x] Run `npx tsc --noEmit --incremental false`.
- [x] Run `npm --prefix mobile run typecheck`.
- [x] Run `npm run lint`.
- [x] Run `npm run build`.
- [x] Commit, push, deploy web/mobile, run production Projects smoke, and update handoff docs.
