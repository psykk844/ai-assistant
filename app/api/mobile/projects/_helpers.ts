import { NextResponse } from "next/server";
import type { ProjectBoard, ProjectTaskNode } from "@/lib/projects/types";
import { withMobileCors } from "../_shared";

type BoardTask = ProjectTaskNode | ProjectTaskNode["subtasks"][number];

export function mobileJsonError(request: Request, status: number, error: string) {
  return withMobileCors(NextResponse.json({ error }, { status }), request);
}

export function routeProjectMissing(board: ProjectBoard, projectId: string) {
  return board.activeProject?.id !== projectId;
}

export function findProjectBoardTask(board: ProjectBoard, taskId: string): BoardTask | null {
  for (const task of board.tasks) {
    if (task.id === taskId) return task;
    const subtask = task.subtasks.find((candidate) => candidate.id === taskId);
    if (subtask) return subtask;
  }

  return null;
}

export function expectedProjectErrorResponse(error: unknown, request: Request) {
  const message = error instanceof Error ? error.message : "";
  if (message.toLowerCase().includes("required") || message.toLowerCase().includes("invalid")) {
    return mobileJsonError(request, 400, message);
  }
  if (message.toLowerCase().includes("not found")) {
    return mobileJsonError(request, 404, "not found");
  }
  return mobileJsonError(request, 500, "failed to process project request");
}
