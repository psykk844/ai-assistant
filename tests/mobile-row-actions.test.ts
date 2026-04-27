import { describe, expect, it } from "vitest";
import { completeFromHomePayload, moveInHomePayload } from "../mobile/lib/home-row-actions";
import type { MobileHomePayload, MobileItemPreview } from "../mobile/lib/types";

function makeItem(id: string, lane: MobileItemPreview["lane"], priority_score: number): MobileItemPreview {
  return {
    id,
    title: id,
    content: `${id} content`,
    created_at: "2026-04-26T00:00:00Z",
    priority_score,
    tags: [],
    type: "todo",
    status: "active",
    lane,
  };
}

function makePayload(): MobileHomePayload {
  return {
    today: [makeItem("today-1", "today", 0.9), makeItem("today-2", "today", 0.88)],
    next: [makeItem("next-1", "next", 0.75)],
    counts: {
      todayTotal: 2,
      nextTotal: 1,
      upcomingTotal: 3,
      backlogTotal: 4,
    },
  };
}

describe("completeFromHomePayload", () => {
  it("removes item from focused lane list and decrements lane count", () => {
    const payload = makePayload();

    const updated = completeFromHomePayload(payload, "today-1");

    expect(updated.today.map((item) => item.id)).toEqual(["today-2"]);
    expect(updated.counts.todayTotal).toBe(1);
  });
});

describe("moveInHomePayload", () => {
  it("moves an item between Today and Next and updates both counts", () => {
    const payload = makePayload();

    const updated = moveInHomePayload(payload, "today-2", "next");

    expect(updated.today.map((item) => item.id)).toEqual(["today-1"]);
    expect(updated.next[0]).toMatchObject({ id: "today-2", lane: "next" });
    expect(updated.counts.todayTotal).toBe(1);
    expect(updated.counts.nextTotal).toBe(2);
  });

  it("moves an item from focused lanes into backlog by count while removing from visible list", () => {
    const payload = makePayload();

    const updated = moveInHomePayload(payload, "next-1", "backlog");

    expect(updated.next).toHaveLength(0);
    expect(updated.counts.nextTotal).toBe(0);
    expect(updated.counts.backlogTotal).toBe(5);
  });
});
