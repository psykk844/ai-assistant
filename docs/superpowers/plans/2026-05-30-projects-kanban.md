# Projects Kanban Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a separate, fast Projects tab for Trello-like project boards on web and mobile, with one-level subtasks and checklists.

**Architecture:** Add a dedicated Projects module with separate Supabase tables and domain helpers so project tasks never pass through the existing random inbox, My Day, link-processing, AI-classification, or Obsidian flows. Web uses the existing Next app, server actions, and `@dnd-kit`; mobile uses the existing Expo tabs plus `/api/mobile/projects` routes.

**Tech Stack:** Next.js 14 app router, React 18, TypeScript, Supabase admin client, Vitest, Expo Router, React Native, `@dnd-kit/core`, `@dnd-kit/sortable`.

---

## Spec

Approved design: `docs/superpowers/specs/2026-05-30-projects-kanban-design.md`

Core v1 decisions:

- Separate `projects`, `project_tasks`, and `project_checklist_items` data.
- Project tasks do not appear in Home, My Day, current Backlog, link archiving, AI classification, or Obsidian mirroring.
- Fixed statuses: `backlog`, `todo`, `doing`, `waiting`, `done`.
- One nesting level: top-level tasks can have subtasks; subtasks do not have subtasks.
- Tasks and subtasks can both have checklist items.
- Web supports drag/drop status and ordering.
- Mobile uses project picker, status tabs, compact rows, status picker, and move up/down controls.
- Parent completion remains manual.

## File Structure

Create:

- `supabase/migrations/20260530_project_kanban.sql`
  - Defines project tables, indexes, RLS policies, and status/depth checks.
- `lib/projects/types.ts`
  - Shared project domain types used by web server code, API routes, and tests.
- `lib/projects/status.ts`
  - Fixed status constants, labels, validation, and sort helpers.
- `lib/projects/progress.ts`
  - Checklist/subtask progress calculations and board grouping helpers.
- `lib/projects/repository.ts`
  - Supabase read/write helpers for projects, tasks, subtasks, checklists, labels, status, and ordering.
- `app/projects/page.tsx`
  - Server-rendered Projects page and initial board load.
- `app/projects/actions.ts`
  - Server actions for web create/update/reorder/archive operations.
- `app/projects/projects-board-client.tsx`
  - Web client board shell, project sidebar, status columns, search, optimistic drag/drop.
- `app/projects/task-detail-drawer.tsx`
  - Web task detail drawer for title, description, labels, due date, subtasks, and checklist items.
- `app/api/mobile/projects/route.ts`
  - Mobile projects list and create route.
- `app/api/mobile/projects/[projectId]/board/route.ts`
  - Mobile board payload route.
- `app/api/mobile/projects/[projectId]/tasks/route.ts`
  - Mobile task create route.
- `app/api/mobile/projects/[projectId]/tasks/[taskId]/route.ts`
  - Mobile task detail/update route.
- `app/api/mobile/projects/[projectId]/tasks/[taskId]/checklist/route.ts`
  - Mobile checklist create/update route.
- `mobile/app/(tabs)/projects.tsx`
  - Mobile Projects tab.
- `mobile/app/project-task/[id].tsx`
  - Mobile project task detail screen.
- `mobile/components/ProjectTaskRow.tsx`
  - Compact mobile task row.
- `mobile/lib/projects-api.ts`
  - Mobile Projects API client and mock mode.
- `mobile/lib/projects-types.ts`
  - Mobile project payload types.
- `tests/project-status.test.ts`
- `tests/project-progress.test.ts`
- `tests/project-repository.test.ts`
- `tests/project-mobile-contracts.test.ts`
- `tests/project-mobile-routes.test.ts`
- `tests/projects-web-actions.test.ts`

Modify:

- `app/app/board-client.tsx`
  - Add a navigation link to `/projects`; do not load project data here.
- `mobile/app/_layout.tsx`
  - Add the `Projects` tab and hide `project-task/[id]` from tab bar.
- `app/api/mobile/_shared.ts`
  - Add `DELETE` to CORS allow methods only if archive/delete routes use DELETE; otherwise leave as-is.
- `README_FIRST.md`, `progress.md`, `HANDOFF.md`
  - Update after implementation/deployment milestones only.

---

## Task 1: Domain Types, Statuses, And Progress Helpers

**Files:**

- Create: `lib/projects/types.ts`
- Create: `lib/projects/status.ts`
- Create: `lib/projects/progress.ts`
- Test: `tests/project-status.test.ts`
- Test: `tests/project-progress.test.ts`

- [ ] **Step 1: Write failing status tests**

Create `tests/project-status.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { PROJECT_STATUS_ORDER, isProjectTaskStatus, statusLabel, compareProjectTaskPositions } from "../lib/projects/status";

describe("project task statuses", () => {
  it("uses the fixed v1 status order", () => {
    expect(PROJECT_STATUS_ORDER).toEqual(["backlog", "todo", "doing", "waiting", "done"]);
  });

  it("validates status strings", () => {
    expect(isProjectTaskStatus("backlog")).toBe(true);
    expect(isProjectTaskStatus("doing")).toBe(true);
    expect(isProjectTaskStatus("today")).toBe(false);
    expect(isProjectTaskStatus("completed")).toBe(false);
  });

  it("returns user-facing labels", () => {
    expect(statusLabel("backlog")).toBe("Backlog");
    expect(statusLabel("todo")).toBe("To Do");
    expect(statusLabel("doing")).toBe("Doing");
    expect(statusLabel("waiting")).toBe("Waiting");
    expect(statusLabel("done")).toBe("Done");
  });

  it("sorts tasks by position then created time", () => {
    const sorted = [
      { id: "b", position: 20, created_at: "2026-05-01T00:00:00Z" },
      { id: "a", position: 10, created_at: "2026-05-02T00:00:00Z" },
      { id: "c", position: 10, created_at: "2026-05-01T00:00:00Z" },
    ].sort(compareProjectTaskPositions);

    expect(sorted.map((task) => task.id)).toEqual(["c", "a", "b"]);
  });
});
```

- [ ] **Step 2: Run status test to verify it fails**

Run:

```powershell
npm test -- tests/project-status.test.ts
```

Expected: FAIL because `lib/projects/status.ts` does not exist.

- [ ] **Step 3: Implement project types and status helpers**

Create `lib/projects/types.ts`:

```ts
import type { ProjectTaskStatus } from "./status";

export type ProjectLabel = {
  name: string;
  color: string;
};

export type Project = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  position: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectChecklistItem = {
  id: string;
  task_id: string;
  title: string;
  completed: boolean;
  position: number;
  created_at: string;
  updated_at: string;
};

export type ProjectTask = {
  id: string;
  project_id: string;
  parent_task_id: string | null;
  title: string;
  description: string | null;
  status: ProjectTaskStatus;
  position: number;
  due_date: string | null;
  labels: ProjectLabel[];
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectTaskNode = ProjectTask & {
  checklist: ProjectChecklistItem[];
  subtasks: Array<ProjectTask & { checklist: ProjectChecklistItem[] }>;
};

export type ProjectBoard = {
  projects: Project[];
  activeProject: Project | null;
  tasks: ProjectTaskNode[];
};
```

Create `lib/projects/status.ts`:

```ts
export const PROJECT_STATUS_ORDER = ["backlog", "todo", "doing", "waiting", "done"] as const;

export type ProjectTaskStatus = (typeof PROJECT_STATUS_ORDER)[number];

export function isProjectTaskStatus(value: unknown): value is ProjectTaskStatus {
  return typeof value === "string" && PROJECT_STATUS_ORDER.includes(value as ProjectTaskStatus);
}

export function statusLabel(status: ProjectTaskStatus) {
  const labels: Record<ProjectTaskStatus, string> = {
    backlog: "Backlog",
    todo: "To Do",
    doing: "Doing",
    waiting: "Waiting",
    done: "Done",
  };
  return labels[status];
}

export function compareProjectTaskPositions(
  a: { position: number; created_at: string },
  b: { position: number; created_at: string },
) {
  if (a.position !== b.position) return a.position - b.position;
  return a.created_at.localeCompare(b.created_at);
}
```

- [ ] **Step 4: Run status test to verify it passes**

Run:

```powershell
npm test -- tests/project-status.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write failing progress tests**

Create `tests/project-progress.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { ProjectTaskNode } from "../lib/projects/types";
import { checklistProgress, groupTopLevelTasksByStatus, subtaskProgress } from "../lib/projects/progress";

function task(overrides: Partial<ProjectTaskNode>): ProjectTaskNode {
  return {
    id: "task-1",
    project_id: "project-1",
    parent_task_id: null,
    title: "Task",
    description: null,
    status: "todo",
    position: 10,
    due_date: null,
    labels: [],
    archived_at: null,
    created_at: "2026-05-30T00:00:00Z",
    updated_at: "2026-05-30T00:00:00Z",
    checklist: [],
    subtasks: [],
    ...overrides,
  };
}

