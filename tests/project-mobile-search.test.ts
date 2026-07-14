import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { filterMobileProjectTasks } from "../mobile/lib/project-search";
import { buildMockProjectBoard } from "../mobile/lib/projects-api";

describe("mobile project search", () => {
  it("finds tasks through project, notes, labels, checklist, and subtask content", async () => {
    const board = await buildMockProjectBoard();

    expect(filterMobileProjectTasks(board.tasks, "mobile project").map((task) => task.id)).toEqual(["task-mobile-demo"]);
    expect(filterMobileProjectTasks(board.tasks, "contracts before").map((task) => task.id)).toEqual(["task-mobile-demo"]);
    expect(filterMobileProjectTasks(board.tasks, "confirm route payload").map((task) => task.id)).toEqual([
      "task-mobile-demo",
    ]);
    expect(filterMobileProjectTasks(board.tasks, "api client mock").map((task) => task.id)).toEqual(["task-mobile-demo"]);
    expect(filterMobileProjectTasks(board.tasks, "does not exist")).toEqual([]);
  });

  it("keeps all tasks for a blank search and exposes the Projects search input", async () => {
    const board = await buildMockProjectBoard();
    const screenSource = await readFile(path.join(process.cwd(), "mobile", "app", "(tabs)", "projects.tsx"), "utf8");

    expect(filterMobileProjectTasks(board.tasks, "   ")).toEqual(board.tasks);
    expect(screenSource).toContain('accessibilityLabel="Search project tasks"');
    expect(screenSource).toContain('placeholder="Search projects and tasks"');
  });
});
