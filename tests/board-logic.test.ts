import { existsSync } from "node:fs";
import { resolve } from "node:path";
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

  it("InboxItem supports tags arrays", () => {
    const item: import("../lib/items/types").InboxItem = {
      id: "tag-1",
      title: "Tagged",
      content: "hello",
      type: "note",
      status: "active",
      priority_score: 0.7,
      confidence_score: 0.9,
      needs_review: false,
      created_at: new Date().toISOString(),
      metadata: {},
      tags: [],
    };

    expect(item.tags).toEqual([]);
  });

  it("includes a suggest-tags API route file", () => {
    expect(existsSync(resolve(process.cwd(), "app/api/suggest-tags/route.ts"))).toBe(true);
  });

  it("filters board items by active tag when present", async () => {
    const { filterBoardItems } = await import("../app/app/board-logic");

    const items = [
      {
        id: "1",
        title: "One",
        content: "alpha",
        type: "note",
        status: "active",
        priority_score: 0.8,
        confidence_score: 0.9,
        needs_review: false,
        created_at: new Date().toISOString(),
        metadata: {},
        tags: ["work", "ai"],
      },
      {
        id: "2",
        title: "Two",
        content: "beta",
        type: "todo",
        status: "active",
        priority_score: 0.5,
        confidence_score: 0.9,
        needs_review: false,
        created_at: new Date().toISOString(),
        metadata: {},
        tags: ["home"],
      },
    ];

    expect(filterBoardItems(items as never, "all", "work").map((item) => item.id)).toEqual(["1"]);
  });

  it("normalizes rows without tags to an empty array", async () => {
    const { normalizeItemTags } = await import("../app/app/board-logic");

    expect(normalizeItemTags({ id: "1", content: "x" } as { id: string; content: string; tags?: string[] | null })).toMatchObject({ tags: [] });
    expect(normalizeItemTags({ id: "2", content: "x", tags: ["work"] } as { id: string; content: string; tags?: string[] | null })).toMatchObject({ tags: ["work"] });
  });

  it("moves completed items out of active board lanes", async () => {
    const { laneFromItem } = await import("../lib/items/lane");

    const item = {
      id: "done-1",
      title: "Done",
      content: "finished",
      type: "todo",
      status: "completed",
      priority_score: 0.85,
      confidence_score: 0.9,
      needs_review: false,
      created_at: new Date().toISOString(),
      metadata: {},
      tags: [],
    };

    expect(laneFromItem(item as never)).toBe("backlog");
  });

  it("keeps completed items out of the all-board filter so they disappear from Today immediately", async () => {
    const { filterBoardItems } = await import("../app/app/board-logic");

    const items = [
      {
        id: "active-today",
        title: "Active",
        content: "still today",
        type: "todo",
        status: "active",
        priority_score: 0.85,
        confidence_score: 0.9,
        needs_review: false,
        created_at: new Date().toISOString(),
        metadata: {},
        tags: [],
      },
      {
        id: "completed-now",
        title: "Done",
        content: "was today",
        type: "todo",
        status: "completed",
        priority_score: 0.85,
        confidence_score: 0.9,
        needs_review: false,
        created_at: new Date().toISOString(),
        metadata: {},
        tags: [],
      },
    ];

    expect(filterBoardItems(items as never, "all", null).map((item) => item.id)).toEqual(["active-today"]);
  });

  it("excludes completed items from type-based filters (todo, note, link)", async () => {
    const { filterBoardItems } = await import("../app/app/board-logic");

    const items = [
      {
        id: "active-todo",
        title: "Active todo",
        content: "still active",
        type: "todo",
        status: "active",
        priority_score: 0.85,
        confidence_score: 0.9,
        needs_review: false,
        created_at: new Date().toISOString(),
        metadata: {},
        tags: [],
      },
      {
        id: "completed-todo",
        title: "Completed todo",
        content: "done",
        type: "todo",
        status: "completed",
        priority_score: 0.85,
        confidence_score: 0.9,
        needs_review: false,
        created_at: new Date().toISOString(),
        metadata: {},
        tags: [],
      },
      {
        id: "active-note",
        title: "Active note",
        content: "still active",
        type: "note",
        status: "active",
        priority_score: 0.7,
        confidence_score: 0.9,
        needs_review: false,
        created_at: new Date().toISOString(),
        metadata: {},
        tags: [],
      },
      {
        id: "completed-note",
        title: "Completed note",
        content: "done",
        type: "note",
        status: "completed",
        priority_score: 0.7,
        confidence_score: 0.9,
        needs_review: false,
        created_at: new Date().toISOString(),
        metadata: {},
        tags: [],
      },
    ];

    // Type filters should only show active items of that type
    expect(filterBoardItems(items as never, "todo", null).map((i) => i.id)).toEqual(["active-todo"]);
    expect(filterBoardItems(items as never, "note", null).map((i) => i.id)).toEqual(["active-note"]);
  });

  it("uses a dedicated drag handle class so action buttons remain clickable", async () => {
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile(resolve(process.cwd(), "app/app/board-client.tsx"), "utf8"),
    );

    expect(source).toContain("data-drag-handle");
    expect(source).not.toContain("cursor-grab active:cursor-grabbing select-none");
  });
});
