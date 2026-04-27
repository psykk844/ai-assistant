import { describe, expect, it } from "vitest";
import { buildQuickAddDraft, createQuickAddItem } from "../mobile/lib/api";

describe("buildQuickAddDraft", () => {
  it("maps selected lane to the expected draft payload", () => {
    const draft = buildQuickAddDraft("Buy milk", "today");

    expect(draft).toMatchObject({
      content: "Buy milk",
      lane: "today",
      priority_score: 0.85,
    });
  });
});

describe("createQuickAddItem", () => {
  it("returns a new preview item in the selected lane", async () => {
    const item = await createQuickAddItem("Reply to Alex", "next");

    expect(item).toMatchObject({
      lane: "next",
      title: "Reply to Alex",
      status: "active",
    });
    expect(item.priority_score).toBe(0.7);
  });
});
