import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildMockProjectBoard,
  buildProjectTaskStatusPatch,
  createMobileProjectTask,
  getMobileProjectBoard,
  projectAreaTabs,
  projectStatusTabs,
  resetMockProjectBoard,
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
      { key: "demand", label: "Demand" },
      { key: "delivery", label: "Delivery" },
      { key: "personal", label: "Personal" },
    ]);
  });

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
    const board = await getMobileProjectBoard();
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
});
