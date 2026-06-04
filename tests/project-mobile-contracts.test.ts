import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildMockProjectBoard,
  createMobileProjectSubtask,
  buildProjectTaskStatusPatch,
  createMobileProjectTask,
  getMobileProjectBoard,
  projectAreaTabs,
  projectStatusTabs,
  resetMockProjectBoard,
  resolveMobileProjectSelection,
  updateMobileProjectArchive,
  updateMobileProjectChecklistItem,
  updateMobileProjectTask,
} from "../mobile/lib/projects-api";

const originalFetch = globalThis.fetch;

afterEach(() => {
  process.env.EXPO_PUBLIC_USE_REAL_BACKEND = undefined;
  process.env.EXPO_PUBLIC_BACKEND_BASE_URL = undefined;
  globalThis.fetch = originalFetch;
  resetMockProjectBoard();
  vi.restoreAllMocks();
});

describe("mobile project contracts", () => {
  it("exposes fixed project area tabs for mobile", () => {
    expect(projectAreaTabs()).toEqual([
      { key: "all", label: "All" },
      { key: "demand", label: "Demand" },
      { key: "delivery", label: "Delivery" },
      { key: "personal", label: "Personal" },
    ]);
  });

  it("exposes fixed status tabs for mobile", () => {
    expect(projectStatusTabs()).toEqual([
      { key: "todo", label: "Today" },
      { key: "doing", label: "Next" },
      { key: "backlog", label: "Later" },
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

  it("loads the mock all-projects board by default", async () => {
    const board = await getMobileProjectBoard();

    expect(board.activeProject).toBeNull();
    expect(board.projects.map((project) => project.area)).toEqual(["demand", "delivery", "personal"]);
    expect(board.tasks[0].project).toMatchObject({ area: "demand", name: "Mobile Project" });
  });

  it("keeps mobile All projects unscoped instead of auto-selecting the first project", async () => {
    const board = await getMobileProjectBoard();
    const deliveryBoard = await getMobileProjectBoard(null, "delivery");

    expect(resolveMobileProjectSelection(board, "all")).toBeNull();
    expect(resolveMobileProjectSelection(deliveryBoard, "delivery")).toBe("project-mobile-delivery");
  });

  it("filters the mock board by project area", async () => {
    const board = await getMobileProjectBoard(null, "delivery");

    expect(board.projects.map((project) => project.area)).toEqual(["delivery"]);
    expect(board.activeProject?.area).toBe("delivery");
    expect(board.tasks).toEqual([]);
  });

  it("builds a mobile status patch without inbox lane fields", () => {
    expect(buildProjectTaskStatusPatch("waiting")).toEqual({ status: "waiting" });
  });

  it("persists a clean mock project task in the mock board", async () => {
    const board = await getMobileProjectBoard(null, "demand");
    const projectId = board.activeProject?.id ?? "";

    const created = await createMobileProjectTask(projectId, "  New mock task  ", "doing");
    const nextBoard = await getMobileProjectBoard(projectId);
    const found = nextBoard.tasks.find((task) => task.id === created.id);

    expect(found).toMatchObject({
      id: created.id,
      project_id: projectId,
      parent_task_id: null,
      title: "New mock task",
      status: "doing",
      labels: [],
      checklist: [],
      subtasks: [],
    });
  });

  it("persists a clean mock project subtask under its parent", async () => {
    const board = await getMobileProjectBoard(null, "demand");
    const parent = board.tasks[0];

    const created = await createMobileProjectSubtask(parent.project_id, parent.id, "  New mock subtask  ");
    const nextBoard = await getMobileProjectBoard(parent.project_id);
    const foundParent = nextBoard.tasks.find((task) => task.id === parent.id);
    const foundSubtask = foundParent?.subtasks.find((subtask) => subtask.id === created.id);

    expect(foundSubtask).toMatchObject({
      id: created.id,
      project_id: parent.project_id,
      parent_task_id: parent.id,
      title: "New mock subtask",
      status: "backlog",
      labels: [],
      checklist: [],
    });
  });

  it("sends parentTaskId when creating a mobile project subtask through the backend", async () => {
    process.env.EXPO_PUBLIC_USE_REAL_BACKEND = "true";
    process.env.EXPO_PUBLIC_BACKEND_BASE_URL = "http://backend.test";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "subtask-1",
        project_id: "project-1",
        parent_task_id: "task-1",
        title: "New subtask",
        description: null,
        status: "backlog",
        position: 1000,
        due_date: null,
        labels: [],
        checklist: [],
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await createMobileProjectSubtask("project-1", "task-1", "New subtask");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://backend.test/api/mobile/projects/project-1/tasks",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ title: "New subtask", status: "backlog", parentTaskId: "task-1" }),
      }),
    );
  });

  it("persists mock status and checklist updates in the mock board", async () => {
    const board = await getMobileProjectBoard();
    const task = board.tasks[0];
    const checklistItem = task.checklist[0];

    await updateMobileProjectTask(task.project_id, task.id, { status: "waiting", title: "Updated title" });
    await updateMobileProjectChecklistItem(task.project_id, task.id, checklistItem.id, { completed: true });
    const nextBoard = await getMobileProjectBoard(task.project_id);
    const updated = nextBoard.tasks.find((candidate) => candidate.id === task.id);

    expect(updated?.status).toBe("waiting");
    expect(updated?.title).toBe("Updated title");
    expect(updated?.checklist.find((item) => item.id === checklistItem.id)?.completed).toBe(true);
  });

  it("uses the project board route when requesting a selected project from the backend", async () => {
    process.env.EXPO_PUBLIC_USE_REAL_BACKEND = "true";
    process.env.EXPO_PUBLIC_BACKEND_BASE_URL = "http://backend.test";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ projects: [], activeProject: null, tasks: [] }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await getMobileProjectBoard("project-1");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://backend.test/api/mobile/projects/project-1/board",
      expect.any(Object),
    );
  });

  it("uses the area query when requesting an area board from the backend", async () => {
    process.env.EXPO_PUBLIC_USE_REAL_BACKEND = "true";
    process.env.EXPO_PUBLIC_BACKEND_BASE_URL = "http://backend.test";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ projects: [], activeProject: null, tasks: [] }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await getMobileProjectBoard(null, "personal");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://backend.test/api/mobile/projects?area=personal",
      expect.any(Object),
    );
  });

  it("uses the archived area query when requesting archived projects from the backend", async () => {
    process.env.EXPO_PUBLIC_USE_REAL_BACKEND = "true";
    process.env.EXPO_PUBLIC_BACKEND_BASE_URL = "http://backend.test";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ projects: [], activeProject: null, tasks: [] }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await getMobileProjectBoard(null, "delivery", true);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://backend.test/api/mobile/projects?area=delivery&archived=1",
      expect.any(Object),
    );
  });

  it("keeps the archived query when requesting a selected archived project from the backend", async () => {
    process.env.EXPO_PUBLIC_USE_REAL_BACKEND = "true";
    process.env.EXPO_PUBLIC_BACKEND_BASE_URL = "http://backend.test";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ projects: [], activeProject: null, tasks: [] }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await getMobileProjectBoard("project-archived", "delivery", true);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://backend.test/api/mobile/projects?area=delivery&archived=1&project=project-archived",
      expect.any(Object),
    );
  });

  it("archives and restores mock projects", async () => {
    const board = await getMobileProjectBoard(null, "demand");
    const projectId = board.activeProject?.id ?? "";

    await updateMobileProjectArchive(projectId, true);
    const archivedBoard = await getMobileProjectBoard(null, "demand", true);
    expect(archivedBoard.projects.map((project) => project.id)).toContain(projectId);

    await updateMobileProjectArchive(projectId, false);
    const activeBoard = await getMobileProjectBoard(null, "demand", false);
    expect(activeBoard.projects.map((project) => project.id)).toContain(projectId);
  });
});
