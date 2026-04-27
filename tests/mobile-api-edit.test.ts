import { beforeEach, describe, expect, it } from "vitest";

import { getMockMobileItemById, updateMobileItem } from "../mobile/lib/api";

describe("mobile API item editing", () => {
  beforeEach(() => {
    process.env.EXPO_PUBLIC_USE_REAL_BACKEND = "false";
  });

  it("updates mock item fields and returns the edited mobile preview", async () => {
    const updated = await updateMobileItem("next-1", {
      title: "Edited next item",
      content: "Edited detail content",
      lane: "today",
      status: "active",
      priority_score: 0.91,
      tags: ["phone", "edited"],
    });

    const reloaded = await getMockMobileItemById("next-1");

    expect(updated).toMatchObject({
      id: "next-1",
      title: "Edited next item",
      content: "Edited detail content",
      lane: "today",
      status: "active",
      priority_score: 0.91,
      tags: ["phone", "edited"],
    });
    expect(reloaded).toMatchObject(updated);
  });
});
