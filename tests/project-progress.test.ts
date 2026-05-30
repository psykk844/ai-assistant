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
