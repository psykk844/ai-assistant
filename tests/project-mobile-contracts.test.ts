import { describe, expect, it } from "vitest";
import { buildMockProjectBoard, projectStatusTabs } from "../mobile/lib/projects-api";

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
});
