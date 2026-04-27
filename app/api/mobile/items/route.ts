import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { laneToPriority, type LaneKey, isValidLane } from "@/lib/items/lane";
import { laneFromItem } from "@/lib/items/lane";
import { mobileCorsPreflightResponse, normalizeItemTags, requireMobileApiUser, unauthorizedResponse, withMobileCors } from "../_shared";
import type { InboxItem } from "@/lib/items/types";

export const dynamic = "force-dynamic";

export function OPTIONS(request: NextRequest) {
  return mobileCorsPreflightResponse(request);
}

export async function POST(request: NextRequest) {
  const auth = await requireMobileApiUser(request);
  if (!auth) return unauthorizedResponse(request);

  const body = (await request.json().catch(() => null)) as { content?: string; lane?: LaneKey } | null;
  const content = body?.content?.trim() ?? "";
  const lane = body?.lane;

  if (!content) {
    return withMobileCors(NextResponse.json({ error: "content is required" }, { status: 400 }), request);
  }

  if (!isValidLane(lane)) {
    return withMobileCors(NextResponse.json({ error: "valid lane is required" }, { status: 400 }), request);
  }

  const supabase = createAdminClient();
  const insertPayload = {
    user_id: auth.userId,
    type: "todo" as const,
    title: content,
    content,
    status: "active" as const,
    priority_score: laneToPriority(lane),
    confidence_score: null,
    needs_review: false,
    metadata: {},
  };

  const { data, error } = await supabase
    .from("items")
    .insert(insertPayload)
    .select("id, type, title, content, status, priority_score, confidence_score, needs_review, created_at, updated_at, metadata")
    .single();

  if (error || !data) {
    return withMobileCors(NextResponse.json({ error: error?.message ?? "failed to create item" }, { status: 500 }), request);
  }

  const item = normalizeItemTags(data as Omit<InboxItem, "tags"> & { tags?: string[] | null });
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
