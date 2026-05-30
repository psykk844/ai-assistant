"use server";

import {
  archiveProjectTaskAction as archiveProjectTaskActionImpl,
  createProjectAction as createProjectActionImpl,
  createProjectChecklistItemAction as createProjectChecklistItemActionImpl,
  createProjectTaskAction as createProjectTaskActionImpl,
  moveProjectTaskAction as moveProjectTaskActionImpl,
  updateProjectChecklistItemAction as updateProjectChecklistItemActionImpl,
  updateProjectTaskAction as updateProjectTaskActionImpl,
} from "./actions";
import type { ProjectTaskStatus } from "@/lib/projects/status";

export async function createProjectAction(formData: FormData) {
  return createProjectActionImpl(formData);
}

export async function createProjectTaskAction(formData: FormData) {
  return createProjectTaskActionImpl(formData);
}

export async function moveProjectTaskAction(formData: FormData) {
  return moveProjectTaskActionImpl(formData);
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
  return updateProjectTaskActionImpl(taskId, patch);
}

export async function archiveProjectTaskAction(taskId: string) {
  return archiveProjectTaskActionImpl(taskId);
}

export async function createProjectChecklistItemAction(taskId: string, title: string) {
  return createProjectChecklistItemActionImpl(taskId, title);
}

export async function updateProjectChecklistItemAction(
  itemId: string,
  patch: { title?: string; completed?: boolean; position?: number },
) {
  return updateProjectChecklistItemActionImpl(itemId, patch);
}