describe("project progress helpers", () => {
  it("counts completed checklist items", () => {
    expect(
      checklistProgress([
        { id: "a", task_id: "task-1", title: "A", completed: true, position: 10, created_at: "2026-05-30T00:00:00Z", updated_at: "2026-05-30T00:00:00Z" },
        { id: "b", task_id: "task-1", title: "B", completed: false, position: 20, created_at: "2026-05-30T00:00:00Z", updated_at: "2026-05-30T00:00:00Z" },
      ]),
    ).toEqual({ completed: 1, total: 2 });
  });

  it("counts done subtasks without auto-completing parent tasks", () => {
    const node = task({
      status: "doing",
      subtasks: [
        { ...task({ id: "sub-1", parent_task_id: "task-1", status: "done" }), checklist: [] },
        { ...task({ id: "sub-2", parent_task_id: "task-1", status: "todo" }), checklist: [] },
      ],
    });

    expect(subtaskProgress(node)).toEqual({ completed: 1, total: 2 });
    expect(node.status).toBe("doing");
  });

  it("groups only top-level active tasks into fixed status buckets", () => {
    const grouped = groupTopLevelTasksByStatus([
      task({ id: "a", status: "todo", position: 20 }),
      task({ id: "b", status: "todo", position: 10 }),
      task({ id: "c", status: "done" }),
      task({ id: "sub", parent_task_id: "a", status: "todo" }),
      task({ id: "archived", status: "doing", archived_at: "2026-05-30T00:00:00Z" }),
    ]);

    expect(grouped.todo.map((item) => item.id)).toEqual(["b", "a"]);
    expect(grouped.done.map((item) => item.id)).toEqual(["c"]);
    expect(grouped.doing).toEqual([]);
  });
});
```

- [ ] **Step 6: Run progress test to verify it fails**

Run:

```powershell
npm test -- tests/project-progress.test.ts
```

Expected: FAIL because `lib/projects/progress.ts` does not exist.

- [ ] **Step 7: Implement progress helpers**

Create `lib/projects/progress.ts`:

```ts
import type { ProjectChecklistItem, ProjectTaskNode } from "./types";
import { PROJECT_STATUS_ORDER, type ProjectTaskStatus, compareProjectTaskPositions } from "./status";

export type ProgressCount = { completed: number; total: number };

export function checklistProgress(items: ProjectChecklistItem[]): ProgressCount {
  return {
    completed: items.filter((item) => item.completed).length,
    total: items.length,
  };
}

export function subtaskProgress(task: ProjectTaskNode): ProgressCount {
  return {
    completed: task.subtasks.filter((subtask) => subtask.status === "done").length,
    total: task.subtasks.length,
  };
}

export function groupTopLevelTasksByStatus(tasks: ProjectTaskNode[]) {
  const grouped = Object.fromEntries(PROJECT_STATUS_ORDER.map((status) => [status, []])) as Record<ProjectTaskStatus, ProjectTaskNode[]>;

  for (const task of tasks) {
    if (task.parent_task_id) continue;
    if (task.archived_at) continue;
    grouped[task.status].push(task);
  }

  for (const status of PROJECT_STATUS_ORDER) {
    grouped[status].sort(compareProjectTaskPositions);
  }

  return grouped;
}
```

- [ ] **Step 8: Run domain tests**

Run:

```powershell
npm test -- tests/project-status.test.ts tests/project-progress.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit domain helpers**

Run:

```powershell
git add lib/projects/types.ts lib/projects/status.ts lib/projects/progress.ts tests/project-status.test.ts tests/project-progress.test.ts
git commit -m "feat: add project board domain helpers"
```

---

## Task 2: Supabase Migration

**Files:**

- Create: `supabase/migrations/20260530_project_kanban.sql`
- Test: `tests/project-migration.test.ts`

- [ ] **Step 1: Write failing migration structure test**

Create `tests/project-migration.test.ts`:

```ts
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("project kanban migration", () => {
  it("creates separate project tables and does not alter inbox items", async () => {
    const sql = await readFile(resolve(process.cwd(), "supabase/migrations/20260530_project_kanban.sql"), "utf8");

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.projects");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.project_tasks");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.project_checklist_items");
    expect(sql).toContain("CHECK (status IN ('backlog', 'todo', 'doing', 'waiting', 'done'))");
    expect(sql).toContain("parent_task_id UUID REFERENCES public.project_tasks(id) ON DELETE CASCADE");
    expect(sql).toContain("ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY");
    expect(sql).not.toMatch(/ALTER TABLE\s+public\.items/i);
  });
});
```

- [ ] **Step 2: Run migration test to verify it fails**

Run:

```powershell
npm test -- tests/project-migration.test.ts
```

Expected: FAIL because the migration file does not exist.

- [ ] **Step 3: Add migration**

Create `supabase/migrations/20260530_project_kanban.sql`:

```sql
CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  description TEXT,
  position DOUBLE PRECISION NOT NULL DEFAULT 0,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.project_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  parent_task_id UUID REFERENCES public.project_tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  description TEXT,
  status TEXT NOT NULL DEFAULT 'backlog' CHECK (status IN ('backlog', 'todo', 'doing', 'waiting', 'done')),
  position DOUBLE PRECISION NOT NULL DEFAULT 0,
  due_date DATE,
  labels JSONB NOT NULL DEFAULT '[]'::jsonb,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (parent_task_id IS NULL OR parent_task_id <> id)
);

CREATE TABLE IF NOT EXISTS public.project_checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  task_id UUID NOT NULL REFERENCES public.project_tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  completed BOOLEAN NOT NULL DEFAULT false,
  position DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS projects_user_position_idx
  ON public.projects(user_id, archived_at, position, created_at);

CREATE INDEX IF NOT EXISTS project_tasks_project_status_position_idx
  ON public.project_tasks(project_id, archived_at, parent_task_id, status, position, created_at);

CREATE INDEX IF NOT EXISTS project_tasks_user_project_idx
  ON public.project_tasks(user_id, project_id);

CREATE INDEX IF NOT EXISTS project_checklist_items_task_position_idx
  ON public.project_checklist_items(task_id, position, created_at);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_checklist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own projects"
  ON public.projects FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own projects"
  ON public.projects FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own projects"
  ON public.projects FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own projects"
  ON public.projects FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can read own project tasks"
  ON public.project_tasks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own project tasks"
  ON public.project_tasks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own project tasks"
  ON public.project_tasks FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own project tasks"
  ON public.project_tasks FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can read own project checklist items"
  ON public.project_checklist_items FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own project checklist items"
  ON public.project_checklist_items FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own project checklist items"
  ON public.project_checklist_items FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own project checklist items"
  ON public.project_checklist_items FOR DELETE
  USING (auth.uid() = user_id);
```

- [ ] **Step 4: Run migration test**

Run:

```powershell
npm test -- tests/project-migration.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit migration**

Run:

```powershell
git add supabase/migrations/20260530_project_kanban.sql tests/project-migration.test.ts
git commit -m "feat: add project kanban schema"
```

---

## Task 3: Repository Layer

**Files:**

- Create: `lib/projects/repository.ts`
- Test: `tests/project-repository.test.ts`

- [ ] **Step 1: Write failing repository test**

Create `tests/project-repository.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { ProjectChecklistItem, ProjectTask } from "../lib/projects/types";
import { buildProjectTaskNodes, nextProjectPosition, nextTaskPosition, sanitizeProjectLabels } from "../lib/projects/repository";

describe("project repository helpers", () => {
  it("sanitizes labels to compact name/color objects", () => {
    expect(
      sanitizeProjectLabels([
        { name: " Build ", color: "#6ea8fe", ignored: true },
        { name: "", color: "#fff" },
        { name: "Bad Color", color: "blue" },
      ]),
    ).toEqual([{ name: "Build", color: "#6ea8fe" }]);
  });

  it("computes sparse positions", () => {
    expect(nextProjectPosition([])).toBe(1000);
    expect(nextProjectPosition([{ position: 1000 }, { position: 2000 }])).toBe(3000);
    expect(nextTaskPosition([{ position: 10 }, { position: 20 }])).toBe(1020);
  });

  it("builds top-level task nodes with subtasks and checklists", () => {
    const base = {
      project_id: "project-1",
      description: null,
      due_date: null,
      labels: [],
      archived_at: null,
      created_at: "2026-05-30T00:00:00Z",
      updated_at: "2026-05-30T00:00:00Z",
    };

    const tasks: ProjectTask[] = [
      { ...base, id: "task-1", parent_task_id: null, title: "Parent", status: "todo", position: 10 },
      { ...base, id: "sub-1", parent_task_id: "task-1", title: "Sub", status: "done", position: 10 },
    ];

    const checklist: ProjectChecklistItem[] = [
      { id: "check-1", task_id: "task-1", title: "Parent check", completed: false, position: 10, created_at: base.created_at, updated_at: base.updated_at },
      { id: "check-2", task_id: "sub-1", title: "Sub check", completed: true, position: 10, created_at: base.created_at, updated_at: base.updated_at },
    ];

    expect(buildProjectTaskNodes(tasks, checklist)).toMatchObject([
      {
        id: "task-1",
        checklist: [{ id: "check-1" }],
        subtasks: [{ id: "sub-1", checklist: [{ id: "check-2" }] }],
      },
    ]);
  });
});
```

- [ ] **Step 2: Run repository test to verify it fails**

Run:

```powershell
npm test -- tests/project-repository.test.ts
```

Expected: FAIL because `lib/projects/repository.ts` does not exist.

- [ ] **Step 3: Implement pure repository helpers**

Create the top of `lib/projects/repository.ts` with pure helpers first:

```ts
import { createAdminClient } from "@/lib/supabase/admin";
import type { Project, ProjectChecklistItem, ProjectLabel, ProjectTask, ProjectTaskNode } from "./types";
import { compareProjectTaskPositions, isProjectTaskStatus, type ProjectTaskStatus } from "./status";

