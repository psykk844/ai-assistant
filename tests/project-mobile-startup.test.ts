import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveMobileStartupProjectId, shouldRememberMobileProjectSelection } from "../mobile/lib/project-startup";
import type { MobileProject } from "../mobile/lib/projects-types";

const projects: MobileProject[] = [
  {
    id: "project-study",
    area: "personal",
    name: "Study",
    description: null,
    position: 1000,
    archived_at: null,
  },
  {
    id: "project-misc",
    area: "personal",
    name: "Misc",
    description: null,
    position: 2000,
    archived_at: null,
  },
];

describe("mobile Projects startup", () => {
  it("restores the last selected active project", () => {
    expect(resolveMobileStartupProjectId(projects, "project-study")).toBe("project-study");
  });

  it("falls back to Misc when no valid project was remembered", () => {
    expect(resolveMobileStartupProjectId(projects, null)).toBe("project-misc");
    expect(resolveMobileStartupProjectId(projects, "archived-project")).toBe("project-misc");
  });

  it("falls back to the unscoped board when Misc is unavailable", () => {
    expect(resolveMobileStartupProjectId(projects.slice(0, 1), null)).toBeNull();
  });

  it("remembers active project selections without replacing them while browsing archives", () => {
    expect(shouldRememberMobileProjectSelection(false)).toBe(true);
    expect(shouldRememberMobileProjectSelection(true)).toBe(false);
  });

  it("opens the app on Projects and focuses its add-task field", async () => {
    const indexSource = await readFile(path.join(process.cwd(), "mobile", "app", "index.tsx"), "utf8");
    const projectsSource = await readFile(
      path.join(process.cwd(), "mobile", "app", "(tabs)", "projects.tsx"),
      "utf8",
    );

    expect(indexSource).toContain('<Redirect href="./projects" />');
    expect(projectsSource).toContain("MOBILE_LAST_PROJECT_STORAGE_KEY");
    expect(projectsSource).toContain("newTaskInputRef.current?.focus()");
  });
});
