import { describe, expect, it } from "vitest";
import { PROJECT_STATUS_ORDER, isProjectTaskStatus, statusLabel, compareProjectTaskPositions } from "../lib/projects/status";

describe("project task statuses", () => {
  it("uses the fixed v1 status order", () => {
    expect(PROJECT_STATUS_ORDER).toEqual(["backlog", "todo", "doing", "waiting", "done"]);
  });

  it("validates status strings", () => {
    expect(isProjectTaskStatus("backlog")).toBe(true);
    expect(isProjectTaskStatus("doing")).toBe(true);
    expect(isProjectTaskStatus("today")).toBe(false);
    expect(isProjectTaskStatus("completed")).toBe(false);
  });

  it("returns user-facing labels", () => {
    expect(statusLabel("backlog")).toBe("Backlog");
    expect(statusLabel("todo")).toBe("To Do");
    expect(statusLabel("doing")).toBe("Doing");
    expect(statusLabel("waiting")).toBe("Waiting");
    expect(statusLabel("done")).toBe("Done");
  });

  it("sorts tasks by position then created time", () => {
    const sorted = [
      { id: "b", position: 20, created_at: "2026-05-01T00:00:00Z" },
      { id: "a", position: 10, created_at: "2026-05-02T00:00:00Z" },
      { id: "c", position: 10, created_at: "2026-05-01T00:00:00Z" },
    ].sort(compareProjectTaskPositions);

    expect(sorted.map((task) => task.id)).toEqual(["c", "a", "b"]);
  });
});
