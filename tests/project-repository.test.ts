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
