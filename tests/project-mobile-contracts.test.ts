import { afterEach, describe, expect, it, vi } from "vitest";
import { buildMockProjectBoard, getMobileProjectBoard, projectStatusTabs } from "../mobile/lib/projects-api";

const originalFetch = globalThis.fetch;

afterEach(() => {
  process.env.EXPO_PUBLIC_USE_REAL_BACKEND = undefined;
  process.env.EXPO_PUBLIC_BACKEND_BASE_URL = undefined;
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

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
});