const PROJECT_COLUMNS = "id,user_id,name,description,position,archived_at,created_at,updated_at";
const TASK_COLUMNS = "id,project_id,parent_task_id,title,description,status,position,due_date,labels,archived_at,created_at,updated_at";
const CHECKLIST_COLUMNS = "id,task_id,title,completed,position,created_at,updated_at";

export function sanitizeProjectLabels(value: unknown): ProjectLabel[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((label) => {
      if (!label || typeof label !== "object") return null;
      const record = label as Record<string, unknown>;
      const name = typeof record.name === "string" ? record.name.trim() : "";
      const color = typeof record.color === "string" ? record.color.trim() : "";
      if (!name || !/^#[0-9a-fA-F]{6}$/.test(color)) return null;
      return { name, color };
    })
    .filter((label): label is ProjectLabel => Boolean(label));
}

export function nextProjectPosition(projects: Array<{ position: number }>) {
  return Math.max(0, ...projects.map((project) => project.position)) + 1000;
}

export function nextTaskPosition(tasks: Array<{ position: number }>) {
  return Math.max(0, ...tasks.map((task) => task.position)) + 1000;
}

export function buildProjectTaskNodes(tasks: ProjectTask[], checklistItems: ProjectChecklistItem[]): ProjectTaskNode[] {
  const checklistByTask = new Map<string, ProjectChecklistItem[]>();
  for (const item of checklistItems) {
    const list = checklistByTask.get(item.task_id) ?? [];
    list.push(item);
    checklistByTask.set(item.task_id, list);
  }

  for (const list of checklistByTask.values()) {
    list.sort((a, b) => (a.position !== b.position ? a.position - b.position : a.created_at.localeCompare(b.created_at)));
  }

  const childrenByParent = new Map<string, ProjectTask[]>();
  const roots: ProjectTask[] = [];

  for (const task of tasks) {
    if (task.parent_task_id) {
      const children = childrenByParent.get(task.parent_task_id) ?? [];
      children.push(task);
      childrenByParent.set(task.parent_task_id, children);
    } else {
      roots.push(task);
    }
  }

  roots.sort(compareProjectTaskPositions);
  for (const children of childrenByParent.values()) children.sort(compareProjectTaskPositions);

  return roots.map((task) => ({
    ...task,
    checklist: checklistByTask.get(task.id) ?? [],
    subtasks: (childrenByParent.get(task.id) ?? []).map((subtask) => ({
      ...subtask,
      checklist: checklistByTask.get(subtask.id) ?? [],
    })),
  }));
}
```

- [ ] **Step 4: Run repository pure-helper test**

Run:

```powershell
npm test -- tests/project-repository.test.ts
```

Expected: PASS.

- [ ] **Step 5: Add repository functions**

Extend `lib/projects/repository.ts` with Supabase functions. Keep all queries filtered by `user_id`.

```ts
export async function listProjects(userId: string): Promise<Project[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("projects")
    .select(PROJECT_COLUMNS)
    .eq("user_id", userId)
    .is("archived_at", null)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Failed to load projects: ${error.message}`);
  return (data ?? []) as Project[];
}

export async function createProject(userId: string, input: { name: string; description?: string | null }) {
  const name = input.name.trim();
  if (!name) throw new Error("Project name is required");

  const projects = await listProjects(userId);
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("projects")
    .insert({
      user_id: userId,
      name,
      description: input.description?.trim() || null,
      position: nextProjectPosition(projects),
    })
    .select(PROJECT_COLUMNS)
    .single();

  if (error || !data) throw new Error(`Failed to create project: ${error?.message ?? "missing row"}`);
  return data as Project;
}

export async function loadProjectBoard(userId: string, projectId?: string | null) {
  const projects = await listProjects(userId);
  const activeProject = projectId
    ? projects.find((project) => project.id === projectId) ?? projects[0] ?? null
    : projects[0] ?? null;

  if (!activeProject) return { projects, activeProject: null, tasks: [] };

  const supabase = createAdminClient();
  const { data: taskRows, error: taskError } = await supabase
    .from("project_tasks")
    .select(TASK_COLUMNS)
    .eq("user_id", userId)
    .eq("project_id", activeProject.id)
    .is("archived_at", null)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (taskError) throw new Error(`Failed to load project tasks: ${taskError.message}`);

  const tasks = ((taskRows ?? []) as ProjectTask[]).map((task) => ({
    ...task,
    labels: sanitizeProjectLabels(task.labels),
  }));

  const taskIds = tasks.map((task) => task.id);
  const { data: checklistRows, error: checklistError } = taskIds.length
    ? await supabase
        .from("project_checklist_items")
        .select(CHECKLIST_COLUMNS)
        .eq("user_id", userId)
        .in("task_id", taskIds)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true })
    : { data: [], error: null };

  if (checklistError) throw new Error(`Failed to load project checklist items: ${checklistError.message}`);

  return {
    projects,
    activeProject,
    tasks: buildProjectTaskNodes(tasks, (checklistRows ?? []) as ProjectChecklistItem[]),
  };
}

export async function createProjectTask(
  userId: string,
  input: {
    projectId: string;
    parentTaskId?: string | null;
    title: string;
    status?: ProjectTaskStatus;
    description?: string | null;
  },
) {
  const title = input.title.trim();
  if (!title) throw new Error("Task title is required");
  const status = input.status ?? "backlog";
  if (!isProjectTaskStatus(status)) throw new Error("Invalid project task status");

  const board = await loadProjectBoard(userId, input.projectId);
  if (!board.activeProject) throw new Error("Project not found");

  const siblingPositions = input.parentTaskId
    ? board.tasks.find((task) => task.id === input.parentTaskId)?.subtasks ?? []
    : board.tasks.filter((task) => task.status === status);

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("project_tasks")
    .insert({
      user_id: userId,
      project_id: input.projectId,
      parent_task_id: input.parentTaskId ?? null,
      title,
      description: input.description?.trim() || null,
      status,
      position: nextTaskPosition(siblingPositions),
      labels: [],
    })
    .select(TASK_COLUMNS)
    .single();

  if (error || !data) throw new Error(`Failed to create project task: ${error?.message ?? "missing row"}`);
  return { ...(data as ProjectTask), labels: sanitizeProjectLabels((data as ProjectTask).labels) };
}
```

Also add focused functions in the same file for implementation tasks that follow:

```ts
export type ProjectTaskPatch = Partial<{
  title: string;
  description: string | null;
  status: ProjectTaskStatus;
  position: number;
  due_date: string | null;
  labels: ProjectLabel[];
  archived_at: string | null;
}>;

export async function updateProjectTask(userId: string, taskId: string, patch: ProjectTaskPatch) {
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof patch.title === "string") payload.title = patch.title.trim();
  if ("description" in patch) payload.description = patch.description?.trim() || null;
  if (patch.status) {
    if (!isProjectTaskStatus(patch.status)) throw new Error("Invalid project task status");
    payload.status = patch.status;
  }
  if (typeof patch.position === "number") payload.position = patch.position;
  if ("due_date" in patch) payload.due_date = patch.due_date || null;
  if (patch.labels) payload.labels = sanitizeProjectLabels(patch.labels);
  if ("archived_at" in patch) payload.archived_at = patch.archived_at;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("project_tasks")
    .update(payload)
    .eq("user_id", userId)
    .eq("id", taskId)
    .select(TASK_COLUMNS)
    .single();

  if (error || !data) throw new Error(`Failed to update project task: ${error?.message ?? "missing row"}`);
  return { ...(data as ProjectTask), labels: sanitizeProjectLabels((data as ProjectTask).labels) };
}

export async function createChecklistItem(userId: string, taskId: string, title: string) {
  const trimmed = title.trim();
  if (!trimmed) throw new Error("Checklist title is required");

  const supabase = createAdminClient();
  const { data: existing, error: existingError } = await supabase
    .from("project_checklist_items")
    .select("position")
    .eq("user_id", userId)
    .eq("task_id", taskId);

  if (existingError) throw new Error(`Failed to load checklist items: ${existingError.message}`);

  const { data, error } = await supabase
    .from("project_checklist_items")
    .insert({
      user_id: userId,
      task_id: taskId,
      title: trimmed,
      position: nextTaskPosition((existing ?? []) as Array<{ position: number }>),
    })
    .select(CHECKLIST_COLUMNS)
    .single();

  if (error || !data) throw new Error(`Failed to create checklist item: ${error?.message ?? "missing row"}`);
  return data as ProjectChecklistItem;
}

export async function updateChecklistItem(
  userId: string,
  itemId: string,
  patch: Partial<Pick<ProjectChecklistItem, "title" | "completed" | "position">>,
) {
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof patch.title === "string") payload.title = patch.title.trim();
  if (typeof patch.completed === "boolean") payload.completed = patch.completed;
  if (typeof patch.position === "number") payload.position = patch.position;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("project_checklist_items")
    .update(payload)
    .eq("user_id", userId)
    .eq("id", itemId)
    .select(CHECKLIST_COLUMNS)
    .single();

  if (error || !data) throw new Error(`Failed to update checklist item: ${error?.message ?? "missing row"}`);
  return data as ProjectChecklistItem;
}
```

- [ ] **Step 6: Run repository tests and typecheck**

Run:

```powershell
npm test -- tests/project-repository.test.ts
npx tsc --noEmit --incremental false
```

Expected: both PASS.

- [ ] **Step 7: Commit repository layer**

Run:

```powershell
git add lib/projects/repository.ts tests/project-repository.test.ts
git commit -m "feat: add project repository helpers"
```

---

## Task 4: Web Projects Page And Board Actions

**Files:**

- Create: `app/projects/page.tsx`
- Create: `app/projects/actions.ts`
- Create: `app/projects/projects-board-client.tsx`
- Modify: `app/app/board-client.tsx`
- Test: `tests/projects-web-actions.test.ts`

- [ ] **Step 1: Write failing web action validation test**

Create `tests/projects-web-actions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { projectTaskMovePatchFromForm } from "../app/projects/actions";

describe("project web actions", () => {
  it("parses a valid drag/drop move form", () => {
    const form = new FormData();
    form.set("taskId", "task-1");
    form.set("status", "doing");
    form.set("position", "1500");

    expect(projectTaskMovePatchFromForm(form)).toEqual({
      taskId: "task-1",
      status: "doing",
      position: 1500,
    });
  });

  it("rejects inbox lane names as project statuses", () => {
    const form = new FormData();
    form.set("taskId", "task-1");
    form.set("status", "today");
    form.set("position", "1500");

    expect(() => projectTaskMovePatchFromForm(form)).toThrow("Invalid project task status");
  });
});
```

- [ ] **Step 2: Run action test to verify it fails**

Run:

```powershell
npm test -- tests/projects-web-actions.test.ts
```

Expected: FAIL because `app/projects/actions.ts` does not exist.

- [ ] **Step 3: Implement web page server load**

Create `app/projects/page.tsx`:

```tsx
import { requireHardcodedSession } from "@/lib/auth/session";
import { resolveSessionUserId } from "@/lib/auth/session-user";
import { loadProjectBoard } from "@/lib/projects/repository";
import { ProjectsBoardClient } from "./projects-board-client";

export const dynamic = "force-dynamic";

export default async function ProjectsPage({ searchParams }: { searchParams?: Promise<{ project?: string }> }) {
  await requireHardcodedSession();
  const userId = await resolveSessionUserId();
  const params = await searchParams;
  const board = await loadProjectBoard(userId, params?.project ?? null);

  return <ProjectsBoardClient initialBoard={board} />;
}
```

- [ ] **Step 4: Implement web actions**

Create `app/projects/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { resolveSessionUserId } from "@/lib/auth/session-user";
import {
  createChecklistItem,
  createProject,
  createProjectTask,
  updateChecklistItem,
  updateProjectTask,
} from "@/lib/projects/repository";
import { isProjectTaskStatus, type ProjectTaskStatus } from "@/lib/projects/status";

export function projectTaskMovePatchFromForm(formData: FormData) {
  const taskId = String(formData.get("taskId") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  const position = Number(formData.get("position"));

  if (!taskId) throw new Error("Task id is required");
  if (!isProjectTaskStatus(status)) throw new Error("Invalid project task status");
  if (!Number.isFinite(position)) throw new Error("Valid position is required");

  return { taskId, status, position };
}

export async function createProjectAction(formData: FormData) {
  const userId = await resolveSessionUserId();
  await createProject(userId, {
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
  });
  revalidatePath("/projects");
}

export async function createProjectTaskAction(formData: FormData) {
  const userId = await resolveSessionUserId();
  const status = String(formData.get("status") ?? "backlog");
  if (!isProjectTaskStatus(status)) throw new Error("Invalid project task status");

  await createProjectTask(userId, {
    projectId: String(formData.get("projectId") ?? ""),
    parentTaskId: String(formData.get("parentTaskId") ?? "") || null,
    title: String(formData.get("title") ?? ""),
    status,
  });
  revalidatePath("/projects");
}

export async function moveProjectTaskAction(formData: FormData) {
  const userId = await resolveSessionUserId();
  const patch = projectTaskMovePatchFromForm(formData);
  await updateProjectTask(userId, patch.taskId, { status: patch.status, position: patch.position });
  revalidatePath("/projects");
}

export async function updateProjectTaskAction(taskId: string, patch: {
  title?: string;
  description?: string | null;
  status?: ProjectTaskStatus;
  due_date?: string | null;
  labels?: Array<{ name: string; color: string }>;
}) {
  const userId = await resolveSessionUserId();
  await updateProjectTask(userId, taskId, patch);
  revalidatePath("/projects");
}

export async function archiveProjectTaskAction(taskId: string) {
  const userId = await resolveSessionUserId();
  await updateProjectTask(userId, taskId, { archived_at: new Date().toISOString() });
  revalidatePath("/projects");
}

export async function createProjectChecklistItemAction(taskId: string, title: string) {
  const userId = await resolveSessionUserId();
  await createChecklistItem(userId, taskId, title);
  revalidatePath("/projects");
}

export async function updateProjectChecklistItemAction(itemId: string, patch: { title?: string; completed?: boolean; position?: number }) {
  const userId = await resolveSessionUserId();
  await updateChecklistItem(userId, itemId, patch);
  revalidatePath("/projects");
}
```

- [ ] **Step 5: Run action test**

Run:

```powershell
npm test -- tests/projects-web-actions.test.ts
```

Expected: PASS.

- [ ] **Step 6: Implement web board client**

Create `app/projects/projects-board-client.tsx`. Keep this first version compact and reuse the existing design tokens. Start with this structure:

```tsx
"use client";

import { useMemo, useState, useTransition } from "react";
import { DndContext, PointerSensor, KeyboardSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ProjectBoard, ProjectTaskNode } from "@/lib/projects/types";
import { checklistProgress, groupTopLevelTasksByStatus, subtaskProgress } from "@/lib/projects/progress";
import { PROJECT_STATUS_ORDER, statusLabel, type ProjectTaskStatus } from "@/lib/projects/status";
import { createProjectAction, createProjectTaskAction, moveProjectTaskAction } from "./actions";
import { TaskDetailDrawer } from "./task-detail-drawer";

type Props = { initialBoard: ProjectBoard };

export function ProjectsBoardClient({ initialBoard }: Props) {
  const [board, setBoard] = useState(initialBoard);
  const [query, setQuery] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const filteredTasks = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return board.tasks;
    return board.tasks.filter((task) => `${task.title} ${task.description ?? ""}`.toLowerCase().includes(normalized));
  }, [board.tasks, query]);

  const grouped = useMemo(() => groupTopLevelTasksByStatus(filteredTasks), [filteredTasks]);
  const selectedTask = useMemo(() => board.tasks.find((task) => task.id === selectedTaskId) ?? null, [board.tasks, selectedTaskId]);

  function handleDragEnd(event: DragEndEvent) {
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    const activeTask = board.tasks.find((task) => task.id === activeId);
    if (!activeTask || !board.activeProject) return;

    const nextStatus = (event.over?.data.current?.status ?? activeTask.status) as ProjectTaskStatus;
    const targetItems = grouped[nextStatus] ?? [];
    const position = positionForDrop(targetItems, activeId, overId);
    const previousBoard = board;

    setBoard({
      ...board,
      tasks: board.tasks.map((task) => (task.id === activeId ? { ...task, status: nextStatus, position } : task)),
    });

    startTransition(async () => {
      try {
        const form = new FormData();
        form.set("taskId", activeId);
        form.set("status", nextStatus);
        form.set("position", String(position));
        await moveProjectTaskAction(form);
      } catch (error) {
        setBoard(previousBoard);
        setStatusMessage(error instanceof Error ? error.message : "Failed to move project task");
      }
    });
  }

  return (
    <main className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div className="grid min-h-screen grid-cols-[240px_1fr] gap-4 p-4">
          <aside className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
            <h2 className="mb-3 text-xs font-mono uppercase text-[var(--text-muted)]">Projects</h2>
            <form action={createProjectAction} className="mb-3 flex gap-2">
              <input name="name" placeholder="New project" className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-sm" />
              <button className="rounded-md border border-[var(--border)] px-2 text-sm">Add</button>
            </form>
            <nav className="space-y-1">
              {board.projects.map((project) => (
                <a key={project.id} href={`/projects?project=${project.id}`} className="block rounded-md px-2 py-2 text-sm hover:bg-[var(--bg-muted)]">
                  {project.name}
                </a>
              ))}
            </nav>
          </aside>
          <section className="min-w-0">
            <header className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-mono uppercase text-[var(--text-muted)]">Project Board</p>
                <h1 className="text-2xl font-semibold">{board.activeProject?.name ?? "Projects"}</h1>
              </div>
              <input value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Search project" className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm" />
            </header>
            <div className="grid grid-cols-5 gap-3">
              {PROJECT_STATUS_ORDER.map((status) => (
                <section key={status} className="min-w-0 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
                  <h2 className="mb-3 text-xs font-mono uppercase text-[var(--text-muted)]">{statusLabel(status)}</h2>
                  <SortableContext items={grouped[status].map((task) => task.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-2">
                      {grouped[status].map((task) => <SortableProjectCard key={task.id} task={task} onOpen={setSelectedTaskId} />)}
                    </div>
                  </SortableContext>
                  <form action={createProjectTaskAction} className="mt-3">
                    <input type="hidden" name="projectId" value={board.activeProject?.id ?? ""} />
                    <input type="hidden" name="status" value={status} />
                    <input name="title" placeholder="+ Task" className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-sm" />
                  </form>
                </section>
              ))}
            </div>
          </section>
        </div>
      </DndContext>
      <TaskDetailDrawer task={selectedTask} projectId={board.activeProject?.id ?? ""} onClose={() => setSelectedTaskId(null)} />
      {isPending || statusMessage ? <div aria-live="polite">{statusMessage ?? "Saving..."}</div> : null}
    </main>
  );
}

function positionForDrop(items: Array<{ id: string; position: number }>, activeId: string, overId: string | null) {
  const withoutActive = items.filter((item) => item.id !== activeId);
  if (!overId) return (withoutActive.at(-1)?.position ?? 0) + 1000;
  const overIndex = withoutActive.findIndex((item) => item.id === overId);
  if (overIndex < 0) return (withoutActive.at(-1)?.position ?? 0) + 1000;
  const before = withoutActive[overIndex - 1]?.position ?? 0;
  const after = withoutActive[overIndex]?.position ?? before + 2000;
  return (before + after) / 2;
}

function SortableProjectCard({ task, onOpen }: { task: ProjectTaskNode; onOpen: (taskId: string) => void }) {
  const sortable = useSortable({ id: task.id, data: { status: task.status } });
  const checklist = checklistProgress(task.checklist);
  const subtasks = subtaskProgress(task);

  return (
    <article
      ref={sortable.setNodeRef}
      style={{ transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition }}
      className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-3"
    >
      <button {...sortable.attributes} {...sortable.listeners} className="mb-2 text-xs text-[var(--text-muted)]" aria-label={`Drag task ${task.title}`}>
        Drag
      </button>
      <button type="button" onClick={() => onOpen(task.id)} className="block w-full text-left">
        <h3 className="text-sm font-semibold">{task.title}</h3>
        {task.description ? <p className="mt-1 line-clamp-2 text-xs text-[var(--text-muted)]">{task.description}</p> : null}
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          Checklist {checklist.completed}/{checklist.total} - Subtasks {subtasks.completed}/{subtasks.total}
        </p>
      </button>
    </article>
  );
}
```

Complete the JSX sections with these concrete pieces:

- Project sidebar with add-project form.
- Header with active project name, search input, and `+ Task`.
- Five columns from `PROJECT_STATUS_ORDER`.
- Filter tasks by search query inside the active project.
- Use `DndContext`, `SortableContext`, and `useSortable` as in `app/app/board-client.tsx`.
- On drag end, compute a sparse position:

```ts
function positionForDrop(items: Array<{ id: string; position: number }>, activeId: string, overId: string | null) {
  const withoutActive = items.filter((item) => item.id !== activeId);
  if (!overId) return (withoutActive.at(-1)?.position ?? 0) + 1000;
  const overIndex = withoutActive.findIndex((item) => item.id === overId);
  if (overIndex < 0) return (withoutActive.at(-1)?.position ?? 0) + 1000;
  const before = withoutActive[overIndex - 1]?.position ?? 0;
  const after = withoutActive[overIndex]?.position ?? before + 2000;
  return (before + after) / 2;
}
```

- Submit `moveProjectTaskAction` with `taskId`, `status`, and `position`.
- Roll back local optimistic state if the action rejects.
- Render empty columns with a fast add form.
- Render card progress with `checklistProgress(task.checklist)` and `subtaskProgress(task)`.

- [ ] **Step 7: Add navigation link from existing board**

Modify the existing top-level navigation/header in `app/app/board-client.tsx` to include a link to `/projects` labeled `Projects`. Do not import project code into the existing board.

Use this JSX shape near the existing board navigation/header controls:

```tsx
<a
  href="/projects"
  className="rounded-md border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-muted)]"
>
  Projects
</a>
```

- [ ] **Step 8: Verify web slice**

Run:

```powershell
npm test -- tests/projects-web-actions.test.ts tests/project-status.test.ts tests/project-progress.test.ts
npx tsc --noEmit --incremental false
npm run lint
```

Expected: all PASS.

- [ ] **Step 9: Commit web board shell**

Run:

```powershell
git add app/projects app/app/board-client.tsx tests/projects-web-actions.test.ts
git commit -m "feat: add web projects board"
```

---

## Task 5: Web Task Detail, Subtasks, And Checklists

**Files:**

- Create: `app/projects/task-detail-drawer.tsx`
- Modify: `app/projects/projects-board-client.tsx`
- Modify: `app/projects/actions.ts`
- Test: `tests/project-progress.test.ts`

- [ ] **Step 1: Extend progress test for one-level nesting**

Add this test to `tests/project-progress.test.ts`:

```ts
it("does not render nested subtasks below one level", () => {
  const parent = task({ id: "parent" });
  const child = { ...task({ id: "child", parent_task_id: "parent" }), checklist: [] };
  const grandchild = { ...task({ id: "grandchild", parent_task_id: "child" }), checklist: [] };

  const grouped = groupTopLevelTasksByStatus([
    { ...parent, subtasks: [child, grandchild] },
    child as never,
    grandchild as never,
  ]);

  expect(grouped.todo.map((item) => item.id)).toEqual(["parent"]);
});
```

- [ ] **Step 2: Run progress test**

Run:

```powershell
npm test -- tests/project-progress.test.ts
```

Expected: PASS if Task 1 helpers already exclude non-root rows.

- [ ] **Step 3: Implement task detail drawer**

Create `app/projects/task-detail-drawer.tsx` with this structure:

```tsx
"use client";

import { useState, useTransition } from "react";
import type { ProjectTaskNode } from "@/lib/projects/types";
import { PROJECT_STATUS_ORDER, statusLabel } from "@/lib/projects/status";
import {
  archiveProjectTaskAction,
  createProjectChecklistItemAction,
  createProjectTaskAction,
  updateProjectChecklistItemAction,
  updateProjectTaskAction,
} from "./actions";

type TaskDetailDrawerProps = {
  task: ProjectTaskNode | null;
  projectId: string;
  onClose: () => void;
};

export function TaskDetailDrawer({ task, projectId, onClose }: TaskDetailDrawerProps) {
  const [isPending, startTransition] = useTransition();
  const [checklistTitle, setChecklistTitle] = useState("");
  const [subtaskTitle, setSubtaskTitle] = useState("");

  if (!task) return null;

  async function addSubtask(formData: FormData) {
    formData.set("projectId", projectId);
    formData.set("parentTaskId", task.id);
    formData.set("status", "todo");
    await createProjectTaskAction(formData);
    setSubtaskTitle("");
  }

  return (
    <aside className="fixed right-0 top-0 z-40 h-screen w-full max-w-md overflow-y-auto border-l border-[var(--border)] bg-[var(--bg-elevated)] p-5 shadow-2xl">
      <button type="button" onClick={onClose} className="mb-4 text-sm text-[var(--text-muted)]">Close</button>
      <input
        defaultValue={task.title}
        className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-lg font-semibold"
        onBlur={(event) => startTransition(() => updateProjectTaskAction(task.id, { title: event.currentTarget.value }))}
      />
      <textarea
        defaultValue={task.description ?? ""}
        className="mt-3 min-h-24 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
        onBlur={(event) => startTransition(() => updateProjectTaskAction(task.id, { description: event.currentTarget.value }))}
      />
      <select
        defaultValue={task.status}
        className="mt-3 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
        onChange={(event) => startTransition(() => updateProjectTaskAction(task.id, { status: event.currentTarget.value as never }))}
      >
        {PROJECT_STATUS_ORDER.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}
      </select>
      <input
        type="date"
        defaultValue={task.due_date ?? ""}
        className="mt-3 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
        onChange={(event) => startTransition(() => updateProjectTaskAction(task.id, { due_date: event.currentTarget.value || null }))}
      />
      <section className="mt-5">
        <h3 className="text-sm font-semibold">Checklist</h3>
        {task.checklist.map((item) => (
          <label key={item.id} className="mt-2 flex items-center gap-2 text-sm">
            <input type="checkbox" defaultChecked={item.completed} onChange={(event) => startTransition(() => updateProjectChecklistItemAction(item.id, { completed: event.currentTarget.checked }))} />
            <span>{item.title}</span>
          </label>
        ))}
        <form action={() => startTransition(() => createProjectChecklistItemAction(task.id, checklistTitle))} className="mt-3 flex gap-2">
          <input value={checklistTitle} onChange={(event) => setChecklistTitle(event.currentTarget.value)} className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-sm" placeholder="Checklist item" />
          <button className="rounded-md border border-[var(--border)] px-2 text-sm">Add</button>
        </form>
      </section>
      <section className="mt-5">
        <h3 className="text-sm font-semibold">Subtasks</h3>
        {task.subtasks.map((subtask) => <p key={subtask.id} className="mt-2 text-sm">{subtask.title}</p>)}
        <form action={addSubtask} className="mt-3 flex gap-2">
          <input name="title" value={subtaskTitle} onChange={(event) => setSubtaskTitle(event.currentTarget.value)} className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-sm" placeholder="Subtask" />
          <button className="rounded-md border border-[var(--border)] px-2 text-sm">Add</button>
        </form>
      </section>
      <button type="button" className="mt-6 rounded-md border border-[var(--danger)] px-3 py-2 text-sm text-[var(--danger)]" onClick={() => startTransition(() => archiveProjectTaskAction(task.id))}>
        Archive task
      </button>
      {isPending ? <p className="mt-3 text-xs text-[var(--text-muted)]">Saving...</p> : null}
    </aside>
  );
}
```

Use these action calls:

```ts
await updateProjectTaskAction(task.id, { title, description, status, due_date, labels });
await createProjectTaskAction(formDataWithParentTaskId);
await createProjectChecklistItemAction(task.id, title);
await updateProjectChecklistItemAction(checklistItem.id, { completed: nextCompleted });
await archiveProjectTaskAction(task.id);
```

The drawer should receive:

```ts
type TaskDetailDrawerProps = {
  task: ProjectTaskNode | null;
  projectId: string;
  onClose: () => void;
};
```

Render nothing when `task` is `null`.

- [ ] **Step 4: Wire drawer into board client**

Modify `app/projects/projects-board-client.tsx`:

- Track `selectedTaskId`.
- Find selected task from the current task list.
- Open drawer when a card is clicked.
- Keep drag handle separate from card action buttons so clicking checkboxes and card details does not start drag.

Use this state shape:

```ts
const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
const selectedTask = useMemo(
  () => boardTasks.find((task) => task.id === selectedTaskId) ?? null,
  [boardTasks, selectedTaskId],
);
```

- [ ] **Step 5: Verify detail slice**

Run:

```powershell
npm test -- tests/project-progress.test.ts tests/projects-web-actions.test.ts
npx tsc --noEmit --incremental false
npm run lint
```

Expected: all PASS.

- [ ] **Step 6: Commit detail slice**

Run:

```powershell
git add app/projects tests/project-progress.test.ts
git commit -m "feat: add project task detail drawer"
```

---

## Task 6: Mobile Project Contracts And API Routes

**Files:**

- Create: `mobile/lib/projects-types.ts`
- Create: `mobile/lib/projects-api.ts`
- Create: `app/api/mobile/projects/route.ts`
- Create: `app/api/mobile/projects/[projectId]/board/route.ts`
- Create: `app/api/mobile/projects/[projectId]/tasks/route.ts`
- Create: `app/api/mobile/projects/[projectId]/tasks/[taskId]/route.ts`
- Create: `app/api/mobile/projects/[projectId]/tasks/[taskId]/checklist/route.ts`
- Test: `tests/project-mobile-contracts.test.ts`
- Test: `tests/project-mobile-routes.test.ts`

- [ ] **Step 1: Write failing mobile contract tests**

Create `tests/project-mobile-contracts.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildMockProjectBoard, projectStatusTabs } from "../mobile/lib/projects-api";

describe("mobile project contracts", () => {
  it("exposes fixed status tabs for mobile", () => {
    expect(projectStatusTabs()).toEqual([
      { key: "backlog", label: "Backlog" },
      { key: "todo", label: "To Do" },
      { key: "doing", label: "Doing" },
      { key: "waiting", label: "Waiting" },
      { key: "done", label: "Done" },
    ]);
  });

  it("builds a mock board with separate project tasks", async () => {
    const board = await buildMockProjectBoard();

    expect(board.projects.length).toBeGreaterThan(0);
    expect(board.activeProject).toBeTruthy();
    expect(board.tasks.every((task) => "project_id" in task)).toBe(true);
  });
});
```

- [ ] **Step 2: Run mobile contract test to verify it fails**

Run:

```powershell
npm test -- tests/project-mobile-contracts.test.ts
```

Expected: FAIL because mobile project files do not exist.

- [ ] **Step 3: Add mobile project types**

Create `mobile/lib/projects-types.ts`:

```ts
export type MobileProjectTaskStatus = "backlog" | "todo" | "doing" | "waiting" | "done";

export type MobileProjectLabel = {
  name: string;
  color: string;
};

export type MobileProject = {
  id: string;
  name: string;
  description: string | null;
  position: number;
};

export type MobileProjectChecklistItem = {
  id: string;
  task_id: string;
  title: string;
  completed: boolean;
  position: number;
};

export type MobileProjectSubtask = {
  id: string;
  project_id: string;
  parent_task_id: string;
  title: string;
  description: string | null;
  status: MobileProjectTaskStatus;
  position: number;
  due_date: string | null;
  labels: MobileProjectLabel[];
  checklist: MobileProjectChecklistItem[];
};

export type MobileProjectTask = {
  id: string;
  project_id: string;
  parent_task_id: null;
  title: string;
  description: string | null;
  status: MobileProjectTaskStatus;
  position: number;
  due_date: string | null;
  labels: MobileProjectLabel[];
  checklist: MobileProjectChecklistItem[];
  subtasks: MobileProjectSubtask[];
};

export type MobileProjectBoardPayload = {
  projects: MobileProject[];
  activeProject: MobileProject | null;
  tasks: MobileProjectTask[];
};
```

- [ ] **Step 4: Add mobile API client with mock mode**

Create `mobile/lib/projects-api.ts`:

```ts
import type { MobileProjectBoardPayload, MobileProjectTaskStatus } from "./projects-types";

const STATUS_TABS: Array<{ key: MobileProjectTaskStatus; label: string }> = [
  { key: "backlog", label: "Backlog" },
  { key: "todo", label: "To Do" },
  { key: "doing", label: "Doing" },
  { key: "waiting", label: "Waiting" },
  { key: "done", label: "Done" },
];

export function projectStatusTabs() {
  return STATUS_TABS;
}

function getMobileDevKey() {
  return process.env.EXPO_PUBLIC_MOBILE_DEV_API_KEY?.trim() ?? "";
}

function getBackendBaseUrl() {
  return process.env.EXPO_PUBLIC_BACKEND_BASE_URL?.trim() || "http://127.0.0.1:3002";
}

function canUseBackendApi() {
  return typeof fetch === "function" && process.env.EXPO_PUBLIC_USE_REAL_BACKEND === "true";
}

async function requestProjectsApi<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const devKey = getMobileDevKey();
  if (devKey) headers.set("x-mobile-dev-key", devKey);

  const response = await fetch(`${getBackendBaseUrl()}${path}`, { ...init, headers });
  if (!response.ok) throw new Error(`Mobile projects API request failed (${response.status}) for ${path}`);
  return (await response.json()) as T;
}

export async function buildMockProjectBoard(): Promise<MobileProjectBoardPayload> {
  return {
    projects: [{ id: "project-1", name: "Todo App", description: null, position: 1000 }],
    activeProject: { id: "project-1", name: "Todo App", description: null, position: 1000 },
    tasks: [
      {
        id: "task-1",
        project_id: "project-1",
        parent_task_id: null,
        title: "Build Projects tab",
        description: "Create the first project board.",
        status: "doing",
        position: 1000,
        due_date: null,
        labels: [{ name: "Build", color: "#6ea8fe" }],
        checklist: [{ id: "check-1", task_id: "task-1", title: "Sketch mobile UI", completed: true, position: 1000 }],
        subtasks: [
          {
            id: "sub-1",
            project_id: "project-1",
            parent_task_id: "task-1",
            title: "Add API routes",
            description: null,
            status: "todo",
            position: 1000,
            due_date: null,
            labels: [],
            checklist: [],
          },
        ],
      },
    ],
  };
}

export async function getMobileProjectBoard(projectId?: string): Promise<MobileProjectBoardPayload> {
  if (canUseBackendApi()) {
    const suffix = projectId ? `?project=${encodeURIComponent(projectId)}` : "";
    return requestProjectsApi<MobileProjectBoardPayload>(`/api/mobile/projects${suffix}`);
  }
  return buildMockProjectBoard();
}
```

- [ ] **Step 5: Run mobile contract test**

Run:

```powershell
npm test -- tests/project-mobile-contracts.test.ts
```

Expected: PASS.

- [ ] **Step 6: Write route tests**

Create `tests/project-mobile-routes.test.ts` using the same mocking pattern as `tests/mobile-item-detail-route.test.ts`.

Minimum assertions:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from(table: string) {
      const query = {
        select() { return query; },
        eq() { return query; },
        is() { return query; },
        order() { return query; },
        insert() { return query; },
        update() { return query; },
        in() { return query; },
        single() {
          if (table === "projects") {
            return Promise.resolve({ data: { id: "project-1", user_id: "user-1", name: "Todo App", description: null, position: 1000, archived_at: null, created_at: "2026-05-30T00:00:00Z", updated_at: "2026-05-30T00:00:00Z" }, error: null });
          }
          return Promise.resolve({ data: { id: "task-1", project_id: "project-1", parent_task_id: null, title: "Task", description: null, status: "todo", position: 1000, due_date: null, labels: [], archived_at: null, created_at: "2026-05-30T00:00:00Z", updated_at: "2026-05-30T00:00:00Z" }, error: null });
        },
        then(resolve: (value: unknown) => void) {
          if (table === "projects") {
            resolve({ data: [{ id: "project-1", user_id: "user-1", name: "Todo App", description: null, position: 1000, archived_at: null, created_at: "2026-05-30T00:00:00Z", updated_at: "2026-05-30T00:00:00Z" }], error: null });
          } else if (table === "project_tasks") {
            resolve({ data: [], error: null });
          } else {
            resolve({ data: [], error: null });
          }
        },
      };
      return query;
    },
  }),
}));

