import { NextResponse } from "next/server";
import { createProject, loadProjectBoard } from "@/lib/projects/repository";
import { isProjectArea } from "@/lib/projects/status";
import { mobileCorsPreflightResponse, requireMobileApiUser, unauthorizedResponse, withMobileCors } from "../_shared";
import { expectedProjectErrorResponse, mobileJsonError, routeProjectMissing } from "./_helpers";

export const dynamic = "force-dynamic";

export function OPTIONS(request: Request) {
  return mobileCorsPreflightResponse(request);
}

export async function GET(request: Request) {
  const auth = await requireMobileApiUser(request);
  if (!auth) return unauthorizedResponse(request);

  const params = new URL(request.url).searchParams;
  const projectId = params.get("project");
  const area = params.get("area");
  try {
    const board = await loadProjectBoard(auth.userId, projectId, isProjectArea(area) ? area : "demand");
    if (projectId && routeProjectMissing(board, projectId)) {
      return mobileJsonError(request, 404, "not found");
    }
    return withMobileCors(NextResponse.json(board), request);
  } catch (error) {
    return expectedProjectErrorResponse(error, request);
  }
}

export async function POST(request: Request) {
  const auth = await requireMobileApiUser(request);
  if (!auth) return unauthorizedResponse(request);

  const body = (await request.json().catch(() => null)) as { area?: unknown; name?: string; description?: string | null } | null;
  try {
    const project = await createProject(auth.userId, {
      area: isProjectArea(body?.area) ? body.area : "demand",
      name: body?.name ?? "",
      description: body?.description ?? null,
    });
    return withMobileCors(NextResponse.json(project), request);
  } catch (error) {
    return expectedProjectErrorResponse(error, request);
  }
}
