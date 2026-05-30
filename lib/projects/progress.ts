import type { ProjectChecklistItem, ProjectTaskNode } from "./types";
import { PROJECT_STATUS_ORDER, type ProjectTaskStatus, compareProjectTaskPositions } from "./status";

export type ProgressCount = { completed: number; total: number };

export function checklistProgress(items: ProjectChecklistItem[]): ProgressCount {
  return {
    completed: items.filter((item) => item.completed).length,
    total: items.length,
  };
}

export function subtaskProgress(task: ProjectTaskNode): ProgressCount {
  return {
    completed: task.subtasks.filter((subtask) => subtask.status === "done").length,
    total: task.subtasks.length,
  };
}

export function groupTopLevelTasksByStatus(tasks: ProjectTaskNode[]) {
  const grouped = Object.fromEntries(PROJECT_STATUS_ORDER.map((status) => [status, []])) as Record<ProjectTaskStatus, ProjectTaskNode[]>;

  for (const task of tasks) {
    if (task.parent_task_id) continue;
    if (task.archived_at) continue;
    grouped[task.status].push(task);
  }

  for (const status of PROJECT_STATUS_ORDER) {
    grouped[status].sort(compareProjectTaskPositions);
  }

  return grouped;
}
