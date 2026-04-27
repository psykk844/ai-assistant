import { describe, expect, it } from "vitest";
import { getMobileBacklogPage } from "../mobile/lib/api";

describe("getMobileBacklogPage", () => {
  it("returns paginated backlog-only items in mock mode", async () => {
    const firstPage = await getMobileBacklogPage({ limit: 1 });

    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.items[0]?.lane).toBe("backlog");
    expect(firstPage.pageInfo.hasMore).toBe(true);
    expect(firstPage.pageInfo.nextCursor).toBeTruthy();

    const secondPage = await getMobileBacklogPage({
      limit: 1,
      cursor: firstPage.pageInfo.nextCursor ?? undefined,
    });

    expect(secondPage.items).toHaveLength(1);
    expect(secondPage.items[0]?.lane).toBe("backlog");
    expect(secondPage.pageInfo.hasMore).toBe(false);
  });

  it("filters backlog items by search query in mock mode", async () => {
    const page = await getMobileBacklogPage({ limit: 20, search: "backlog-2" });

    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.id).toBe("backlog-2");
    expect(page.pageInfo.hasMore).toBe(false);
  });
});
