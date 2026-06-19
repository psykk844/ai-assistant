import { describe, expect, it } from "vitest";
import { findProjectTaskDetail } from "../app/projects/project-task-selection";
import type { ProjectBoard, ProjectTaskNode } from "../lib/projects/types";

function task(overrides: Partial<ProjectTaskNode>): ProjectTaskNode {
  return {
    id: "task-1",
    project_id: "project-1",
    parent_task_id: null,
    title: "Parent task",
    description: "Parent notes",
    status: "todo",
    position: 1000,
    due_date: null,
    labels: [],
    archived_at: null,
    created_at: "2026-06-19T00:00:00Z",
    updated_at: "2026-06-19T00:00:00Z",
    checklist: [],
    subtasks: [],
    ...overrides,
  };
}

describe("project task detail selection", () => {
  it("opens subtasks as their own detail task with their own notes and checklist", () => {
    const parent = task({
      id: "parent-1",
      title: "Parent task",
      checklist: [
        {
          id: "parent-check",
          task_id: "parent-1",
          title: "Parent checklist",
          completed: false,
          position: 1000,
          created_at: "2026-06-19T00:00:00Z",
          updated_at: "2026-06-19T00:00:00Z",
        },
      ],
      subtasks: [
        {
          ...task({
            id: "subtask-1",
            parent_task_id: "parent-1",
            title: "Subtask task",
            description: "Subtask notes",
          }),
          checklist: [
            {
              id: "subtask-check",
              task_id: "subtask-1",
              title: "Subtask checklist",
              completed: true,
              position: 1000,
              created_at: "2026-06-19T00:00:00Z",
              updated_at: "2026-06-19T00:00:00Z",
            },
          ],
        },
      ],
    });
    const board: ProjectBoard = {
      projects: [],
      activeProject: null,
      tasks: [parent],
    };

    const selection = findProjectTaskDetail(board, "subtask-1");

    expect(selection.task).toMatchObject({
      id: "subtask-1",
      parent_task_id: "parent-1",
      description: "Subtask notes",
      checklist: [{ id: "subtask-check", title: "Subtask checklist" }],
      subtasks: [],
    });
    expect(selection.parentTask?.id).toBe("parent-1");
  });
});
