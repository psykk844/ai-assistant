import { NextResponse } from "next/server";
import { createProject, loadProjectBoard } from "@/lib/projects/repository";
import { mobileCorsPreflightResponse, requireMobileApiUser, unauthorizedResponse, withMobileCors } from "../_shared";

export const dynamic = "force-dynamic";

export function OPTIONS(request: Request) {
  return mobileCorsPreflightResponse(request);
}

export async function GET(request: Request) {
  const auth = await requireMobileApiUser(request);
  if (!auth) return unauthorizedResponse(request);

  const projectId = new URL(request.url).searchParams.get("project");
  const board = await loadProjectBoard(auth.userId, projectId);
  return withMobileCors(NextResponse.json(board), request);
}

export async function POST(request: Request) {
  const auth = await requireMobileApiUser(request);
  if (!auth) return unauthorizedResponse(request);

  const body = (await request.json().catch(() => null)) as { name?: string; description?: string | null } | null;
  const project = await createProject(auth.userId, {
    name: body?.name ?? "",
    description: body?.description ?? null,
  });

  return withMobileCors(NextResponse.json(project), request);
}
