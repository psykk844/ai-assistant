import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { laneFromItem } from "@/lib/items/lane";
import { mobileCorsPreflightResponse, normalizeItemTags, requireMobileApiUser, unauthorizedResponse, withMobileCors } from "../../_shared";
import type { InboxItem } from "@/lib/items/types";

export const dynamic = "force-dynamic";

export function OPTIONS(request: Request) {
  return mobileCorsPreflightResponse(request);
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireMobileApiUser(request);
  if (!auth) return unauthorizedResponse(request);

  const { id } = await context.params;
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("items")
    .select("id, type, title, content, status, priority_score, confidence_score, needs_review, created_at, updated_at, metadata, tags")
    .eq("user_id", auth.userId)
    .eq("id", id)
    .single();

  if (error || !data) {
    return withMobileCors(NextResponse.json({ error: "not found" }, { status: 404 }), request);
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
