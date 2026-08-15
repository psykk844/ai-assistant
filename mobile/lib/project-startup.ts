import type { MobileProject } from "./projects-types";

export const MOBILE_LAST_PROJECT_STORAGE_KEY = "mobile:last-project-id";

export function resolveMobileStartupProjectId(projects: MobileProject[], rememberedProjectId: string | null) {
  const activeProjects = projects.filter((project) => !project.archived_at);
  const rememberedProject = activeProjects.find((project) => project.id === rememberedProjectId);
  if (rememberedProject) return rememberedProject.id;

  return activeProjects.find((project) => project.name.trim().toLowerCase() === "misc")?.id ?? null;
}

export function shouldRememberMobileProjectSelection(archived: boolean) {
  return !archived;
}
