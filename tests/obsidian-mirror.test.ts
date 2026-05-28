import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { mirrorItemToObsidian } from "../lib/obsidian/mirror";

const priorVaultPath = process.env.OBSIDIAN_VAULT_PATH;
const tempVaults: string[] = [];

afterEach(async () => {
  if (priorVaultPath === undefined) {
    delete process.env.OBSIDIAN_VAULT_PATH;
  } else {
    process.env.OBSIDIAN_VAULT_PATH = priorVaultPath;
  }

  await Promise.all(tempVaults.splice(0).map((vault) => rm(vault, { recursive: true, force: true })));
});

describe("active Obsidian item mirror", () => {
  it("does not mirror link items", async () => {
    const vault = await createTempVault();

    const result = await mirrorItemToObsidian({
      id: "link-12345678",
      user_id: "user-1",
      type: "link",
      title: "Saved link",
      content: "Read this later https://example.com/article",
      status: "active",
      priority_score: 50,
      confidence_score: null,
      needs_review: false,
      created_at: "2026-05-28T10:00:00.000Z",
      updated_at: "2026-05-28T10:00:00.000Z",
      metadata: {},
    });

    expect(result).toBeNull();
    await expect(readdir(path.join(vault, "Links"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("continues to mirror todo items", async () => {
    const vault = await createTempVault();

    const result = await mirrorItemToObsidian({
      id: "todo-12345678",
      user_id: "user-1",
      type: "todo",
      title: "Book dentist",
      content: "Book dentist appointment next week",
      status: "active",
      priority_score: 80,
      confidence_score: 0.9,
      needs_review: false,
      created_at: "2026-05-28T10:00:00.000Z",
      updated_at: "2026-05-28T10:00:00.000Z",
      metadata: {},
    });

    expect(result).toEqual({ obsidianPath: path.join("Todos", "book-dentist__todo-123.md") });
    const markdown = await readFile(path.join(vault, "Todos", "book-dentist__todo-123.md"), "utf8");
    expect(markdown).toContain("type: todo");
    expect(markdown).toContain("Book dentist appointment next week");
  });
});

async function createTempVault() {
  const vault = await mkdtemp(path.join(os.tmpdir(), "obsidian-mirror-"));
  tempVaults.push(vault);
  process.env.OBSIDIAN_VAULT_PATH = vault;
  return vault;
}
