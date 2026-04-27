import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidLane, laneFromItem, laneToPriority, type LaneKey } from "@/lib/items/lane";
import { mobileCorsPreflightResponse, normalizeItemTags, requireMobileApiUser, unauthorizedResponse, withMobileCors } from "../../_shared";
import type { InboxItem } from "@/lib/items/types";

export const dynamic = "force-dynamic";

export function OPTIONS(request: Request) {
  return mobileCorsPreflightResponse(request);
}

function mobileItemResponse(item: InboxItem, request: Request) {
  return withMobileCors(
    NextResponse.json({
      id: item.id,
      title: item.title,
      content: item.content,
      created_at: item.created_at,
      priority_score: item.priority_score,
      tags: item.tags,
      type: item.type,
      status: item.status,
      lane: laneFromItem(item),
    }),
    request,
  );
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireMobileApiUser(request);
  if (!auth) return unauthorizedResponse(request);

  const { id } = await context.params;
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("items")
    .select("id, type, title, content, status, priority_score, confidence_score, needs_review, created_at, updated_at, metadata")
    .eq("user_id", auth.userId)
    .eq("id", id)
    .single();

  if (error || !data) {
    return withMobileCors(NextResponse.json({ error: "not found" }, { status: 404 }), request);
  }

  const item = normalizeItemTags(data as Omit<InboxItem, "tags"> & { tags?: string[] | null });

  return mobileItemResponse(item, request);
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireMobileApiUser(request);
  if (!auth) return unauthorizedResponse(request);

  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as {
    title?: unknown;
    content?: unknown;
    lane?: unknown;
    status?: unknown;
    priority_score?: unknown;
    tags?: unknown;
  } | null;

  if (!body) {
    return withMobileCors(NextResponse.json({ error: "valid JSON body is required" }, { status: 400 }), request);
  }

  const title = typeof body.title === "string" ? body.title.trim() : undefined;
  const content = typeof body.content === "string" ? body.content.trim() : undefined;
  if (title === "" && content === "") {
    return withMobileCors(NextResponse.json({ error: "title or content is required" }, { status: 400 }), request);
  }

  const lane = body.lane as LaneKey | undefined;
  if (lane !== undefined && !isValidLane(lane)) {
    return withMobileCors(NextResponse.json({ error: "valid lane is required" }, { status: 400 }), request);
  }

  const status = body.status;
  if (status !== undefined && status !== "active" && status !== "completed") {
    return withMobileCors(NextResponse.json({ error: "valid status is required" }, { status: 400 }), request);
  }

  const priorityScore = typeof body.priority_score === "number" ? body.priority_score : undefined;
  if (priorityScore !== undefined && (priorityScore < 0 || priorityScore > 1)) {
    return withMobileCors(NextResponse.json({ error: "priority_score must be between 0 and 1" }, { status: 400 }), request);
  }

  const tags = Array.isArray(body.tags) ? body.tags.filter((tag): tag is string => typeof tag === "string").map((tag) => tag.trim()).filter(Boolean) : undefined;

  const supabase = createAdminClient();
  const { data: existing, error: findError } = await supabase
    .from("items")
    .select("id, type, title, content, status, priority_score, confidence_score, needs_review, created_at, updated_at, metadata")
    .eq("user_id", auth.userId)
    .eq("id", id)
    .single();

  if (findError || !existing) {
    return withMobileCors(NextResponse.json({ error: "not found" }, { status: 404 }), request);
  }

  const metadata = ((existing.metadata as Record<string, unknown> | null | undefined) ?? {}) as Record<string, unknown>;
  const updatePayload: Record<string, unknown> = {};
  if (title !== undefined) updatePayload.title = title;
  if (content !== undefined) updatePayload.content = content;
  if (lane !== undefined) updatePayload.priority_score = laneToPriority(lane);
  if (priorityScore !== undefined) updatePayload.priority_score = priorityScore;
  if (status !== undefined) {
    updatePayload.status = status;
    updatePayload.completed_at = status === "completed" ? new Date().toISOString() : null;
  }
  if (tags !== undefined) updatePayload.metadata = { ...metadata, tags };

  const { data, error } = await supabase
    .from("items")
    .update(updatePayload)
    .eq("user_id", auth.userId)
    .eq("id", id)
    .select("id, type, title, content, status, priority_score, confidence_score, needs_review, created_at, updated_at, metadata")
    .single();

  if (error || !data) {
    return withMobileCors(NextResponse.json({ error: error?.message ?? "failed to update item" }, { status: 500 }), request);
  }

  const item = normalizeItemTags(data as Omit<InboxItem, "tags"> & { tags?: string[] | null });
  return mobileItemResponse(item, request);
}
