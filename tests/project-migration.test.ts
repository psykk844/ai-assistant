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
    expect(sql).toContain("FOREIGN KEY (project_id, user_id) REFERENCES public.projects(id, user_id) ON DELETE CASCADE");
    expect(sql).toContain(
      "root_guard UUID GENERATED ALWAYS AS (CASE WHEN parent_task_id IS NULL THEN id ELSE NULL END) STORED",
    );
    expect(sql).toContain("UNIQUE (root_guard, user_id, project_id)");
    expect(sql).toContain(
      "FOREIGN KEY (parent_task_id, user_id, project_id) REFERENCES public.project_tasks(root_guard, user_id, project_id) ON DELETE CASCADE",
    );
    expect(sql).toContain("FOREIGN KEY (task_id, user_id) REFERENCES public.project_tasks(id, user_id) ON DELETE CASCADE");
    expect(sql).toContain("CHECK (jsonb_typeof(labels) = 'array')");
    expect(sql).toContain("CREATE INDEX IF NOT EXISTS projects_user_position_idx");
    expect(sql).toContain("ON public.projects(user_id, position, archived_at, created_at)");
    expect(sql).toContain("CREATE INDEX IF NOT EXISTS project_tasks_project_status_position_idx");
    expect(sql).toContain("ON public.project_tasks(project_id, status, position, archived_at, parent_task_id, created_at)");
    expect(sql).toContain("CREATE INDEX IF NOT EXISTS projects_active_user_position_idx");
    expect(sql).toContain("ON public.projects(user_id, archived_at, position, created_at)");
    expect(sql).toContain("CREATE INDEX IF NOT EXISTS project_tasks_active_board_idx");
    expect(sql).toContain("ON public.project_tasks(project_id, archived_at, parent_task_id, status, position, created_at)");
    expect(sql).toContain("ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("ALTER TABLE public.project_tasks ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("ALTER TABLE public.project_checklist_items ENABLE ROW LEVEL SECURITY");
    expect(sql).not.toMatch(/ALTER TABLE\s+public\.items/i);
  });

  it("adds fixed project areas without touching inbox items", async () => {
    const sql = await readFile(resolve(process.cwd(), "supabase/migrations/20260531_project_areas.sql"), "utf8");

    expect(sql).toContain("ALTER TABLE public.projects");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS area TEXT NOT NULL DEFAULT 'demand'");
    expect(sql).toContain("CHECK (area IN ('demand', 'delivery', 'personal'))");
    expect(sql).toContain("CREATE INDEX IF NOT EXISTS projects_user_area_position_idx");
    expect(sql).toContain("ON public.projects(user_id, area, archived_at, position, created_at)");
    expect(sql).not.toMatch(/ALTER TABLE\s+public\.items/i);
  });
});
