import { describe, expect, it } from "vitest";
import { computeMyDayPlan, planMyDayReorder, MY_DAY_CAP } from "../lib/items/my-day-plan";
import type { InboxItem } from "../lib/items/types";

function mk(id: string, prio: number, opts: Partial<InboxItem> = {}): InboxItem {
  return {
    id,
    type: "todo",
    title: id,
    content: id,
    status: "active",
    priority_score: prio,
    confidence_score: null,
    needs_review: false,
    created_at: "2026-04-24T00:00:00Z",
    metadata: opts.metadata ?? {},
    tags: [],
    ...opts,
  };
}

describe("computeMyDayPlan", () => {
  it("returns up to 5 today items as top5 and up to 5 next items as next5", () => {
    const items = [
      mk("t1", 0.85),
      mk("t2", 0.85),
      mk("n1", 0.7),
      mk("n2", 0.7),
      mk("u1", 0.55),
    ];
    const plan = computeMyDayPlan(items);
    expect(plan.top5.map((i) => i.id)).toEqual(["t1", "t2"]);
    expect(plan.next5.map((i) => i.id)).toEqual(["n1", "n2"]);
    expect(plan.overflow.map((i) => i.id)).toEqual(["u1"]);
  });

  it("respects metadata.my_day_order for sorting within a lane", () => {
    const items = [
      mk("a", 0.85, { metadata: { my_day_order: 2 } }),
      mk("b", 0.85, { metadata: { my_day_order: 0 } }),
      mk("c", 0.85, { metadata: { my_day_order: 1 } }),
    ];
    const plan = computeMyDayPlan(items);
    expect(plan.top5.map((i) => i.id)).toEqual(["b", "c", "a"]);
  });

  it("cascades overflow from today (>5) into the front of next5", () => {
    const items = [
      mk("t1", 0.85, { metadata: { my_day_order: 0 } }),
      mk("t2", 0.85, { metadata: { my_day_order: 1 } }),
      mk("t3", 0.85, { metadata: { my_day_order: 2 } }),
      mk("t4", 0.85, { metadata: { my_day_order: 3 } }),
      mk("t5", 0.85, { metadata: { my_day_order: 4 } }),
      mk("t6", 0.85, { metadata: { my_day_order: 5 } }), // overflow
      mk("n1", 0.7, { metadata: { my_day_order: 0 } }),
    ];
    const plan = computeMyDayPlan(items);
    expect(plan.top5).toHaveLength(MY_DAY_CAP);
    expect(plan.top5.map((i) => i.id)).toEqual(["t1", "t2", "t3", "t4", "t5"]);
    expect(plan.next5[0].id).toBe("t6"); // cascaded to front of next5
    expect(plan.next5.map((i) => i.id)).toEqual(["t6", "n1"]);
  });

  it("cascades overflow from next (>5 after today overflow) into overflow section", () => {
    const items = [
      ...Array.from({ length: 6 }, (_, i) => mk(`t${i}`, 0.85, { metadata: { my_day_order: i } })),
      ...Array.from({ length: 5 }, (_, i) => mk(`n${i}`, 0.7, { metadata: { my_day_order: i } })),
    ];
    const plan = computeMyDayPlan(items);
    expect(plan.top5.map((i) => i.id)).toEqual(["t0", "t1", "t2", "t3", "t4"]);
    // t5 bumped to front of next5, pushing n4 out
    expect(plan.next5.map((i) => i.id)).toEqual(["t5", "n0", "n1", "n2", "n3"]);
    expect(plan.overflow.map((i) => i.id)).toEqual(["n4"]);
  });

  it("excludes completed/archived items (caller's responsibility - but verify no crash)", () => {
    // In production the page already filters to active-only, but plan should be
    // robust to any extra items being passed in.
    const items = [mk("a", 0.85), mk("b", 0.85, { status: "completed" })];
    const plan = computeMyDayPlan(items);
    // laneFromItem sends non-active to 'backlog', so 'b' ends up in overflow
    expect(plan.top5.map((i) => i.id)).toEqual(["a"]);
    expect(plan.overflow.map((i) => i.id)).toEqual(["b"]);
  });
});

