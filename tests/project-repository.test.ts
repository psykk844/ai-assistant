import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, ProjectChecklistItem, ProjectTask } from "../lib/projects/types";
import {
  addProjectTaskFocus,
  buildProjectTaskNodes,
  completeFocusedProjectTask,
  createProjectTask,
  listFocusedProjectTasks,
  listProjects,
  nextProjectPosition,
  nextTaskPosition,
  removeProjectTaskFocus,
  sanitizeProjectLabels,
  updateProjectArchive,
  updateChecklistItem,
  updateProjectTask,
} from "../lib/projects/repository";

const mockState = vi.hoisted(() => ({
  insertProjectTask: vi.fn(),
  updateProject: vi.fn(),
  updateChecklistItem: vi.fn(),
  updateProjectTask: vi.fn(),
  insertProjectFocus: vi.fn(),
  deleteProjectFocus: vi.fn(),
  projects: [] as Project[],
  taskRows: [] as ProjectTask[],
  focusRows: [] as Array<{
    id: string;
    user_id: string;
    project_task_id: string;
    lane: "today";
    my_day_order: number | null;
    created_at: string;
    updated_at: string;
  }>,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from(table: string) {
      const filters: Array<{ column: string; value: unknown; op: "eq" | "is" | "not-is" | "in" }> = [];
      let deleteRequested = false;
      function matches(row: Record<string, unknown>) {
        return filters.every((filter) => {
          if (filter.column === "user_id" && !(filter.column in row)) return true;
          const value = row[filter.column];
          if (filter.op === "not-is") return value !== filter.value;
          if (filter.op === "in") return Array.isArray(filter.value) && filter.value.includes(value);
          return value === filter.value;
        });
      }
      const query = {
        select() {
          return query;
        },
        eq(column: string, value: unknown) {
          filters.push({ column, value, op: "eq" });
          return query;
        },
        is(column: string, value: unknown) {
          filters.push({ column, value, op: "is" });
          return query;
        },
        not(column: string, op: string, value: unknown) {
          if (op === "is") filters.push({ column, value, op: "not-is" });
          return query;
        },
        order() {
          return query;
        },
        in(column: string, value: unknown[]) {
          filters.push({ column, value, op: "in" });
          return query;
        },
        insert(payload: unknown) {
          if (table === "project_tasks") mockState.insertProjectTask(payload);
          if (table === "project_task_focus") mockState.insertProjectFocus(payload);
          return query;
        },
        update(payload: unknown) {
          if (table === "projects") mockState.updateProject(payload);
          if (table === "project_tasks") mockState.updateProjectTask(payload);
          if (table === "project_checklist_items") mockState.updateChecklistItem(payload);
          return query;
        },
        delete() {
          deleteRequested = true;
          return query;
        },
        single() {
          if (table === "projects") {
            const row = mockState.projects.find((project) =>
              matches(project as unknown as Record<string, unknown>),
            );
            return Promise.resolve({
              data: row ? { ...row, ...mockState.updateProject.mock.calls.at(-1)?.[0] } : null,
              error: row ? null : { message: "not found" },
            });
          }

          if (table === "project_task_focus") {
            const payload = mockState.insertProjectFocus.mock.calls.at(-1)?.[0] as Record<string, unknown> | undefined;
            return Promise.resolve({
              data: payload
                ? {
                    id: "focus-1",
                    lane: "today",
                    my_day_order: null,
                    created_at: "2026-06-01T00:00:00Z",
                    updated_at: "2026-06-01T00:00:00Z",
                    ...payload,
                  }
                : null,
              error: payload ? null : { message: "missing row" },
            });
          }

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

          if (table === "project_tasks") {
            const row = mockState.taskRows.find((task) => matches(task as unknown as Record<string, unknown>));
            if (mockState.updateProjectTask.mock.calls.length > 0 && row) {
              return Promise.resolve({
                data: { ...row, ...mockState.updateProjectTask.mock.calls.at(-1)?.[0] },
                error: null,
              });
            }
            if (row) return Promise.resolve({ data: row, error: null });
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
          if (deleteRequested && table === "project_task_focus") {
            mockState.deleteProjectFocus(filters);
            resolve({ data: null, error: null });
            return;
          }

          if (table === "projects") {
            resolve({
              data: mockState.projects.filter((project) =>
                matches(project as unknown as Record<string, unknown>),
              ),
              error: null,
            });
            return;
          }

          if (table === "project_tasks") {
            resolve({ data: mockState.taskRows.filter((task) => matches(task as unknown as Record<string, unknown>)), error: null });
            return;
          }

          if (table === "project_task_focus") {
            resolve({
              data: mockState.focusRows.filter((row) => matches(row as unknown as Record<string, unknown>)),
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
  beforeEach(() => {
    mockState.insertProjectTask.mockClear();
    mockState.updateProject.mockClear();
    mockState.updateChecklistItem.mockClear();
    mockState.updateProjectTask.mockClear();
    mockState.insertProjectFocus.mockClear();
    mockState.deleteProjectFocus.mockClear();
    mockState.projects = [
      {
        id: "project-1",
        user_id: "user-1",
        area: "demand",
        name: "Project",
        description: null,
        position: 1000,
        archived_at: null,
        created_at: "2026-05-30T00:00:00Z",
        updated_at: "2026-05-30T00:00:00Z",
      },
    ];
    mockState.taskRows = [];
    mockState.focusRows = [];
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

  it("filters projects by area before ordering", async () => {
    mockState.projects = [
      {
        id: "demand-project",
        user_id: "user-1",
        area: "demand",
        name: "Demand",
        description: null,
        position: 1000,
        archived_at: null,
        created_at: "2026-05-30T00:00:00Z",
        updated_at: "2026-05-30T00:00:00Z",
      },
      {
        id: "delivery-project",
        user_id: "user-1",
        area: "delivery",
        name: "Delivery",
        description: null,
        position: 1000,
        archived_at: null,
        created_at: "2026-05-30T00:00:00Z",
        updated_at: "2026-05-30T00:00:00Z",
      },
    ];

    const projects = await listProjects("user-1", "delivery");

    expect(projects.map((project) => project.id)).toEqual(["delivery-project"]);
  });

  it("lists archived projects separately from active projects", async () => {
    mockState.projects = [
      {
        id: "active-project",
        user_id: "user-1",
        area: "delivery",
        name: "Active",
        description: null,
        position: 1000,
        archived_at: null,
        created_at: "2026-05-30T00:00:00Z",
        updated_at: "2026-05-30T00:00:00Z",
      },
      {
        id: "archived-project",
        user_id: "user-1",
        area: "delivery",
        name: "Archived",
        description: null,
        position: 2000,
        archived_at: "2026-05-31T00:00:00Z",
        created_at: "2026-05-30T00:00:00Z",
        updated_at: "2026-05-30T00:00:00Z",
      },
    ];

    await expect(listProjects("user-1", "delivery")).resolves.toMatchObject([{ id: "active-project" }]);
    await expect(listProjects("user-1", "delivery", { archived: true })).resolves.toMatchObject([
      { id: "archived-project" },
    ]);
  });

  it("archives and restores projects by writing archived_at only on owned project rows", async () => {
    const archived = await updateProjectArchive("user-1", "project-1", true);
    const restored = await updateProjectArchive("user-1", "project-1", false);

    expect(archived.archived_at).toEqual(expect.any(String));
    expect(restored.archived_at).toBeNull();
    expect(mockState.updateProject).toHaveBeenCalledTimes(2);
    expect(mockState.updateProject.mock.calls[0][0]).toMatchObject({ archived_at: expect.any(String) });
    expect(mockState.updateProject.mock.calls[1][0]).toMatchObject({ archived_at: null });
  });

  it("adds, lists, removes, and completes focused project tasks for My Day", async () => {
    mockState.taskRows = [
      {
        id: "task-1",
        project_id: "project-1",
        parent_task_id: null,
        title: "Project task",
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
    mockState.focusRows = [
      {
        id: "focus-1",
        user_id: "user-1",
        project_task_id: "task-1",
        lane: "today",
        my_day_order: null,
        created_at: "2026-06-01T00:00:00Z",
        updated_at: "2026-06-01T00:00:00Z",
      },
    ];

    await expect(addProjectTaskFocus("user-1", "task-1")).resolves.toMatchObject({
      project_task_id: "task-1",
      lane: "today",
    });

    await expect(listFocusedProjectTasks("user-1")).resolves.toMatchObject([
      {
        focus: { project_task_id: "task-1" },
        project: { id: "project-1", name: "Project" },
        task: { id: "task-1", title: "Project task" },
      },
    ]);

    await removeProjectTaskFocus("user-1", "task-1");
    expect(mockState.deleteProjectFocus).toHaveBeenCalled();

    await completeFocusedProjectTask("user-1", "task-1");
    expect(mockState.updateProjectTask).toHaveBeenCalledWith(expect.objectContaining({ status: "done" }));
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
        area: "demand",
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
