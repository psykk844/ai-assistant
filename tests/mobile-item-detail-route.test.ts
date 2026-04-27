import { beforeEach, describe, expect, it, vi } from "vitest";

let selectedColumns = "";
let insertedPayload: Record<string, unknown> | null = null;

const mockItem = {
  id: "item-1",
  type: "todo",
  title: "Open detail task",
  content: "Open detail task",
  status: "active",
  priority_score: 0.9,
  confidence_score: null,
  needs_review: false,
  created_at: "2026-04-27T00:00:00Z",
  updated_at: "2026-04-27T00:00:00Z",
  metadata: { tags: ["mobile"] },
};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    const query = {
      select(columns: string) {
        selectedColumns = columns;
        return query;
      },
      insert(payload: Record<string, unknown>) {
        insertedPayload = payload;
        return query;
      },
      eq() {
        return query;
      },
      single() {
        if (selectedColumns.includes("tags") || insertedPayload?.tags) {
          return Promise.resolve({ data: null, error: { message: "column items.tags does not exist" } });
        }

        return Promise.resolve({ data: mockItem, error: null });
      },
    };

    return {
      from() {
        return query;
      },
    };
  },
}));

describe("mobile item detail route", () => {
  beforeEach(() => {
    selectedColumns = "";
    insertedPayload = null;
    process.env.MOBILE_DEV_API_KEY = "test-mobile-key";
    process.env.MOBILE_DEV_USER_ID = "user-1";
  });

  it("returns an item from metadata tags without selecting the missing tags column", async () => {
    const { GET } = await import("../app/api/mobile/items/[id]/route");
    const request = new Request("http://localhost/api/mobile/items/item-1", {
      headers: { "x-mobile-dev-key": "test-mobile-key" },
    });

    const response = await GET(request, { params: Promise.resolve({ id: "item-1" }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(selectedColumns).not.toContain("tags");
    expect(body).toMatchObject({
      id: "item-1",
      title: "Open detail task",
      tags: ["mobile"],
    });
  });

  it("creates quick-add items without writing or selecting the missing tags column", async () => {
    const { POST } = await import("../app/api/mobile/items/route");
    const request = new Request("http://localhost/api/mobile/items", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-mobile-dev-key": "test-mobile-key",
      },
      body: JSON.stringify({ content: "New mobile item", lane: "backlog" }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(insertedPayload).not.toHaveProperty("tags");
    expect(selectedColumns).not.toContain("tags");
    expect(body).toMatchObject({
      id: "item-1",
      title: "Open detail task",
      tags: ["mobile"],
    });
  });
});
