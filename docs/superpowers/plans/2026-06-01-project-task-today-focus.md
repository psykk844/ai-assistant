# Project Task Today Focus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let project tasks/subtasks appear in the existing Today/Top 5 focus list without duplicating them into inbox todos; completing from Today marks the original project task/subtask `done`.

**Architecture:** Add a small `project_task_focus` table that links a project task to My Day focus. Web and mobile My Day load normal inbox items plus focused project tasks and render them as a separate card type. Completion updates `project_tasks.status = 'done'` and removes the focus row.

**Tech Stack:** Next.js server actions/routes, Supabase/Postgres migrations, existing project repository helpers, React web client, Expo mobile client, Vitest/Playwright.

---

### Task 1: Domain and Schema

**Files:**
- Create: `supabase/migrations/20260601_project_task_focus.sql`
- Modify: `lib/projects/types.ts`
- Modify: `lib/projects/repository.ts`
- Test: `tests/project-focus.test.ts`

- [ ] Write failing repository tests for adding focus, listing focused project tasks with project context, removing focus, and completing a focused task.
- [ ] Add migration with `project_task_focus(user_id, project_task_id, lane, my_day_order, created_at, updated_at)`, `UNIQUE(user_id, project_task_id)`, FK to `project_tasks(id,user_id)`, RLS by `user_id`, and indexes by user/lane/order.
- [ ] Implement repository helpers:
  - `addProjectTaskFocus(userId, taskId)`
  - `removeProjectTaskFocus(userId, taskId)`
  - `listFocusedProjectTasks(userId)`
  - `completeFocusedProjectTask(userId, taskId)`
- [ ] Run targeted tests and confirm red then green.

### Task 2: Web Project Detail Controls

**Files:**
- Modify: `app/projects/server-actions.ts`
- Modify: `app/projects/actions.ts`
- Modify: `app/projects/task-detail-drawer.tsx`
- Test: `tests/projects-web-actions.test.ts`

- [ ] Add failing action/form tests for project task focus form parsing.
- [ ] Add server actions for `addProjectTaskFocusAction` and `removeProjectTaskFocusAction`.
- [ ] Add `Add to Today` button for the open project task and for each displayed subtask.
- [ ] Revalidate `/projects`, `/app/my-day`, and `/widget`.

### Task 3: Web My Day Rendering

**Files:**
- Modify: `app/app/my-day/page.tsx`
- Modify: `app/app/my-day/my-day-client.tsx`
- Test: `tests/project-focus.test.ts`

- [ ] Load focused project tasks on the server alongside normal active inbox items.
- [ ] Render focused project tasks in the Top 5 section with project/area context and a project-task marker.
- [ ] Add `Complete` action that marks the original project task/subtask `done`.
- [ ] Add `Remove from Today` action that removes only the focus row.

### Task 4: Mobile Home and Projects

**Files:**
- Modify: `app/api/mobile/home/route.ts`
- Modify: `app/api/mobile/projects/[projectId]/tasks/[taskId]/route.ts`
- Modify: `mobile/lib/types.ts`
- Modify: `mobile/lib/api.ts`
- Modify: `mobile/app/(tabs)/home.tsx`
- Modify: `mobile/app/project-task/[id].tsx`
- Test: `tests/mobile-contracts.test.ts`
- Test: `tests/project-mobile-routes.test.ts`

- [ ] Extend mobile home payload with focused project cards.
- [ ] Add mobile API support to focus/unfocus/complete focused project tasks.
- [ ] Show focused project tasks in mobile Today and complete them from Home.
- [ ] Add `Add to Today` in mobile project task detail.

### Task 5: Verification and Release

**Files:**
- Modify: `.opencode-smoke/projects-web-smoke.spec.ts`
- Modify: `README_FIRST.md`
- Modify: `HANDOFF.md`
- Modify: `progress.md`

- [ ] Extend project smoke to add a project task to Today, complete it from My Day, and verify it is done in the project.
- [ ] Run `npm test`, `npx tsc --noEmit --incremental false`, `npm --prefix mobile run typecheck`, `npm run lint`, `npm run build`, and local smoke.
- [ ] Apply the Supabase migration in production, push to `main`, deploy backend/mobile in Coolify, and run production smoke.
- [ ] Update handoff docs with commit, deploy IDs, migration, and verification evidence.
