import { describe, expect, it, vi } from "vitest";
import type { ProjectChecklistItem, ProjectTask } from "../lib/projects/types";
import { buildProjectTaskNodes, createProjectTask, nextProjectPosition, nextTaskPosition, sanitizeProjectLabels } from "../lib/projects/repository";

const insertProjectTask = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from(table: string) {
      const query = {
        select() {
          return query;
        },
        eq() {
          return query;
        },
        is() {
          return query;
        },
        order() {
          return query;
        },
        in() {
          return query;
        },
        insert(payload: unknown) {
          if (table === "project_tasks") insertProjectTask(payload);
          return query;
        },
        single() {
          return Promise.resolve({
            data: {
              id: "task-created",
              project_id: "missing-project",
              parent_task_id: null,
              title: "Task",
              description: null,
              status: "backlog",
              position: 1000,
              due_date: null,
              labels: [],
              archived_at: null,
              created_at: "2026-05-30T00:00:00Z",
              updated_at: "2026-05-30T00:00:00Z",
            },
            error: null,
          });
        },
        then(resolve: (value: unknown) => void) {
          if (table === "projects") {
            resolve({
              data: [
                {
                  id: "other-project",
                  user_id: "user-1",
                  name: "Other",
                  description: null,
                  position: 1000,
                  archived_at: null,
                  created_at: "2026-05-30T00:00:00Z",
                  updated_at: "2026-05-30T00:00:00Z",
                },
              ],
              error: null,
            });
            return;
          }

          resolve({ data: [], error: null });
        },
      };
      return query;
    },
  }),
}));

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

  it("rejects a missing requested project even when another project exists", async () => {
    insertProjectTask.mockClear();

    await expect(
      createProjectTask("user-1", {
        projectId: "missing-project",
        title: "Task",
      }),
    ).rejects.toThrow("Project not found");

    expect(insertProjectTask).not.toHaveBeenCalled();
  });
});
