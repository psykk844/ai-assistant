import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { filterBoardItems, getDragActivationDistance, isSubtask, isTrash, shouldHideFromInitialBoard } from "../app/app/board-logic";

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

  it("falls back to metadata tags when the tags column is unavailable", async () => {
    const { normalizeItemTags } = await import("../app/app/board-logic");

    expect(
      normalizeItemTags({
        id: "3",
        content: "x",
        metadata: { tags: ["work", "AI"] },
      } as { id: string; content: string; metadata?: Record<string, unknown>; tags?: string[] | null }),
    ).toMatchObject({ tags: ["work", "ai"] });
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

  // REGRESSION: subtasks must never appear as standalone cards on the board.
  // When they did, parent tasks looked "lost" and lanes filled with fragments.
  // See progress.md 2026-04-24.
  it("isSubtask returns true only when metadata.parent_item_id is a non-empty string", () => {
    expect(isSubtask({ metadata: { parent_item_id: "abc-123" } } as never)).toBe(true);
    expect(isSubtask({ metadata: { parent_item_id: "" } } as never)).toBe(false);
    expect(isSubtask({ metadata: {} } as never)).toBe(false);
    expect(isSubtask({ metadata: null } as never)).toBe(false);
    expect(isSubtask({} as never)).toBe(false);
  });

  it("filterBoardItems excludes subtasks from every active filter so parents are never visually 'lost'", () => {
    const items = [
      {
        id: "parent-1",
        title: "Finish YouTube Studio project",
        content: "",
        type: "todo",
        status: "active",
        priority_score: 0.7,
        confidence_score: null,
        needs_review: false,
        created_at: new Date().toISOString(),
        metadata: {},
        tags: [],
      },
      {
        id: "sub-1",
        title: "thumbnail",
        content: "",
        type: "todo",
        status: "active",
        priority_score: 0.7,
        confidence_score: null,
        needs_review: false,
        created_at: new Date().toISOString(),
        metadata: { parent_item_id: "parent-1" },
        tags: [],
      },
      {
        id: "other-todo",
        title: "Unrelated todo",
        content: "",
        type: "todo",
        status: "active",
        priority_score: 0.5,
        confidence_score: null,
        needs_review: false,
        created_at: new Date().toISOString(),
        metadata: {},
        tags: [],
      },
    ];

    // Every filter that returns active items must exclude subtasks.
    expect(filterBoardItems(items as never, "all", null).map((i) => i.id)).toEqual(["parent-1", "other-todo"]);
    expect(filterBoardItems(items as never, "active", null).map((i) => i.id)).toEqual(["parent-1", "other-todo"]);
    expect(filterBoardItems(items as never, "todo", null).map((i) => i.id)).toEqual(["parent-1", "other-todo"]);
  });

  // REGRESSION: subtask checkboxes on My Day and the board's SubtaskTreePanel
  // must send the form field named "status" (matching updateItemStatus), NOT
  // "newStatus". Previously both used "newStatus" → the action's validation
  // rejected the call silently, making the checkboxes do nothing.
  // See progress.md 2026-04-24.
  it("subtask checkbox clients send form field named 'status' (not 'newStatus')", async () => {
    const fs = await import("node:fs/promises");
    const myDay = await fs.readFile(resolve(process.cwd(), "app/app/my-day/my-day-client.tsx"), "utf8");
    const subtaskTree = await fs.readFile(resolve(process.cwd(), "app/app/subtask-tree.tsx"), "utf8");

    for (const [name, source] of [["my-day-client", myDay], ["subtask-tree", subtaskTree]] as const) {
      // Must use the correct field name
      expect(source, `${name} should set form field "status"`).toMatch(/form\.set\(\s*["']status["']/);
      // Must NOT use the buggy field name
      expect(source, `${name} must not set form field "newStatus"`).not.toMatch(/form\.set\(\s*["']newStatus["']/);
    }
  });
});
