import { describe, expect, it } from "vitest";
import {
  calculateNextDue,
  shouldGenerateInstance,
  buildRecurringInstance,
} from "../lib/items/recurrence";
import type { InboxItem, RecurrenceConfig } from "../lib/items/types";

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

describe("calculateNextDue", () => {
  it("returns tomorrow for daily frequency", () => {
    const result = calculateNextDue("daily", undefined, "2026-04-23");
    expect(result).toBe("2026-04-24");
  });

  it("returns next matching day for weekly frequency", () => {
    // 2026-04-23 is Thursday (4). days=[1] means Monday.
    const result = calculateNextDue("weekly", [1], "2026-04-23");
    expect(result).toBe("2026-04-27"); // next Monday
  });

  it("returns next matching day cycling through multiple days", () => {
    // 2026-04-23 is Thursday (4). days=[1, 5] means Mon, Fri.
    const result = calculateNextDue("weekly", [1, 5], "2026-04-23");
    expect(result).toBe("2026-04-24"); // next Friday is tomorrow
  });

  it("wraps to next week if all days are earlier in the week", () => {
    // 2026-04-25 is Saturday (6). days=[1, 3] means Mon, Wed.
    const result = calculateNextDue("weekly", [1, 3], "2026-04-25");
    expect(result).toBe("2026-04-27"); // next Monday
  });
});

describe("shouldGenerateInstance", () => {
  it("returns true when next_due is today", () => {
    const config: RecurrenceConfig = { frequency: "daily", next_due: "2026-04-23", is_template: true };
    expect(shouldGenerateInstance(config, "2026-04-23")).toBe(true);
  });

  it("returns true when next_due is in the past", () => {
    const config: RecurrenceConfig = { frequency: "daily", next_due: "2026-04-22", is_template: true };
    expect(shouldGenerateInstance(config, "2026-04-23")).toBe(true);
  });

  it("returns false when next_due is in the future", () => {
    const config: RecurrenceConfig = { frequency: "daily", next_due: "2026-04-24", is_template: true };
    expect(shouldGenerateInstance(config, "2026-04-23")).toBe(false);
  });

  it("returns false when is_template is false", () => {
    const config: RecurrenceConfig = { frequency: "daily", next_due: "2026-04-23", is_template: false };
    expect(shouldGenerateInstance(config, "2026-04-23")).toBe(false);
  });
});

describe("buildRecurringInstance", () => {
  it("creates a new item copying template fields", () => {
    const template = makeItem({
      id: "tmpl-1",
      title: "Take meds",
      content: "Morning medication",
      type: "todo",
      tags: ["health"],
      metadata: {
        recurrence: { frequency: "daily", next_due: "2026-04-23", is_template: true },
      },
    });
    const instance = buildRecurringInstance(template, "user-1");
    expect(instance.title).toBe("Take meds");
    expect(instance.content).toBe("Morning medication");
    expect(instance.type).toBe("todo");
    expect(instance.tags).toEqual(["health"]);
    expect(instance.status).toBe("active");
    expect(instance.priority_score).toBe(0.9);
    expect((instance.metadata.recurrence as { template_id: string }).template_id).toBe("tmpl-1");
    expect((instance.metadata.recurrence as { is_template: boolean }).is_template).toBe(false);
    expect(instance.user_id).toBe("user-1");
  });
});
