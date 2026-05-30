import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, ProjectChecklistItem, ProjectTask } from "../lib/projects/types";
import {
  buildProjectTaskNodes,
  createProjectTask,
  nextProjectPosition,
  nextTaskPosition,
  sanitizeProjectLabels,
  updateChecklistItem,
  updateProjectTask,
} from "../lib/projects/repository";

const mockState = vi.hoisted(() => ({
  insertProjectTask: vi.fn(),
  updateChecklistItem: vi.fn(),
  updateProjectTask: vi.fn(),
  projects: [] as Project[],
  taskRows: [] as ProjectTask[],
}));

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
          if (table === "project_tasks") mockState.insertProjectTask(payload);
          return query;
        },
        update(payload: unknown) {
          if (table === "project_tasks") mockState.updateProjectTask(payload);
          if (table === "project_checklist_items") mockState.updateChecklistItem(payload);
          return query;
        },
        single() {
          if (table === "project_checklist_items") {
            return Promise.resolve({
              data: {
                id: "check-1",
                task_id: "task-1",
                title: "Checklist",
                completed: false,
                position: 1000,
                created_at: "2026-05-30T00:00:00Z",
                updated_at: "2026-05-30T00:00:00Z",
              },
              error: null,
            });
          }

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
            resolve({ data: mockState.projects, error: null });
            return;
          }

          if (table === "project_tasks") {
            resolve({ data: mockState.taskRows, error: null });
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
  beforeEach(() => {
    mockState.insertProjectTask.mockClear();
    mockState.updateChecklistItem.mockClear();
    mockState.updateProjectTask.mockClear();
    mockState.projects = [
      {
        id: "project-1",
        user_id: "user-1",
        name: "Project",
        description: null,
        position: 1000,
        archived_at: null,
        created_at: "2026-05-30T00:00:00Z",
        updated_at: "2026-05-30T00:00:00Z",
      },
    ];
    mockState.taskRows = [];
  });

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
    mockState.projects = [
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
    ];

    await expect(
      createProjectTask("user-1", {
        projectId: "missing-project",
        title: "Task",
      }),
    ).rejects.toThrow("Project not found");

    expect(mockState.insertProjectTask).not.toHaveBeenCalled();
  });

  it("rejects a subtask parent that is itself a subtask and does not insert", async () => {
    mockState.taskRows = [
      {
        id: "parent-1",
        project_id: "project-1",
        parent_task_id: null,
        title: "Parent",
        description: null,
        status: "todo",
        position: 1000,
        due_date: null,
        labels: [],
        archived_at: null,
        created_at: "2026-05-30T00:00:00Z",
        updated_at: "2026-05-30T00:00:00Z",
      },
      {
        id: "sub-1",
        project_id: "project-1",
        parent_task_id: "parent-1",
        title: "Subtask",
        description: null,
        status: "todo",
        position: 1000,
        due_date: null,
        labels: [],
        archived_at: null,
        created_at: "2026-05-30T00:00:00Z",
        updated_at: "2026-05-30T00:00:00Z",
      },
    ];

    await expect(
      createProjectTask("user-1", {
        projectId: "project-1",
        parentTaskId: "sub-1",
        title: "Grandchild",
      }),
    ).rejects.toThrow("Parent task not found");

    expect(mockState.insertProjectTask).not.toHaveBeenCalled();
  });

  it("rejects an archived or missing subtask parent and does not insert", async () => {
    mockState.taskRows = [
      {
        id: "archived-parent",
        project_id: "project-1",
        parent_task_id: null,
        title: "Archived",
        description: null,
        status: "todo",
        position: 1000,
        due_date: null,
        labels: [],
        archived_at: "2026-05-30T00:00:00Z",
        created_at: "2026-05-30T00:00:00Z",
        updated_at: "2026-05-30T00:00:00Z",
      },
    ];

    await expect(
      createProjectTask("user-1", {
        projectId: "project-1",
        parentTaskId: "archived-parent",
        title: "Subtask",
      }),
    ).rejects.toThrow("Parent task not found");

    await expect(
      createProjectTask("user-1", {
        projectId: "project-1",
        parentTaskId: "missing-parent",
        title: "Subtask",
      }),
    ).rejects.toThrow("Parent task not found");

    expect(mockState.insertProjectTask).not.toHaveBeenCalled();
  });

  it("rejects a blank project task title before update", async () => {
    await expect(updateProjectTask("user-1", "task-1", { title: "   " })).rejects.toThrow("Task title is required");

    expect(mockState.updateProjectTask).not.toHaveBeenCalled();
  });

  it("rejects a blank checklist title before update", async () => {
    await expect(updateChecklistItem("user-1", "check-1", { title: "   " })).rejects.toThrow("Checklist title is required");

    expect(mockState.updateChecklistItem).not.toHaveBeenCalled();
  });
});
