import { NextResponse } from "next/server";
import { createChecklistItem, updateChecklistItem } from "@/lib/projects/repository";
import { mobileCorsPreflightResponse, requireMobileApiUser, unauthorizedResponse, withMobileCors } from "../../../../../_shared";

export const dynamic = "force-dynamic";

export function OPTIONS(request: Request) {
  return mobileCorsPreflightResponse(request);
}

export async function POST(request: Request, context: { params: Promise<{ taskId: string }> }) {
  const auth = await requireMobileApiUser(request);
  if (!auth) return unauthorizedResponse(request);

  const { taskId } = await context.params;
  const body = (await request.json().catch(() => null)) as { title?: string } | null;
  const item = await createChecklistItem(auth.userId, taskId, body?.title ?? "");
  return withMobileCors(NextResponse.json(item), request);
}

export async function PATCH(request: Request) {
  const auth = await requireMobileApiUser(request);
  if (!auth) return unauthorizedResponse(request);

  const body = (await request.json().catch(() => null)) as {
    itemId?: string;
    title?: string;
    completed?: boolean;
    position?: number;
  } | null;
  if (!body?.itemId) {
    return withMobileCors(NextResponse.json({ error: "itemId is required" }, { status: 400 }), request);
  }

  const item = await updateChecklistItem(auth.userId, body.itemId, {
    title: body.title,
    completed: body.completed,
    position: body.position,
  });

  return withMobileCors(NextResponse.json(item), request);
}
