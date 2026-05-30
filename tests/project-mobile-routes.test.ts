import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from(table: string) {
      const query = {
        select() {
          return query;
        },
        eq() {
          return query;
        },
        is() {
          return query;
        },
        order() {
          return query;
        },
        insert() {
          return query;
        },
        update() {
          return query;
        },
        in() {
          return query;
        },
        single() {
          if (table === "projects") {
            return Promise.resolve({
              data: {
                id: "project-1",
                user_id: "user-1",
                name: "Todo App",
                description: null,
                position: 1000,
                archived_at: null,
                created_at: "2026-05-30T00:00:00Z",
                updated_at: "2026-05-30T00:00:00Z",
              },
              error: null,
            });
          }
          return Promise.resolve({
            data: {
              id: "task-1",
              project_id: "project-1",
              parent_task_id: null,
              title: "Task",
              description: null,
              status: "todo",
              position: 1000,
              due_date: null,
              labels: [],
              archived_at: null,
              created_at: "2026-05-30T00:00:00Z",
              updated_at: "2026-05-30T00:00:00Z",
            },
            error: null,
          });
        },
        then(resolve: (value: unknown) => void) {
          if (table === "projects") {
            resolve({
              data: [
                {
                  id: "project-1",
                  user_id: "user-1",
                  name: "Todo App",
                  description: null,
                  position: 1000,
                  archived_at: null,
                  created_at: "2026-05-30T00:00:00Z",
                  updated_at: "2026-05-30T00:00:00Z",
                },
              ],
              error: null,
            });
          } else if (table === "project_tasks") {
            resolve({ data: [], error: null });
          } else {
            resolve({ data: [], error: null });
          }
        },
      };
      return query;
    },
  }),
}));

describe("mobile project routes", () => {
  beforeEach(() => {
    process.env.MOBILE_DEV_API_KEY = "test-mobile-key";
    process.env.MOBILE_DEV_USER_ID = "user-1";
  });

  it("returns the project board payload", async () => {
    const { GET } = await import("../app/api/mobile/projects/route");
    const response = await GET(
      new Request("http://localhost/api/mobile/projects", {
        headers: { "x-mobile-dev-key": "test-mobile-key" },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.projects[0].name).toBe("Todo App");
    expect(body.tasks).toEqual([]);
  });
});