describe("planMyDayReorder", () => {
  it("reorders within Top 5 without affecting Next 5", () => {
    const items = [
      mk("t1", 0.85, { metadata: { my_day_order: 0 } }),
      mk("t2", 0.85, { metadata: { my_day_order: 1 } }),
      mk("t3", 0.85, { metadata: { my_day_order: 2 } }),
      mk("n1", 0.7, { metadata: { my_day_order: 0 } }),
    ];
    // Move t3 to position 0 of top5
    const patches = planMyDayReorder(items, "t3", "top5", 0);
    const byId = Object.fromEntries(patches.map((p) => [p.id, p]));
    expect(byId.t3).toEqual({ id: "t3", targetLane: "today", my_day_order: 0 });
    expect(byId.t1).toEqual({ id: "t1", targetLane: "today", my_day_order: 1 });
    expect(byId.t2).toEqual({ id: "t2", targetLane: "today", my_day_order: 2 });
    expect(byId.n1).toBeUndefined(); // not touched
  });

  it("promotes a Next item into Top 5 and sets priority to today", () => {
    const items = [
      mk("t1", 0.85, { metadata: { my_day_order: 0 } }),
      mk("t2", 0.85, { metadata: { my_day_order: 1 } }),
      mk("n1", 0.7, { metadata: { my_day_order: 0 } }),
      mk("n2", 0.7, { metadata: { my_day_order: 1 } }),
    ];
    // Drag n2 to position 0 of top5
    const patches = planMyDayReorder(items, "n2", "top5", 0);
    const byId = Object.fromEntries(patches.map((p) => [p.id, p]));
    expect(byId.n2).toEqual({ id: "n2", targetLane: "today", my_day_order: 0 });
    expect(byId.t1).toEqual({ id: "t1", targetLane: "today", my_day_order: 1 });
    expect(byId.t2).toEqual({ id: "t2", targetLane: "today", my_day_order: 2 });
  });

  it("demotes a Top item into Next 5 and sets priority to next", () => {
    const items = [
      mk("t1", 0.85, { metadata: { my_day_order: 0 } }),
      mk("t2", 0.85, { metadata: { my_day_order: 1 } }),
      mk("n1", 0.7, { metadata: { my_day_order: 0 } }),
    ];
    // Drag t1 to position 0 of next5
    const patches = planMyDayReorder(items, "t1", "next5", 0);
    const byId = Object.fromEntries(patches.map((p) => [p.id, p]));
    expect(byId.t1).toEqual({ id: "t1", targetLane: "next", my_day_order: 0 });
    expect(byId.n1).toEqual({ id: "n1", targetLane: "next", my_day_order: 1 });
  });

  it("cascades: dragging a 6th item into full Top 5 bumps the bottom one into front of Next 5", () => {
    const items = [
      ...Array.from({ length: 5 }, (_, i) => mk(`t${i + 1}`, 0.85, { metadata: { my_day_order: i } })),
      mk("n1", 0.7, { metadata: { my_day_order: 0 } }),
    ];
    // Drag n1 to position 0 of top5; t5 (bottom of top) should cascade to next5[0]
    const patches = planMyDayReorder(items, "n1", "top5", 0);
    const byId = Object.fromEntries(patches.map((p) => [p.id, p]));
    expect(byId.n1.targetLane).toBe("today");
    expect(byId.n1.my_day_order).toBe(0);
    // t5 was at my_day_order=4 in today; after n1 inserts at 0, t5 gets bumped
    expect(byId.t5).toEqual({ id: "t5", targetLane: "next", my_day_order: 0 });
  });

  it("cascades twice: full top + full next, dragging new item into top sends bottom-of-next to upcoming", () => {
    const items = [
      ...Array.from({ length: 5 }, (_, i) => mk(`t${i + 1}`, 0.85, { metadata: { my_day_order: i } })),
      ...Array.from({ length: 5 }, (_, i) => mk(`n${i + 1}`, 0.7, { metadata: { my_day_order: i } })),
      mk("u1", 0.55),
    ];
    // Drag u1 into top5 at position 0
    const patches = planMyDayReorder(items, "u1", "top5", 0);
    const byId = Object.fromEntries(patches.map((p) => [p.id, p]));
    expect(byId.u1).toEqual({ id: "u1", targetLane: "today", my_day_order: 0 });
    // t5 bumps to next5[0]; n5 (was at next[4]) bumps out to upcoming
    expect(byId.t5.targetLane).toBe("next");
    expect(byId.n5).toEqual({ id: "n5", targetLane: "upcoming", my_day_order: Number.NaN });
  });

  it("returns empty array when dragged item doesn't exist", () => {
    const items = [mk("t1", 0.85)];
    expect(planMyDayReorder(items, "does-not-exist", "top5", 0)).toEqual([]);
  });

  it("clamps out-of-range targetIndex to valid bounds", () => {
    const items = [
      mk("t1", 0.85, { metadata: { my_day_order: 0 } }),
      mk("t2", 0.85, { metadata: { my_day_order: 1 } }),
    ];
    // Target index 999 → should go to end
    const patches = planMyDayReorder(items, "t1", "top5", 999);
    const byId = Object.fromEntries(patches.map((p) => [p.id, p]));
    expect(byId.t1.my_day_order).toBe(1); // end of (now 2-item) list
    expect(byId.t2.my_day_order).toBe(0);
  });
});
