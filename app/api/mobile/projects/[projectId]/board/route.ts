import { NextResponse } from "next/server";
import { loadProjectBoard } from "@/lib/projects/repository";
import { mobileCorsPreflightResponse, requireMobileApiUser, unauthorizedResponse, withMobileCors } from "../../../_shared";
import { expectedProjectErrorResponse, mobileJsonError, routeProjectMissing } from "../../_helpers";

export const dynamic = "force-dynamic";

export function OPTIONS(request: Request) {
  return mobileCorsPreflightResponse(request);
}

export async function GET(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const auth = await requireMobileApiUser(request);
  if (!auth) return unauthorizedResponse(request);

  const { projectId } = await context.params;
  try {
    const board = await loadProjectBoard(auth.userId, projectId);
    if (routeProjectMissing(board, projectId)) {
      return mobileJsonError(request, 404, "not found");
    }
    return withMobileCors(NextResponse.json(board), request);
  } catch (error) {
    return expectedProjectErrorResponse(error, request);
  }
}
