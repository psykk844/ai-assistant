import type { ProjectBoard, ProjectTaskNode } from "@/lib/projects/types";

type ProjectTaskDetailSelection = {
  task: ProjectTaskNode | null;
  parentTask: ProjectTaskNode | null;
};

export function findProjectTaskDetail(board: ProjectBoard, taskId: string | null): ProjectTaskDetailSelection {
  if (!taskId) return { task: null, parentTask: null };

  for (const task of board.tasks) {
    if (task.id === taskId) {
      return { task, parentTask: null };
    }

    const subtask = task.subtasks.find((candidate) => candidate.id === taskId);
    if (subtask) {
      return {
        task: {
          ...subtask,
          subtasks: [],
        },
        parentTask: task,
      };
    }
  }

  return { task: null, parentTask: null };
}
