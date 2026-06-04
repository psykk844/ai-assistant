import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  projects: [] as Array<Record<string, unknown>>,
  tasks: [] as Array<Record<string, unknown>>,
  checklist: [] as Array<Record<string, unknown>>,
}));

function seedProjectData() {
  db.projects = [
    {
      id: "project-1",
      user_id: "user-1",
      area: "demand",
      name: "Todo App",
      description: null,
      position: 1000,
      archived_at: null,
      created_at: "2026-05-30T00:00:00Z",
      updated_at: "2026-05-30T00:00:00Z",
    },
    {
      id: "project-2",
      user_id: "user-1",
      area: "delivery",
      name: "Second Project",
      description: null,
      position: 2000,
      archived_at: null,
      created_at: "2026-05-30T00:00:00Z",
      updated_at: "2026-05-30T00:00:00Z",
    },
    {
      id: "project-3",
      user_id: "user-1",
      area: "delivery",
      name: "Archived Delivery Project",
      description: null,
      position: 3000,
      archived_at: "2026-05-31T00:00:00Z",
      created_at: "2026-05-30T00:00:00Z",
      updated_at: "2026-05-30T00:00:00Z",
    },
  ];
  db.tasks = [
    {
      id: "task-1",
      user_id: "user-1",
      project_id: "project-1",
      parent_task_id: null,
      title: "Task",
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
      id: "subtask-1",
      user_id: "user-1",
      project_id: "project-1",
      parent_task_id: "task-1",
      title: "Subtask",
      description: null,
      status: "doing",
      position: 1000,
      due_date: null,
      labels: [],
      archived_at: null,
      created_at: "2026-05-30T00:00:00Z",
      updated_at: "2026-05-30T00:00:00Z",
    },
    {
      id: "task-2",
      user_id: "user-1",
      project_id: "project-2",
      parent_task_id: null,
      title: "Other project task",
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
  db.checklist = [
    {
      id: "item-1",
      user_id: "user-1",
      task_id: "task-1",
      title: "Checklist item",
      completed: false,
      position: 1000,
      created_at: "2026-05-30T00:00:00Z",
      updated_at: "2026-05-30T00:00:00Z",
    },
    {
      id: "item-2",
      user_id: "user-1",
      task_id: "subtask-1",
      title: "Subtask checklist item",
      completed: false,
      position: 1000,
      created_at: "2026-05-30T00:00:00Z",
      updated_at: "2026-05-30T00:00:00Z",
    },
  ];
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from(table: string) {
      const filters: Array<{ column: string; value: unknown; op: "eq" | "is" | "not-is" | "in" }> = [];
      let insertPayload: Record<string, unknown> | null = null;
      let updatePayload: Record<string, unknown> | null = null;
      let deleteRequested = false;

      function tableRows() {
        if (table === "projects") return db.projects;
        if (table === "project_tasks") return db.tasks;
        if (table === "project_checklist_items") return db.checklist;
        return [];
      }

      function applyFilters(rows: Array<Record<string, unknown>>) {
        return rows.filter((row) =>
          filters.every((filter) => {
            if (filter.op === "is") return row[filter.column] === filter.value;
            if (filter.op === "not-is") return row[filter.column] !== filter.value;
            if (filter.op === "in") return Array.isArray(filter.value) && filter.value.includes(row[filter.column]);
            return row[filter.column] === filter.value;
          }),
        );
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
        in(column: string, value: unknown[]) {
          filters.push({ column, value, op: "in" });
          return query;
        },
        not(column: string, operator: string, value: unknown) {
          filters.push({ column, value, op: operator === "is" ? "not-is" : "eq" });
          return query;
        },
        order() {
          return query;
        },
        insert(payload: Record<string, unknown>) {
          insertPayload = payload;
          return query;
        },
        update(payload: Record<string, unknown>) {
          updatePayload = payload;
          return query;
        },
        delete() {
          deleteRequested = true;
          return query;
        },
        single() {
          if (insertPayload) {
            const row = {
              id: `inserted-${table}`,
              ...insertPayload,
              created_at: "2026-05-30T00:00:00Z",
              updated_at: "2026-05-30T00:00:00Z",
            };
            return Promise.resolve({ data: row, error: null });
          }

          const rows = applyFilters(tableRows());
          const row = rows[0];
          if (!row) return Promise.resolve({ data: null, error: { message: "not found" } });

          if (updatePayload) {
            return Promise.resolve({ data: { ...row, ...updatePayload }, error: null });
          }

          return Promise.resolve({ data: row, error: null });
        },
        then(resolve: (value: unknown) => void) {
          if (deleteRequested) {
            const rows = applyFilters(tableRows());
            if (table === "project_checklist_items") {
              db.checklist = db.checklist.filter((row) => !rows.some((candidate) => candidate.id === row.id));
            }
            resolve({ data: null, error: null });
            return;
          }
          resolve({ data: applyFilters(tableRows()), error: null });
        },
      };
      return query;
    },
  }),
}));

