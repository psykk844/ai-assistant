"use server";

import {
  addProjectTaskFocusAction as addProjectTaskFocusActionImpl,
  archiveProjectTaskAction as archiveProjectTaskActionImpl,
  completeFocusedProjectTaskAction as completeFocusedProjectTaskActionImpl,
  createProjectAction as createProjectActionImpl,
  createProjectChecklistItemAction as createProjectChecklistItemActionImpl,
  createProjectTaskAction as createProjectTaskActionImpl,
  deleteProjectChecklistItemAction as deleteProjectChecklistItemActionImpl,
  moveProjectTaskAction as moveProjectTaskActionImpl,
  removeProjectTaskFocusAction as removeProjectTaskFocusActionImpl,
  updateProjectArchiveAction as updateProjectArchiveActionImpl,
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

export async function updateProjectArchiveAction(formData: FormData) {
  return updateProjectArchiveActionImpl(formData);
}

export async function addProjectTaskFocusAction(formData: FormData) {
  return addProjectTaskFocusActionImpl(formData);
}

export async function removeProjectTaskFocusAction(formData: FormData) {
  return removeProjectTaskFocusActionImpl(formData);
}

export async function completeFocusedProjectTaskAction(formData: FormData) {
  return completeFocusedProjectTaskActionImpl(formData);
}

export async function updateProjectTaskAction(
  taskId: string,
  patch: {
    title?: string;
    description?: string | null;
    status?: ProjectTaskStatus;
    position?: number;
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

export async function deleteProjectChecklistItemAction(itemId: string) {
  return deleteProjectChecklistItemActionImpl(itemId);
}