describe("mobile project routes", () => {
  beforeEach(() => {
    process.env.MOBILE_DEV_API_KEY = "test-mobile-key";
    process.env.MOBILE_DEV_USER_ID = "user-1";
  });

  it("returns the project board payload", async () => {
    const { GET } = await import("../app/api/mobile/projects/route");
    const response = await GET(new Request("http://localhost/api/mobile/projects", {
      headers: { "x-mobile-dev-key": "test-mobile-key" },
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.projects[0].name).toBe("Todo App");
    expect(body.tasks).toEqual([]);
  });
});
```

- [ ] **Step 7: Run route test to verify it fails**

Run:

```powershell
npm test -- tests/project-mobile-routes.test.ts
```

Expected: FAIL because the routes do not exist.

- [ ] **Step 8: Implement mobile routes**

Create `app/api/mobile/projects/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createProject, loadProjectBoard } from "@/lib/projects/repository";
import { mobileCorsPreflightResponse, requireMobileApiUser, unauthorizedResponse, withMobileCors } from "../_shared";

export const dynamic = "force-dynamic";

export function OPTIONS(request: Request) {
  return mobileCorsPreflightResponse(request);
}

export async function GET(request: Request) {
  const auth = await requireMobileApiUser(request);
  if (!auth) return unauthorizedResponse(request);

  const projectId = new URL(request.url).searchParams.get("project");
  const board = await loadProjectBoard(auth.userId, projectId);
  return withMobileCors(NextResponse.json(board), request);
}

export async function POST(request: Request) {
  const auth = await requireMobileApiUser(request);
  if (!auth) return unauthorizedResponse(request);

  const body = (await request.json().catch(() => null)) as { name?: string; description?: string | null } | null;
  const project = await createProject(auth.userId, { name: body?.name ?? "", description: body?.description ?? null });
  return withMobileCors(NextResponse.json(project), request);
}
```

Create `app/api/mobile/projects/[projectId]/board/route.ts`:

```ts
import { NextResponse } from "next/server";
import { loadProjectBoard } from "@/lib/projects/repository";
import { mobileCorsPreflightResponse, requireMobileApiUser, unauthorizedResponse, withMobileCors } from "../../../_shared";

export const dynamic = "force-dynamic";

export function OPTIONS(request: Request) {
  return mobileCorsPreflightResponse(request);
}

export async function GET(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const auth = await requireMobileApiUser(request);
  if (!auth) return unauthorizedResponse(request);
  const { projectId } = await context.params;
  return withMobileCors(NextResponse.json(await loadProjectBoard(auth.userId, projectId)), request);
}
```

Create `app/api/mobile/projects/[projectId]/tasks/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createProjectTask } from "@/lib/projects/repository";
import { isProjectTaskStatus } from "@/lib/projects/status";
import { mobileCorsPreflightResponse, requireMobileApiUser, unauthorizedResponse, withMobileCors } from "../../../_shared";

