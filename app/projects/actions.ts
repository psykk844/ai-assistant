import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { resolveSessionUserId } from "@/lib/auth/session-user";
import {
  createChecklistItem,
  createProject,
  createProjectTask,
  updateChecklistItem,
  updateProjectArchive,
  updateProjectTask,
} from "@/lib/projects/repository";
import { isProjectArea, isProjectTaskStatus, type ProjectArea, type ProjectTaskStatus } from "@/lib/projects/status";

export function projectAreaFromForm(formData: FormData): ProjectArea {
  const area = String(formData.get("area") ?? "").trim();
  return isProjectArea(area) ? area : "demand";
}

export function projectArchivePatchFromForm(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "").trim();
  if (!projectId) throw new Error("Project id is required");

  return {
    area: projectAreaFromForm(formData),
    archived: String(formData.get("archived") ?? "true") !== "false",
    projectId,
  };
}

export function projectTaskMovePatchFromForm(formData: FormData) {
  const taskId = String(formData.get("taskId") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  const rawPosition = formData.get("position");
  const positionText = typeof rawPosition === "string" ? rawPosition.trim() : "";

  if (!taskId) throw new Error("Task id is required");
  if (!isProjectTaskStatus(status)) throw new Error("Invalid project task status");
  if (!positionText) throw new Error("Valid position is required");

  const position = Number(positionText);
  if (!Number.isFinite(position)) throw new Error("Valid position is required");

  return { taskId, status, position };
}

export async function createProjectAction(formData: FormData) {
  const userId = await resolveSessionUserId();
  const area = projectAreaFromForm(formData);
  const project = await createProject(userId, {
    area,
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
  });
  revalidatePath("/projects");
  redirect(`/projects?area=${encodeURIComponent(area)}&project=${encodeURIComponent(project.id)}`);
}

export async function createProjectTaskAction(formData: FormData) {
  const userId = await resolveSessionUserId();
  const status = String(formData.get("status") ?? "backlog");
  if (!isProjectTaskStatus(status)) throw new Error("Invalid project task status");

  await createProjectTask(userId, {
    projectId: String(formData.get("projectId") ?? ""),
    parentTaskId: String(formData.get("parentTaskId") ?? "") || null,
    title: String(formData.get("title") ?? ""),
    status,
  });
  revalidatePath("/projects");
}

export async function moveProjectTaskAction(formData: FormData) {
  const userId = await resolveSessionUserId();
  const patch = projectTaskMovePatchFromForm(formData);
  await updateProjectTask(userId, patch.taskId, { status: patch.status, position: patch.position });
  revalidatePath("/projects");
}

export async function updateProjectTaskAction(
  taskId: string,
  patch: {
    title?: string;
    description?: string | null;
    status?: ProjectTaskStatus;
    due_date?: string | null;
    labels?: Array<{ name: string; color: string }>;
  },
) {
  const userId = await resolveSessionUserId();
  await updateProjectTask(userId, taskId, patch);
  revalidatePath("/projects");
}

export async function archiveProjectTaskAction(taskId: string) {
  const userId = await resolveSessionUserId();
  await updateProjectTask(userId, taskId, { archived_at: new Date().toISOString() });
  revalidatePath("/projects");
}

export async function updateProjectArchiveAction(formData: FormData) {
  const userId = await resolveSessionUserId();
  const patch = projectArchivePatchFromForm(formData);
  await updateProjectArchive(userId, patch.projectId, patch.archived);
  revalidatePath("/projects");
  if (patch.archived) {
    redirect(`/projects?area=${encodeURIComponent(patch.area)}`);
  }
  redirect(`/projects?area=${encodeURIComponent(patch.area)}&project=${encodeURIComponent(patch.projectId)}`);
}

export async function createProjectChecklistItemAction(taskId: string, title: string) {
  const userId = await resolveSessionUserId();
  await createChecklistItem(userId, taskId, title);
  revalidatePath("/projects");
}

export async function updateProjectChecklistItemAction(
  itemId: string,
  patch: { title?: string; completed?: boolean; position?: number },
) {
  const userId = await resolveSessionUserId();
  await updateChecklistItem(userId, itemId, patch);
  revalidatePath("/projects");
}
