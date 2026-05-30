import { describe, expect, it } from "vitest";
import { projectTaskMovePatchFromForm } from "../app/projects/actions";
import { positionForProjectDrop } from "../app/projects/project-drop-position";

describe("project web actions", () => {
  it("parses a valid drag/drop move form", () => {
    const form = new FormData();
    form.set("taskId", "task-1");
    form.set("status", "doing");
    form.set("position", "1500");

    expect(projectTaskMovePatchFromForm(form)).toEqual({
      taskId: "task-1",
      status: "doing",
      position: 1500,
    });
  });

  it("rejects inbox lane names as project statuses", () => {
    const form = new FormData();
    form.set("taskId", "task-1");
    form.set("status", "today");
    form.set("position", "1500");

    expect(() => projectTaskMovePatchFromForm(form)).toThrow("Invalid project task status");
  });

  it("rejects missing move positions", () => {
    const form = new FormData();
    form.set("taskId", "task-1");
    form.set("status", "doing");

    expect(() => projectTaskMovePatchFromForm(form)).toThrow("Valid position is required");
  });

  it("rejects blank move positions", () => {
    const form = new FormData();
    form.set("taskId", "task-1");
    form.set("status", "doing");
    form.set("position", "   ");

    expect(() => projectTaskMovePatchFromForm(form)).toThrow("Valid position is required");
  });

  it("computes sparse positions before and after card drops", () => {
    const items = [
      { id: "a", position: 1000 },
      { id: "b", position: 2000 },
      { id: "c", position: 3000 },
    ];

    expect(positionForProjectDrop(items, "c", "b", "before")).toBe(1500);
    expect(positionForProjectDrop(items, "a", "b", "after")).toBe(2500);
    expect(positionForProjectDrop(items, "a", "c", "after")).toBe(4000);
  });

  it("appends sparse positions when dropping on a status column", () => {
    const items = [
      { id: "a", position: 1000 },
      { id: "b", position: 2000 },
    ];

    expect(positionForProjectDrop(items, "a", null, "after")).toBe(3000);
  });
});
