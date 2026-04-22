import { describe, expect, it } from "vitest";
import { getDragActivationDistance, isTrash, shouldHideFromInitialBoard } from "../app/app/board-logic";

describe("board logic regressions", () => {
  it("treats archived items with deleted_at timestamps as trash even when metadata comes from json serialization", () => {
    const item = {
      id: "1",
      title: "Example",
      content: "hello",
      type: "note",
      status: "archived",
      priority_score: 0.4,
      confidence_score: 0.9,
      needs_review: false,
      created_at: new Date().toISOString(),
      metadata: { deleted_at: new Date().toISOString(), dismissed: true },
    };

    expect(isTrash(item as never)).toBe(true);
  });


  it("keeps trashed items available to the trash view instead of filtering them out during initial board load", () => {
    const item = {
      id: "trash-1",
      title: "Example",
      content: "hello",
      type: "note",
      status: "archived",
      priority_score: 0.4,
      confidence_score: 0.9,
      needs_review: false,
      created_at: new Date().toISOString(),
      metadata: { deleted_at: new Date().toISOString(), dismissed: true },
    };

    expect(shouldHideFromInitialBoard(item as never)).toBe(false);
  });

  it("uses a small activation distance so clicks still work but drag starts on slight move", () => {
    const dist = getDragActivationDistance();
    expect(dist).toBeGreaterThan(0);
    expect(dist).toBeLessThanOrEqual(10);
  });

  it("provides an accessible drag label for the card", async () => {
    const { getDragHandleLabel } = await import("../app/app/board-logic");

    const item = {
      id: "drag-1",
      title: "Drag me",
      content: "hello",
      type: "note",
      status: "active",
      priority_score: 0.7,
      confidence_score: 0.9,
      needs_review: false,
      created_at: new Date().toISOString(),
      metadata: {},
    };

    expect(getDragHandleLabel(item as never)).toBe("Drag item Drag me");
  });
});
