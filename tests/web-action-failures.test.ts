import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("web item action failures", () => {
  it("lets updateItemStatus failures reject so clients can rollback optimistic patches", async () => {
    const source = await readFile(resolve(process.cwd(), "app/app/actions.ts"), "utf8");
    const start = source.indexOf("export async function updateItemStatus");
    const end = source.indexOf("export async function moveItemToLane");
    const updateItemStatusSource = source.slice(start, end);

    expect(updateItemStatusSource).toContain("await requireHardcodedSession();\n\n  try {");
    expect(updateItemStatusSource).toContain("throw new Error(`Failed to load item for status update:");
    expect(updateItemStatusSource).toContain("throw new Error(`Failed to update item status:");
    expect(updateItemStatusSource).toContain("throw error;");
  });
});
