import { describe, expect, it } from "vitest";
import {
  PROJECT_AREA_ORDER,
  PROJECT_STATUS_ORDER,
  areaLabel,
  compareProjectTaskPositions,
  isProjectArea,
  isProjectTaskStatus,
  statusLabel,
} from "../lib/projects/status";

describe("project task statuses", () => {
  it("uses the fixed v1 project areas", () => {
    expect(PROJECT_AREA_ORDER).toEqual(["demand", "delivery", "personal"]);
    expect(areaLabel("demand")).toBe("Demand");
    expect(areaLabel("delivery")).toBe("Delivery");
    expect(areaLabel("personal")).toBe("Personal");
    expect(isProjectArea("demand")).toBe(true);
    expect(isProjectArea("marketing")).toBe(false);
  });

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
