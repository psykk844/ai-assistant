import { describe, expect, it } from "vitest";
import { buildBriefingContext, buildFallbackBriefing } from "../app/app/my-day/briefing";
import type { InboxItem } from "../lib/items/types";

function makeItem(overrides: Partial<InboxItem> & { id: string }): InboxItem {
  return {
    type: "todo",
    title: overrides.id,
    content: "",
    status: "active",
    priority_score: 0.9,
    confidence_score: null,
    needs_review: false,
    created_at: new Date().toISOString(),
    tags: [],
    metadata: null,
    ...overrides,
  };
}

describe("buildBriefingContext", () => {
  it("counts today items and identifies top focus", () => {
    const todayItems = [
      makeItem({ id: "top", title: "Ship API", priority_score: 0.95 }),
      makeItem({ id: "second", title: "Write tests", priority_score: 0.90 }),
    ];
    const ctx = buildBriefingContext(todayItems, [], []);
    expect(ctx.totalToday).toBe(2);
    expect(ctx.topFocus).toBe("Ship API");
  });

  it("counts overdue items", () => {
    const overdue = [
      makeItem({ id: "old", title: "Overdue task", created_at: "2026-04-21T00:00:00Z" }),
    ];
    const ctx = buildBriefingContext([], overdue, []);
    expect(ctx.overdueCount).toBe(1);
    expect(ctx.overdueItems).toHaveLength(1);
  });

  it("includes stale suggestions", () => {
    const stale = [
      makeItem({ id: "stale1", title: "Write docs", updated_at: "2026-04-17T00:00:00Z" }),
    ];
    const ctx = buildBriefingContext([], [], stale);
    expect(ctx.staleItems).toHaveLength(1);
    expect(ctx.staleItems[0].title).toBe("Write docs");
  });
});

describe("buildFallbackBriefing", () => {
  it("generates structured text without AI", () => {
    const todayItems = [
      makeItem({ id: "a", title: "Task A", priority_score: 0.95 }),
      makeItem({ id: "b", title: "Task B", priority_score: 0.90 }),
    ];
    const text = buildFallbackBriefing(todayItems, [], []);
    expect(text).toContain("2 tasks");
    expect(text).toContain("Task A");
  });

  it("mentions overdue items when present", () => {
    const overdue = [makeItem({ id: "late", title: "Late task" })];
    const text = buildFallbackBriefing([], overdue, []);
    expect(text).toContain("overdue");
    expect(text).toContain("Late task");
  });
});
