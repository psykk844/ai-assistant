import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildMobileBacklogPage } from "@/lib/items/mobile-contracts";
import type { InboxItem } from "@/lib/items/types";
import { mobileCorsPreflightResponse, normalizeItemTags, requireMobileApiUser, unauthorizedResponse, withMobileCors } from "../_shared";

export const dynamic = "force-dynamic";

export function OPTIONS(request: NextRequest) {
  return mobileCorsPreflightResponse(request);
}

export async function GET(request: NextRequest) {
  const auth = await requireMobileApiUser(request);
  if (!auth) return unauthorizedResponse(request);

  const cursor = request.nextUrl.searchParams.get("cursor") ?? undefined;
  const search = request.nextUrl.searchParams.get("search")?.trim().toLowerCase() ?? "";
  const limitParam = Number(request.nextUrl.searchParams.get("limit") ?? "20");
  const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(50, limitParam)) : 20;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("items")
    .select("id, type, title, content, status, priority_score, confidence_score, needs_review, created_at, updated_at, metadata")
    .eq("user_id", auth.userId)
    .eq("status", "active")
    .order("priority_score", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    console.error("mobile/backlog query failed", error);
    return withMobileCors(NextResponse.json({ error: error.message }, { status: 500 }), request);
  }

  const items = ((data ?? []) as Array<Omit<InboxItem, "tags"> & { tags?: string[] | null }>).map(normalizeItemTags);
  const sourceItems = search
    ? items.filter((item) => {
        const haystack = `${item.title ?? ""} ${item.content}`.toLowerCase();
        return haystack.includes(search);
      })
    : items;

  const page = buildMobileBacklogPage(sourceItems, { cursor, limit, search });

  return withMobileCors(NextResponse.json(page), request);
}
