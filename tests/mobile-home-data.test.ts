import { describe, expect, it } from "vitest";
import { getMockMobileHomePayload } from "../mobile/lib/api";

describe("getMockMobileHomePayload", () => {
  it("returns a compact payload with capped Today and Next lists plus counts", async () => {
    const payload = await getMockMobileHomePayload();

    expect(payload.today).toHaveLength(5);
    expect(payload.next).toHaveLength(5);
    expect(payload.counts.todayTotal).toBeGreaterThanOrEqual(payload.today.length);
    expect(payload.counts.nextTotal).toBeGreaterThanOrEqual(4);
    expect(payload.today[0]).toMatchObject({
      lane: "today",
      status: "active",
    });
  });
});
