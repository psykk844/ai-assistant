import { describe, expect, it } from "vitest";
import { buildSubtaskTree, flattenTree, getSubtaskProgress } from "../lib/items/subtask-tree";
import type { InboxItem } from "../lib/items/types";

function makeItem(overrides: Partial<InboxItem> & { id: string }): InboxItem {
  return {
    type: "todo",
    title: overrides.id,
    content: "",
    status: "active",
    priority_score: 0.5,
    confidence_score: null,
    needs_review: false,
    created_at: new Date().toISOString(),
    tags: [],
    metadata: null,
    ...overrides,
  };
}

describe("buildSubtaskTree", () => {
  it("returns root items when no parent_item_id is set", () => {
    const items = [makeItem({ id: "a" }), makeItem({ id: "b" })];
    const tree = buildSubtaskTree(items);
    expect(tree).toHaveLength(2);
    expect(tree[0].children).toHaveLength(0);
  });

  it("nests single-level children under their parent", () => {
    const items = [
      makeItem({ id: "parent" }),
      makeItem({ id: "child1", metadata: { parent_item_id: "parent" } }),
      makeItem({ id: "child2", metadata: { parent_item_id: "parent" } }),
    ];
    const tree = buildSubtaskTree(items);
    expect(tree).toHaveLength(1);
    expect(tree[0].item.id).toBe("parent");
    expect(tree[0].children).toHaveLength(2);
    expect(tree[0].depth).toBe(0);
    expect(tree[0].children[0].depth).toBe(1);
  });

  it("builds unlimited nesting depth", () => {
    const items = [
      makeItem({ id: "root" }),
      makeItem({ id: "L1", metadata: { parent_item_id: "root" } }),
      makeItem({ id: "L2", metadata: { parent_item_id: "L1" } }),
      makeItem({ id: "L3", metadata: { parent_item_id: "L2" } }),
    ];
    const tree = buildSubtaskTree(items);
    expect(tree).toHaveLength(1);
    expect(tree[0].children[0].children[0].children[0].item.id).toBe("L3");
    expect(tree[0].children[0].children[0].children[0].depth).toBe(3);
  });

  it("handles orphaned children gracefully (parent not in list)", () => {
    const items = [
      makeItem({ id: "orphan", metadata: { parent_item_id: "missing" } }),
    ];
    const tree = buildSubtaskTree(items);
    expect(tree).toHaveLength(1);
    expect(tree[0].item.id).toBe("orphan");
  });

  it("prevents circular references", () => {
    const items = [
      makeItem({ id: "a", metadata: { parent_item_id: "b" } }),
      makeItem({ id: "b", metadata: { parent_item_id: "a" } }),
    ];
    const tree = buildSubtaskTree(items);
    expect(tree.length).toBeGreaterThanOrEqual(1);
  });

  it("respects subtask_order on parent metadata", () => {
    const items = [
      makeItem({ id: "parent", metadata: { subtask_order: ["child2", "child1"] } }),
      makeItem({ id: "child1", metadata: { parent_item_id: "parent" } }),
      makeItem({ id: "child2", metadata: { parent_item_id: "parent" } }),
    ];
    const tree = buildSubtaskTree(items);
    expect(tree[0].children[0].item.id).toBe("child2");
    expect(tree[0].children[1].item.id).toBe("child1");
  });
});

describe("getSubtaskProgress", () => {
  it("counts completed vs total children recursively", () => {
    const items = [
      makeItem({ id: "parent" }),
      makeItem({ id: "c1", status: "completed", metadata: { parent_item_id: "parent" } }),
      makeItem({ id: "c2", status: "active", metadata: { parent_item_id: "parent" } }),
      makeItem({ id: "c3", status: "completed", metadata: { parent_item_id: "c2" } }),
    ];
    const tree = buildSubtaskTree(items);
    const progress = getSubtaskProgress(tree[0]);
    expect(progress).toEqual({ completed: 2, total: 3 });
  });

  it("returns zero for items with no children", () => {
    const items = [makeItem({ id: "solo" })];
    const tree = buildSubtaskTree(items);
    const progress = getSubtaskProgress(tree[0]);
    expect(progress).toEqual({ completed: 0, total: 0 });
  });
});