export const dynamic = "force-dynamic";

export function OPTIONS(request: Request) {
  return mobileCorsPreflightResponse(request);
}

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const auth = await requireMobileApiUser(request);
  if (!auth) return unauthorizedResponse(request);
  const { projectId } = await context.params;
  const body = (await request.json().catch(() => null)) as { title?: string; status?: unknown; parentTaskId?: string | null } | null;
  const status = isProjectTaskStatus(body?.status) ? body.status : "backlog";
  const task = await createProjectTask(auth.userId, { projectId, title: body?.title ?? "", status, parentTaskId: body?.parentTaskId ?? null });
  return withMobileCors(NextResponse.json(task), request);
}
```

Create `app/api/mobile/projects/[projectId]/tasks/[taskId]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { loadProjectBoard, updateProjectTask } from "@/lib/projects/repository";
import { isProjectTaskStatus } from "@/lib/projects/status";
import { mobileCorsPreflightResponse, requireMobileApiUser, unauthorizedResponse, withMobileCors } from "../../../../_shared";

export const dynamic = "force-dynamic";

export function OPTIONS(request: Request) {
  return mobileCorsPreflightResponse(request);
}

export async function GET(request: Request, context: { params: Promise<{ projectId: string; taskId: string }> }) {
  const auth = await requireMobileApiUser(request);
  if (!auth) return unauthorizedResponse(request);
  const { projectId, taskId } = await context.params;
  const board = await loadProjectBoard(auth.userId, projectId);
  const task = board.tasks.find((candidate) => candidate.id === taskId);
  if (!task) return withMobileCors(NextResponse.json({ error: "not found" }, { status: 404 }), request);
  return withMobileCors(NextResponse.json(task), request);
}

