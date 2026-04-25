import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { laneToPriority } from "../lib/items/lane";
import { sortItemsForBoardLane } from "../app/app/board-logic";

describe("phase1 lane picker", () => {
  it("maps lane choices to expected priority", () => {
    expect(laneToPriority("today")).toBe(0.85);
    expect(laneToPriority("next")).toBe(0.7);
    expect(laneToPriority("upcoming")).toBe(0.55);
    expect(laneToPriority("backlog")).toBe(0.4);
  });

  it("sorts upcoming/backlog by newest created_at first", () => {
    const base = [
      { id: "old", created_at: "2026-01-01T00:00:00Z", priority_score: 0.4 },
      { id: "new", created_at: "2026-02-01T00:00:00Z", priority_score: 0.4 },
    ];

    expect(sortItemsForBoardLane("upcoming", base as never).map((i) => i.id)).toEqual(["new", "old"]);
    expect(sortItemsForBoardLane("backlog", base as never).map((i) => i.id)).toEqual(["new", "old"]);
  });

  it("leaves today/next ordering unchanged", () => {
    const base = [
      { id: "a", created_at: "2026-01-01T00:00:00Z", priority_score: 0.85 },
      { id: "b", created_at: "2026-02-01T00:00:00Z", priority_score: 0.85 },
    ];

    expect(sortItemsForBoardLane("today", base as never).map((i) => i.id)).toEqual(["a", "b"]);
    expect(sortItemsForBoardLane("next", base as never).map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("board composer includes lane select", async () => {
    const source = await readFile(resolve(process.cwd(), "app/app/inbox-composer.tsx"), "utf8");
    expect(source).toContain('name="lane"');
    expect(source).toContain('value="upcoming"');
  });

  it("my-day quick add includes lane select and submits lane", async () => {
    const source = await readFile(resolve(process.cwd(), "app/app/my-day/my-day-client.tsx"), "utf8");
    expect(source).toContain('name="lane"');
    expect(source).toMatch(/form\.set\(\s*["']lane["']/);
  });

  it("my-day completion does not use optimistic setItems churn", async () => {
    const source = await readFile(resolve(process.cwd(), "app/app/my-day/my-day-client.tsx"), "utf8");
    expect(source).not.toMatch(/setItems\(\(prev\)\s*=>\s*prev\.map\(\(i\)/);
  });

  it("captureInboxItem reads lane from form data", async () => {
    const source = await readFile(resolve(process.cwd(), "app/app/actions.ts"), "utf8");
    expect(source).toMatch(/formData\.get\(\s*["']lane["']/);
  });
});
