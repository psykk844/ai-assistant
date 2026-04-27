import { describe, expect, it } from "vitest";
import { buildMobileHomePayload, buildMobileBacklogPage } from "../lib/items/mobile-contracts";
import type { InboxItem } from "../lib/items/types";

function makeItem(id: string, priority: number, overrides: Partial<InboxItem> = {}): InboxItem {
  return {
    id,
    type: "todo",
    title: id,
    content: `${id} content`,
    status: "active",
    priority_score: priority,
    confidence_score: null,
    needs_review: false,
    created_at: "2026-04-26T00:00:00Z",
    metadata: {},
    tags: [],
    ...overrides,
  };
}

describe("buildMobileHomePayload", () => {
  it("returns capped today and next lists plus lane counts without backlog rows", () => {
    const items = [
      ...Array.from({ length: 6 }, (_, i) => makeItem(`today-${i + 1}`, 0.9, { metadata: { my_day_order: i } })),
      ...Array.from({ length: 6 }, (_, i) => makeItem(`next-${i + 1}`, 0.75, { metadata: { my_day_order: i } })),
      ...Array.from({ length: 3 }, (_, i) => makeItem(`upcoming-${i + 1}`, 0.55)),
      ...Array.from({ length: 4 }, (_, i) => makeItem(`backlog-${i + 1}`, 0.2)),
    ];

    const payload = buildMobileHomePayload(items);

    expect(payload.today.map((item) => item.id)).toEqual(["today-1", "today-2", "today-3", "today-4", "today-5"]);
    expect(payload.next.map((item) => item.id)).toEqual(["today-6", "next-1", "next-2", "next-3", "next-4"]);
    expect(payload.counts).toEqual({
      todayTotal: 6,
      nextTotal: 6,
      upcomingTotal: 3,
      backlogTotal: 4,
    });
    expect(payload.next.some((item) => item.id.startsWith("backlog-"))).toBe(false);
  });
});

describe("buildMobileBacklogPage", () => {
  it("returns only backlog items with cursor metadata", () => {
    const items = [
      makeItem("today", 0.9),
      makeItem("backlog-1", 0.4, { created_at: "2026-04-26T10:00:00Z" }),
      makeItem("backlog-2", 0.3, { created_at: "2026-04-26T09:00:00Z" }),
      makeItem("backlog-3", 0.2, { created_at: "2026-04-26T08:00:00Z" }),
    ];

    const firstPage = buildMobileBacklogPage(items, { limit: 2 });

    expect(firstPage.items.map((item) => item.id)).toEqual(["backlog-1", "backlog-2"]);
    expect(firstPage.pageInfo.hasMore).toBe(true);
    expect(firstPage.pageInfo.nextCursor).toBe("backlog-2");

    const secondPage = buildMobileBacklogPage(items, { limit: 2, cursor: firstPage.pageInfo.nextCursor ?? undefined });

    expect(secondPage.items.map((item) => item.id)).toEqual(["backlog-3"]);
    expect(secondPage.pageInfo.hasMore).toBe(false);
    expect(secondPage.pageInfo.nextCursor).toBeNull();
  });
});


describe("mobile contracts with missing tags column fallback shape", () => {
  it("builds mobile payloads when tags are normalized from metadata only", () => {
    const items = [
      makeItem("today-no-tags", 0.9, { metadata: { my_day_order: 0, tags: ["urgent"] } as InboxItem["metadata"], tags: [] }),
      makeItem("backlog-no-tags", 0.2, { metadata: { tags: ["later"] } as InboxItem["metadata"], tags: [] }),
    ];

    const home = buildMobileHomePayload(items);
    const backlog = buildMobileBacklogPage(items, { limit: 10 });

    expect(home.today[0]?.tags).toEqual([]);
    expect(backlog.items[0]?.id).toBe("backlog-no-tags");
  });
});
