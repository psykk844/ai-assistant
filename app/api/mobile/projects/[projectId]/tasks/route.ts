import { NextResponse } from "next/server";
import { createProjectTask } from "@/lib/projects/repository";
import { isProjectTaskStatus } from "@/lib/projects/status";
import { mobileCorsPreflightResponse, requireMobileApiUser, unauthorizedResponse, withMobileCors } from "../../../_shared";
import { expectedProjectErrorResponse } from "../../_helpers";

export const dynamic = "force-dynamic";

export function OPTIONS(request: Request) {
  return mobileCorsPreflightResponse(request);
}

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const auth = await requireMobileApiUser(request);
  if (!auth) return unauthorizedResponse(request);

  const { projectId } = await context.params;
  const body = (await request.json().catch(() => null)) as {
    title?: string;
    status?: unknown;
    parentTaskId?: string | null;
  } | null;
  if (body?.status !== undefined && !isProjectTaskStatus(body.status)) {
    return withMobileCors(NextResponse.json({ error: "Invalid project task status" }, { status: 400 }), request);
  }

  try {
    const task = await createProjectTask(auth.userId, {
      projectId,
      title: body?.title ?? "",
      status: body?.status ?? "backlog",
      parentTaskId: body?.parentTaskId ?? null,
    });
    return withMobileCors(NextResponse.json(task), request);
  } catch (error) {
    return expectedProjectErrorResponse(error, request);
  }
}
