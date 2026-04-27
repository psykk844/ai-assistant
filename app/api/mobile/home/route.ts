import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildMobileHomePayload } from "@/lib/items/mobile-contracts";
import { mobileCorsPreflightResponse, normalizeItemTags, requireMobileApiUser, unauthorizedResponse, withMobileCors } from "../_shared";
import type { InboxItem } from "@/lib/items/types";

export const dynamic = "force-dynamic";

export function OPTIONS(request: Request) {
  return mobileCorsPreflightResponse(request);
}

export async function GET(request: Request) {
  const auth = await requireMobileApiUser(request);
  if (!auth) return unauthorizedResponse(request);

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
    console.error("mobile/home query failed", error);
    return withMobileCors(NextResponse.json({ error: error.message }, { status: 500 }), request);
  }

  const items = ((data ?? []) as Array<Omit<InboxItem, "tags"> & { tags?: string[] | null }>).map(normalizeItemTags);
  return withMobileCors(NextResponse.json(buildMobileHomePayload(items)), request);
}
