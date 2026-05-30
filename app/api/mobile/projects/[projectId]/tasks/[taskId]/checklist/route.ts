import { NextResponse } from "next/server";
import { createChecklistItem, loadProjectBoard, updateChecklistItem } from "@/lib/projects/repository";
import { mobileCorsPreflightResponse, requireMobileApiUser, unauthorizedResponse, withMobileCors } from "../../../../../_shared";
import {
  expectedProjectErrorResponse,
  findProjectBoardTask,
  mobileJsonError,
  routeProjectMissing,
} from "../../../../_helpers";

export const dynamic = "force-dynamic";

export function OPTIONS(request: Request) {
  return mobileCorsPreflightResponse(request);
}

export async function POST(request: Request, context: { params: Promise<{ projectId: string; taskId: string }> }) {
  const auth = await requireMobileApiUser(request);
  if (!auth) return unauthorizedResponse(request);

  const { projectId, taskId } = await context.params;
  const body = (await request.json().catch(() => null)) as { title?: string } | null;
  try {
    const board = await loadProjectBoard(auth.userId, projectId);
    if (routeProjectMissing(board, projectId) || !findProjectBoardTask(board, taskId)) {
      return mobileJsonError(request, 404, "not found");
    }

    const item = await createChecklistItem(auth.userId, taskId, body?.title ?? "");
    return withMobileCors(NextResponse.json(item), request);
  } catch (error) {
    return expectedProjectErrorResponse(error, request);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ projectId: string; taskId: string }> }) {
  const auth = await requireMobileApiUser(request);
  if (!auth) return unauthorizedResponse(request);

  const { projectId, taskId } = await context.params;
  const body = (await request.json().catch(() => null)) as {
    itemId?: string;
    title?: string;
    completed?: boolean;
    position?: number;
  } | null;
  if (!body?.itemId) {
    return withMobileCors(NextResponse.json({ error: "itemId is required" }, { status: 400 }), request);
  }

  try {
    const board = await loadProjectBoard(auth.userId, projectId);
    const task = routeProjectMissing(board, projectId) ? null : findProjectBoardTask(board, taskId);
    if (!task) {
      return mobileJsonError(request, 404, "not found");
    }

    const checklistItem = task.checklist.find((item) => item.id === body.itemId);
    if (!checklistItem) {
      return mobileJsonError(request, 404, "not found");
    }

    const item = await updateChecklistItem(auth.userId, body.itemId, {
      title: body.title,
      completed: body.completed,
      position: body.position,
    });

    return withMobileCors(NextResponse.json(item), request);
  } catch (error) {
    return expectedProjectErrorResponse(error, request);
  }
}