export async function PATCH(request: Request, context: { params: Promise<{ taskId: string }> }) {
  const auth = await requireMobileApiUser(request);
  if (!auth) return unauthorizedResponse(request);
  const { taskId } = await context.params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const patch: Record<string, unknown> = {};
  if (typeof body?.title === "string") patch.title = body.title;
  if (typeof body?.description === "string" || body?.description === null) patch.description = body.description;
  if (isProjectTaskStatus(body?.status)) patch.status = body.status;
  if (typeof body?.due_date === "string" || body?.due_date === null) patch.due_date = body.due_date;
  if (Array.isArray(body?.labels)) patch.labels = body.labels;
  const task = await updateProjectTask(auth.userId, taskId, patch);
  return withMobileCors(NextResponse.json(task), request);
}
```

Create `app/api/mobile/projects/[projectId]/tasks/[taskId]/checklist/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createChecklistItem, updateChecklistItem } from "@/lib/projects/repository";
import { mobileCorsPreflightResponse, requireMobileApiUser, unauthorizedResponse, withMobileCors } from "../../../../_shared";

export const dynamic = "force-dynamic";

export function OPTIONS(request: Request) {
  return mobileCorsPreflightResponse(request);
}

export async function POST(request: Request, context: { params: Promise<{ taskId: string }> }) {
  const auth = await requireMobileApiUser(request);
  if (!auth) return unauthorizedResponse(request);
  const { taskId } = await context.params;
  const body = (await request.json().catch(() => null)) as { title?: string } | null;
  const item = await createChecklistItem(auth.userId, taskId, body?.title ?? "");
  return withMobileCors(NextResponse.json(item), request);
}

