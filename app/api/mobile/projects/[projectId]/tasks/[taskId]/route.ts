import { NextResponse } from "next/server";
import { loadProjectBoard, updateProjectTask, type ProjectTaskPatch } from "@/lib/projects/repository";
import { isProjectTaskStatus } from "@/lib/projects/status";
import { mobileCorsPreflightResponse, requireMobileApiUser, unauthorizedResponse, withMobileCors } from "../../../../_shared";

export const dynamic = "force-dynamic";

export function OPTIONS(request: Request) {
  return mobileCorsPreflightResponse(request);
}

export async function GET(request: Request, context: { params: Promise<{ projectId: string; taskId: string }> }) {
  const auth = await requireMobileApiUser(request);
  if (!auth) return unauthorizedResponse(request);

  const { projectId, taskId } = await context.params;
  const board = await loadProjectBoard(auth.userId, projectId);
  const task = board.tasks.find((candidate) => candidate.id === taskId);
  if (!task) {
    return withMobileCors(NextResponse.json({ error: "not found" }, { status: 404 }), request);
  }

  return withMobileCors(NextResponse.json(task), request);
}

export async function PATCH(request: Request, context: { params: Promise<{ taskId: string }> }) {
  const auth = await requireMobileApiUser(request);
  if (!auth) return unauthorizedResponse(request);

  const { taskId } = await context.params;
  const body = (await request.json().catch(() => null)) as {
    title?: unknown;
    description?: unknown;
    status?: unknown;
    due_date?: unknown;
    labels?: unknown;
  } | null;

  const patch: ProjectTaskPatch = {};
  if (typeof body?.title === "string") patch.title = body.title;
  if (body && "description" in body) patch.description = typeof body.description === "string" ? body.description : null;
  if (isProjectTaskStatus(body?.status)) patch.status = body.status;
  if (body && "due_date" in body) patch.due_date = typeof body.due_date === "string" ? body.due_date : null;
  if (Array.isArray(body?.labels)) patch.labels = body.labels;

  const task = await updateProjectTask(auth.userId, taskId, patch);
  return withMobileCors(NextResponse.json(task), request);
}
