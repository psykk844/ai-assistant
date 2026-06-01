import { describe, expect, it } from "vitest";
import { projectAreaFromForm, projectArchivePatchFromForm, projectTaskFocusPatchFromForm, projectTaskMovePatchFromForm } from "../app/projects/actions";
import { positionForProjectDrop } from "../app/projects/project-drop-position";
import { PROJECT_STATUS_ORDER, statusLabel } from "../lib/projects/status";

describe("project web actions", () => {
  it("parses project area from forms with demand as the default", () => {
    const deliveryForm = new FormData();
    deliveryForm.set("area", "delivery");
    const invalidForm = new FormData();
    invalidForm.set("area", "marketing");

    expect(projectAreaFromForm(deliveryForm)).toBe("delivery");
    expect(projectAreaFromForm(new FormData())).toBe("demand");
    expect(projectAreaFromForm(invalidForm)).toBe("demand");
  });

  it("parses project archive forms", () => {
    const archiveForm = new FormData();
    archiveForm.set("projectId", "project-1");
    archiveForm.set("area", "delivery");
    archiveForm.set("archived", "true");

    const restoreForm = new FormData();
    restoreForm.set("projectId", "project-1");
    restoreForm.set("area", "personal");
    restoreForm.set("archived", "false");

    expect(projectArchivePatchFromForm(archiveForm)).toEqual({
      area: "delivery",
      archived: true,
      projectId: "project-1",
    });
    expect(projectArchivePatchFromForm(restoreForm)).toEqual({
      area: "personal",
      archived: false,
      projectId: "project-1",
    });
    expect(() => projectArchivePatchFromForm(new FormData())).toThrow("Project id is required");
  });

  it("parses project task focus forms", () => {
    const form = new FormData();
    form.set("taskId", "task-1");

    expect(projectTaskFocusPatchFromForm(form)).toEqual({ taskId: "task-1" });
    expect(() => projectTaskFocusPatchFromForm(new FormData())).toThrow("Task id is required");
  });

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

  it("uses planning labels for project status columns without changing stored values", () => {
    expect(PROJECT_STATUS_ORDER).toEqual(["todo", "doing", "backlog", "waiting", "done"]);
    expect(PROJECT_STATUS_ORDER.map(statusLabel)).toEqual(["Today", "Next", "Later", "Waiting", "Done"]);
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