export async function PATCH(request: Request) {
  const auth = await requireMobileApiUser(request);
  if (!auth) return unauthorizedResponse(request);
  const body = (await request.json().catch(() => null)) as { itemId?: string; title?: string; completed?: boolean; position?: number } | null;
  if (!body?.itemId) return withMobileCors(NextResponse.json({ error: "itemId is required" }, { status: 400 }), request);
  const item = await updateChecklistItem(auth.userId, body.itemId, { title: body.title, completed: body.completed, position: body.position });
  return withMobileCors(NextResponse.json(item), request);
}
```

- [ ] **Step 9: Verify mobile API slice**

Run:

```powershell
npm test -- tests/project-mobile-contracts.test.ts tests/project-mobile-routes.test.ts
npx tsc --noEmit --incremental false
```

Expected: all PASS.

- [ ] **Step 10: Commit mobile API slice**

Run:

```powershell
git add mobile/lib/projects-types.ts mobile/lib/projects-api.ts app/api/mobile/projects tests/project-mobile-contracts.test.ts tests/project-mobile-routes.test.ts
git commit -m "feat: add mobile project board api"
```

---

## Task 7: Mobile Projects UI

**Files:**

- Modify: `mobile/app/_layout.tsx`
- Create: `mobile/app/(tabs)/projects.tsx`
- Create: `mobile/app/project-task/[id].tsx`
- Create: `mobile/components/ProjectTaskRow.tsx`
- Modify: `mobile/lib/projects-api.ts`
- Test: `tests/project-mobile-contracts.test.ts`

- [ ] **Step 1: Extend mobile contract test for status patch payload**

Add to `tests/project-mobile-contracts.test.ts`:

```ts
import { buildProjectTaskStatusPatch } from "../mobile/lib/projects-api";