describe("mobile project routes", () => {
  beforeEach(() => {
    vi.resetModules();
    seedProjectData();
    process.env.MOBILE_DEV_API_KEY = "test-mobile-key";
    process.env.MOBILE_DEV_USER_ID = "user-1";
  });

  it("returns the project board payload", async () => {
    const { GET } = await import("../app/api/mobile/projects/route");
    const response = await GET(
      new Request("http://localhost/api/mobile/projects", {
        headers: { "x-mobile-dev-key": "test-mobile-key" },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.activeProject).toBeNull();
    expect(body.projects[0].name).toBe("Todo App");
    expect(body.tasks.map((task: { id: string; project?: { area: string } }) => [task.id, task.project?.area])).toEqual([
      ["task-1", "demand"],
      ["task-2", "delivery"],
    ]);
  });

  it("filters mobile projects by area", async () => {
    const { GET } = await import("../app/api/mobile/projects/route");
    const response = await GET(
      new Request("http://localhost/api/mobile/projects?area=delivery", {
        headers: { "x-mobile-dev-key": "test-mobile-key" },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.projects.map((project: { name: string }) => project.name)).toEqual(["Second Project"]);
    expect(body.activeProject.name).toBe("Second Project");
    expect(body.tasks.map((task: { title: string }) => task.title)).toEqual(["Other project task"]);
  });

  it("returns archived mobile projects separately by area", async () => {
    const { GET } = await import("../app/api/mobile/projects/route");
    const response = await GET(
      new Request("http://localhost/api/mobile/projects?area=delivery&archived=1", {
        headers: { "x-mobile-dev-key": "test-mobile-key" },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.projects.map((project: { name: string }) => project.name)).toEqual(["Archived Delivery Project"]);
    expect(body.activeProject.name).toBe("Archived Delivery Project");
    expect(body.tasks).toEqual([]);
  });

  it("archives and restores projects from the mobile route", async () => {
    const { PATCH } = await import("../app/api/mobile/projects/route");

    const archiveResponse = await PATCH(
      new Request("http://localhost/api/mobile/projects", {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-mobile-dev-key": "test-mobile-key" },
        body: JSON.stringify({ projectId: "project-2", archived: true }),
      }),
    );
    const archived = await archiveResponse.json();

    const restoreResponse = await PATCH(
      new Request("http://localhost/api/mobile/projects", {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-mobile-dev-key": "test-mobile-key" },
        body: JSON.stringify({ projectId: "project-3", archived: false }),
      }),
    );
    const restored = await restoreResponse.json();

    expect(archiveResponse.status).toBe(200);
    expect(archived.archived_at).toEqual(expect.any(String));
    expect(restoreResponse.status).toBe(200);
    expect(restored.archived_at).toBeNull();
  });

  it("returns unauthorized with CORS headers when mobile auth is missing", async () => {
    const { GET } = await import("../app/api/mobile/projects/route");
    const response = await GET(new Request("http://localhost/api/mobile/projects"));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("unauthorized");
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("allows PATCH and POST in preflight responses", async () => {
    const { OPTIONS } = await import("../app/api/mobile/projects/[projectId]/tasks/[taskId]/checklist/route");
    const response = OPTIONS(
      new Request("http://localhost/api/mobile/projects/project-1/tasks/task-1/checklist", {
        method: "OPTIONS",
      }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-methods")).toContain("PATCH");
    expect(response.headers.get("access-control-allow-methods")).toContain("POST");
    expect(response.headers.get("access-control-allow-methods")).toContain("DELETE");
  });

  it("returns 404 for an invalid project board route instead of a fallback project", async () => {
    const { GET } = await import("../app/api/mobile/projects/[projectId]/board/route");
    const response = await GET(
      new Request("http://localhost/api/mobile/projects/project-missing/board", {
        headers: { "x-mobile-dev-key": "test-mobile-key" },
      }),
      { params: Promise.resolve({ projectId: "project-missing" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("not found");
  });

  it("finds a subtask from the task detail route", async () => {
    const { GET } = await import("../app/api/mobile/projects/[projectId]/tasks/[taskId]/route");
    const response = await GET(
      new Request("http://localhost/api/mobile/projects/project-1/tasks/subtask-1", {
        headers: { "x-mobile-dev-key": "test-mobile-key" },
      }),
      { params: Promise.resolve({ projectId: "project-1", taskId: "subtask-1" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.id).toBe("subtask-1");
    expect(body.parent_task_id).toBe("task-1");
  });

  it("rejects task PATCH when the task is missing from the route project", async () => {
    const { PATCH } = await import("../app/api/mobile/projects/[projectId]/tasks/[taskId]/route");
    const response = await PATCH(
      new Request("http://localhost/api/mobile/projects/project-1/tasks/task-2", {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-mobile-dev-key": "test-mobile-key" },
        body: JSON.stringify({ title: "Should not update" }),
      }),
      { params: Promise.resolve({ projectId: "project-1", taskId: "task-2" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("not found");
  });

  it("returns 400 JSON with CORS for invalid task status", async () => {
    const { POST } = await import("../app/api/mobile/projects/[projectId]/tasks/route");
    const response = await POST(
      new Request("http://localhost/api/mobile/projects/project-1/tasks", {
        method: "POST",
        headers: { "content-type": "application/json", "x-mobile-dev-key": "test-mobile-key" },
        body: JSON.stringify({ title: "New task", status: "blocked" }),
      }),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Invalid project task status");
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("maps blank task title repository validation errors to 400 JSON with CORS", async () => {
    const { POST } = await import("../app/api/mobile/projects/[projectId]/tasks/route");
    const response = await POST(
      new Request("http://localhost/api/mobile/projects/project-1/tasks", {
        method: "POST",
        headers: { "content-type": "application/json", "x-mobile-dev-key": "test-mobile-key" },
        body: JSON.stringify({ title: "   ", status: "todo" }),
      }),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Task title is required");
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("rejects checklist PATCH when the item is not on the route task", async () => {
    const { PATCH } = await import("../app/api/mobile/projects/[projectId]/tasks/[taskId]/checklist/route");
    const response = await PATCH(
      new Request("http://localhost/api/mobile/projects/project-1/tasks/task-1/checklist", {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-mobile-dev-key": "test-mobile-key" },
        body: JSON.stringify({ itemId: "item-2", completed: true }),
      }),
      { params: Promise.resolve({ projectId: "project-1", taskId: "task-1" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("not found");
  });

  it("returns 400 JSON with CORS when checklist PATCH is missing itemId", async () => {
    const { PATCH } = await import("../app/api/mobile/projects/[projectId]/tasks/[taskId]/checklist/route");
    const response = await PATCH(
      new Request("http://localhost/api/mobile/projects/project-1/tasks/task-1/checklist", {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-mobile-dev-key": "test-mobile-key" },
        body: JSON.stringify({ completed: true }),
      }),
      { params: Promise.resolve({ projectId: "project-1", taskId: "task-1" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("itemId is required");
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("archives a task or subtask from the mobile task route", async () => {
    const { PATCH } = await import("../app/api/mobile/projects/[projectId]/tasks/[taskId]/route");
    const response = await PATCH(
      new Request("http://localhost/api/mobile/projects/project-1/tasks/subtask-1", {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-mobile-dev-key": "test-mobile-key" },
        body: JSON.stringify({ archived: true }),
      }),
      { params: Promise.resolve({ projectId: "project-1", taskId: "subtask-1" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.id).toBe("subtask-1");
    expect(body.archived_at).toEqual(expect.any(String));
  });

  it("deletes checklist items from the mobile checklist route", async () => {
    const { DELETE } = await import("../app/api/mobile/projects/[projectId]/tasks/[taskId]/checklist/route");
    const response = await DELETE(
      new Request("http://localhost/api/mobile/projects/project-1/tasks/task-1/checklist", {
        method: "DELETE",
        headers: { "content-type": "application/json", "x-mobile-dev-key": "test-mobile-key" },
        body: JSON.stringify({ itemId: "item-1" }),
      }),
      { params: Promise.resolve({ projectId: "project-1", taskId: "task-1" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(db.checklist.some((item) => item.id === "item-1")).toBe(false);
  });

  it("rejects checklist DELETE when the item is not on the route task", async () => {
    const { DELETE } = await import("../app/api/mobile/projects/[projectId]/tasks/[taskId]/checklist/route");
    const response = await DELETE(
      new Request("http://localhost/api/mobile/projects/project-1/tasks/task-1/checklist", {
        method: "DELETE",
        headers: { "content-type": "application/json", "x-mobile-dev-key": "test-mobile-key" },
        body: JSON.stringify({ itemId: "item-2" }),
      }),
      { params: Promise.resolve({ projectId: "project-1", taskId: "task-1" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("not found");
    expect(db.checklist.some((item) => item.id === "item-2")).toBe(true);
  });
});
