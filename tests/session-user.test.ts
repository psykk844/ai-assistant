import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  authListCalls: 0,
  rowsByTable: new Map<string, Array<Record<string, unknown>>>(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from(table: string) {
      const query = {
        select() {
          return query;
        },
        order() {
          return query;
        },
        limit() {
          return Promise.resolve({ data: mockState.rowsByTable.get(table) ?? [], error: null });
        },
      };
      return query;
    },
    auth: {
      admin: {
        listUsers: async () => {
          mockState.authListCalls += 1;
          return { data: { users: [] }, error: { message: "fetch failed" } };
        },
        createUser: async () => ({ data: { user: null }, error: { message: "not available" } }),
      },
    },
  }),
}));

describe("resolveSessionUserId", () => {
  beforeEach(() => {
    vi.resetModules();
    mockState.authListCalls = 0;
    mockState.rowsByTable.clear();
    delete process.env.MOBILE_DEV_USER_ID;
    delete process.env.HARDCODED_USER_ID;
    delete process.env.DEFAULT_USER_ID;
  });

  it("uses the shared default user id before Supabase Auth", async () => {
    process.env.DEFAULT_USER_ID = "default-user";
    const { resolveSessionUserId } = await import("../lib/auth/session-user");

    await expect(resolveSessionUserId()).resolves.toBe("default-user");
    expect(mockState.authListCalls).toBe(0);
  });

  it("infers the existing single app user before Supabase Auth", async () => {
    mockState.rowsByTable.set("items", [{ user_id: "items-user" }]);
    const { resolveSessionUserId } = await import("../lib/auth/session-user");

    await expect(resolveSessionUserId()).resolves.toBe("items-user");
    expect(mockState.authListCalls).toBe(0);
  });
});
