import { expect, test } from "@playwright/test";

const baseUrl = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const username = process.env.SMOKE_USERNAME ?? "sam";
const password = process.env.SMOKE_PASSWORD ?? "page";

test("projects kanban web flow stays isolated from inbox todos", async ({ page }) => {
  const stamp = Date.now();
  const projectName = `Smoke Project ${stamp}`;
  const taskName = `Smoke Task ${stamp}`;
  const checklistName = `Smoke checklist ${stamp}`;
  const subtaskName = `Smoke subtask ${stamp}`;

  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto(new URL("/login", baseUrl).toString(), { waitUntil: "networkidle" });
  await page.getByPlaceholder("sam").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/app", { timeout: 20_000 });

  await page.goto(new URL("/projects", baseUrl).toString(), { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Kanban" }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "All projects" })).toBeVisible();

  await page.getByLabel("Project area").selectOption("delivery");
  await page.getByPlaceholder("Project name").fill(projectName);
  await page.getByPlaceholder("Optional description").fill("Created by Projects web smoke");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page).toHaveURL(/area=delivery/);
  await expect(page.getByRole("heading", { name: projectName })).toBeVisible({ timeout: 20_000 });

  await page.getByPlaceholder("Add to Today").fill(taskName);
  await page.locator("section").filter({ hasText: /^Today/ }).getByRole("button", { name: "Add task" }).click();
  await expect(page.getByText(taskName).first()).toBeVisible({ timeout: 20_000 });

  await page.goto(new URL("/projects", baseUrl).toString(), { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "All projects" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(taskName).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Delivery").first()).toBeVisible();
  await page.getByRole("link", { name: new RegExp(projectName) }).click();
  await expect(page.getByRole("heading", { name: projectName })).toBeVisible({ timeout: 20_000 });

  await expect(async () => {
    await page.getByRole("button", { name: `Open ${taskName}` }).click();
    await expect(page.getByText("Task detail").first()).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 10_000 });

  await page.getByRole("combobox", { name: "Status" }).selectOption("doing");
  await expect(page.getByText("Saved.").first()).toBeVisible({ timeout: 20_000 });

  await page.getByPlaceholder("Add checklist item").fill(checklistName);
  await page.locator("form").filter({ has: page.getByPlaceholder("Add checklist item") }).getByRole("button", { name: "Add" }).click();
  await expect(page.getByText(checklistName).first()).toBeVisible({ timeout: 20_000 });
  await page.getByLabel(checklistName).check();
  await expect(page.getByText("Saved.").first()).toBeVisible({ timeout: 20_000 });

  await page.getByPlaceholder("Add subtask").fill(subtaskName);
  await page.locator("form").filter({ has: page.getByPlaceholder("Add subtask") }).getByRole("button", { name: "Add" }).click();
  await expect(page.getByText(subtaskName).first()).toBeVisible({ timeout: 20_000 });

  await page.getByRole("button", { name: "Close" }).click();
  await page.getByPlaceholder("Search tasks").fill(taskName);
  await expect(page.getByText("Checklist 1/1").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Subtasks 0/1").first()).toBeVisible();

  await page.getByRole("button", { name: `Open ${taskName}` }).click();
  await expect(page.getByText("Task detail").first()).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Add to Today" }).click();
  await expect(page.getByText("Added to Today.").first()).toBeVisible({ timeout: 20_000 });
  await page.goto(new URL("/app", baseUrl).toString(), { waitUntil: "domcontentloaded" });
  await expect(page.getByText(taskName).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/Project: Delivery/).first()).toBeVisible({ timeout: 20_000 });
  await page.goto(new URL("/app/my-day", baseUrl).toString(), { waitUntil: "domcontentloaded" });
  await expect(page.getByText(taskName).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/Project: Delivery/).first()).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: `Complete project task ${taskName}` }).click();
  await expect(page.getByText(taskName)).toHaveCount(0, { timeout: 20_000 });

  await page.goto(new URL("/projects?area=delivery", baseUrl).toString(), { waitUntil: "domcontentloaded" });
  await page.getByRole("link", { name: new RegExp(projectName) }).click();
  await expect(page.locator("section").filter({ hasText: /^Done/ }).getByText(taskName).first()).toBeVisible({ timeout: 20_000 });

  await page.goto(new URL("/app", baseUrl).toString(), { waitUntil: "domcontentloaded" });
  await expect(page.getByText(taskName)).toHaveCount(0);

  await page.goto(new URL(`/projects?area=delivery`, baseUrl).toString(), { waitUntil: "domcontentloaded" });
  await page.getByRole("link", { name: new RegExp(projectName) }).click();
  await expect(page.getByRole("heading", { name: projectName })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Archive project" }).click();
  await expect(page).toHaveURL(/area=delivery/);
  await expect(page.getByRole("link", { name: new RegExp(projectName) })).toHaveCount(0);

  await page.getByRole("link", { name: "Archived" }).click();
  await expect(page).toHaveURL(/archived=1/);
  await page.getByRole("link", { name: "Demand" }).click();
  await expect(page).toHaveURL(/area=demand/);
  await expect(page).toHaveURL(/archived=1/);
  await page.getByRole("link", { name: "Delivery" }).click();
  await expect(page).toHaveURL(/area=delivery/);
  await expect(page).toHaveURL(/archived=1/);
  const archivedProjectLink = page.getByRole("link", { name: new RegExp(projectName) });
  await expect(archivedProjectLink).toBeVisible({ timeout: 20_000 });
  await archivedProjectLink.locator("xpath=ancestor::div[1]").getByRole("button", { name: "Restore" }).click();
  await expect(page.getByRole("heading", { name: projectName })).toBeVisible({ timeout: 20_000 });
  await expect(page).not.toHaveURL(/archived=1/);

  expect(pageErrors).toEqual([]);
});
