import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("project task Today confirmation UI", () => {
  it("shows explicit web confirmation after adding a project task to Today", () => {
    const source = readFileSync(join(root, "app/projects/task-detail-drawer.tsx"), "utf8");

    expect(source).toContain("Added to Today.");
  });

  it("shows explicit mobile confirmation after adding a project task to Today", () => {
    const source = readFileSync(join(root, "mobile/app/project-task/[id].tsx"), "utf8");

    expect(source).toContain("Added to Today.");
  });
});