it("builds a mobile status patch without inbox lane fields", () => {
  expect(buildProjectTaskStatusPatch("waiting")).toEqual({ status: "waiting" });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
npm test -- tests/project-mobile-contracts.test.ts
```

Expected: FAIL because `buildProjectTaskStatusPatch` does not exist.

- [ ] **Step 3: Add mobile API helpers**

Extend `mobile/lib/projects-api.ts`:

```ts
import type { MobileProjectTaskStatus } from "./projects-types";

export function buildProjectTaskStatusPatch(status: MobileProjectTaskStatus) {
  return { status };
}

export async function createMobileProjectTask(projectId: string, title: string, status: MobileProjectTaskStatus) {
  if (canUseBackendApi()) {
    return requestProjectsApi(`/api/mobile/projects/${projectId}/tasks`, {
      method: "POST",
      body: JSON.stringify({ title: title.trim(), status }),
    });
  }
  const board = await buildMockProjectBoard();
  const task = board.tasks[0];
  return { ...task, id: `mock-${Date.now()}`, title: title.trim(), status };
}

export async function updateMobileProjectTask(projectId: string, taskId: string, patch: Record<string, unknown>) {
  if (canUseBackendApi()) {
    return requestProjectsApi(`/api/mobile/projects/${projectId}/tasks/${taskId}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
  }
  return { ok: true };
}
```

- [ ] **Step 4: Add mobile tab route**

Modify `mobile/app/_layout.tsx`:

```tsx
<Tabs.Screen name="(tabs)/projects" options={{ title: "Projects" }} />
<Tabs.Screen name="project-task/[id]" options={{ href: null, title: "Project Task" }} />
```

Create `mobile/app/(tabs)/projects.tsx`:

- Load `getMobileProjectBoard()` on mount.
- Render project picker as horizontal buttons.
- Render `projectStatusTabs()` as horizontal status tabs.
- Filter visible tasks by selected status.
- Render `ProjectTaskRow`.
- Add a fast-add input for the selected status.
- On status picker change, call `updateMobileProjectTask(projectId, taskId, buildProjectTaskStatusPatch(nextStatus))`.

- [ ] **Step 5: Add mobile row component**

Create `mobile/components/ProjectTaskRow.tsx`:

- Show title.
- Show label chips.
- Show due date when present.
- Show checklist count.
- Show subtask count.
- Show status picker.
- Open detail via `router.push({ pathname: "/project-task/[id]", params: { id: task.id, projectId: task.project_id } })`.

- [ ] **Step 6: Add mobile detail screen**

Create `mobile/app/project-task/[id].tsx`:

- Load current board payload and find the task by `id`.
- Show title, description, labels, due date, checklist, and subtasks.
- Allow status update via picker.
- Allow checklist toggles via `updateMobileProjectTask` or the checklist route helper.
- Keep editing simple: v1 can use inline text inputs and save buttons.

- [ ] **Step 7: Verify mobile UI slice**

Run:

```powershell
npm test -- tests/project-mobile-contracts.test.ts
npx tsc --noEmit --incremental false
```

Then run mobile typecheck:

```powershell
npm --prefix mobile run typecheck
```

Expected: Vitest and TypeScript PASS. If `mobile` has no `typecheck` script, record the exact npm error and rely on root TypeScript plus Expo export during final verification.

- [ ] **Step 8: Commit mobile UI slice**

Run:

```powershell
git add mobile/app mobile/components/ProjectTaskRow.tsx mobile/lib/projects-api.ts tests/project-mobile-contracts.test.ts
git commit -m "feat: add mobile projects tab"
```

---

## Task 8: Final Integration, Smoke Checks, And Docs

**Files:**

- Modify: `README_FIRST.md`
- Modify: `progress.md`
- Modify: `HANDOFF.md`
- Create: `.opencode-smoke/projects-web-smoke.spec.ts`

- [ ] **Step 1: Run full local verification**

Run from `ai-assistant`:

```powershell
npm test
npx tsc --noEmit --incremental false
npm run lint
npm run build
```

Expected:

- `npm test`: all tests pass.
- `npx tsc --noEmit --incremental false`: exit 0.
- `npm run lint`: exit 0.
- `npm run build`: exit 0.

- [ ] **Step 2: Start local web app**

Run:

```powershell
npm run dev
```

Expected: Next dev server starts. Use the printed local URL, usually `http://localhost:3000`.

- [ ] **Step 3: Browser smoke web Projects**

Use the in-app browser or Playwright smoke helper against the local app.

Smoke script behavior:

1. Open `/login` if auth is required and use existing dev credentials from `.env.local` or `.env.global` without printing secrets.
2. Navigate to `/projects`.
3. Create a project named `Smoke Project`.
4. Create a task named `Smoke Task`.
5. Move the task from `Backlog` to `Doing`.
6. Open the task drawer.
7. Add checklist item `Smoke checklist`.
8. Mark checklist item complete.
9. Add subtask `Smoke subtask`.
10. Confirm the card shows checklist and subtask progress.
11. Navigate to `/app` and confirm `Smoke Task` is not visible in the random todo board.

Expected: no console errors and the project task remains isolated from the existing inbox board.

- [ ] **Step 4: Mobile local smoke**

Run Expo web export or the existing mobile smoke path used by the project:

```powershell
npm --prefix mobile run typecheck
npm --prefix mobile run export
```

Expected:

- Mobile project tab compiles.
- Direct navigation to project task detail compiles.
- If a script is unavailable, document the exact npm error and run the closest existing mobile verification command shown by `npm --prefix mobile run`.

- [ ] **Step 5: Update session docs**

Update root `README_FIRST.md`, `progress.md`, and `HANDOFF.md` with:

- Feature status.
- Commit hash range.
- Local verification commands and outcomes.
- Deployment status.
- Any known follow-up work.

- [ ] **Step 6: Commit final docs**

Run from workspace root:

```powershell
git add README_FIRST.md progress.md HANDOFF.md
git status --short
git commit -m "docs: update projects kanban handoff"
```

Then run from `ai-assistant`:

```powershell
git status --short
```

Expected: only intentional app-repo changes remain, or the app repo is clean after the final feature commit.

- [ ] **Step 7: Deployment decision**

Ask before pushing/deploying unless the user explicitly requested deployment. If approved, push `main`, deploy the backend/web Coolify app, deploy mobile if required, apply the Supabase migration in production, and smoke the production URLs.

Production smoke must verify:

- `/projects` loads.
- Creating and moving a project task works.
- Mobile Projects tab loads against the backend.
- Existing `/app` random todo board remains unaffected.

---

## Self-Review

- Spec coverage: The plan covers separate project data, fixed columns, one-level subtasks, checklists on tasks/subtasks, web drag/drop, mobile status picker, manual completion, simple search, and isolation from existing inbox flows.
- Scope: This is one cohesive feature split into domain, schema, web, nested work, mobile API, mobile UI, and verification slices.
- Type consistency: Project statuses use `backlog | todo | doing | waiting | done` across domain, repository, web, API, and mobile.
- Risk notes: The largest implementation risk is the web board client becoming too large. Keep `task-detail-drawer.tsx`, status helpers, progress helpers, and repository logic split as planned.
