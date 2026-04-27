import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidLane, laneToPriority, type LaneKey } from "@/lib/items/lane";
import { mobileCorsPreflightResponse, withoutTrashFlags, requireMobileApiUser, unauthorizedResponse, withMobileCors } from "../../../_shared";

export const dynamic = "force-dynamic";

export function OPTIONS(request: NextRequest) {
  return mobileCorsPreflightResponse(request);
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireMobileApiUser(request);
  if (!auth) return unauthorizedResponse(request);

  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as { lane?: LaneKey } | null;
  const lane = body?.lane;

  if (!isValidLane(lane)) {
    return withMobileCors(NextResponse.json({ error: "valid lane is required" }, { status: 400 }), request);
  }

  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from("items")
    .select("id, metadata")
    .eq("user_id", auth.userId)
    .eq("id", id)
    .single();

  if (!existing) {
    return withMobileCors(NextResponse.json({ error: "not found" }, { status: 404 }), request);
  }

  const { error } = await supabase
    .from("items")
    .update({
      status: "active",
      priority_score: laneToPriority(lane),
      metadata: withoutTrashFlags((existing.metadata as Record<string, unknown> | null | undefined) ?? {}),
    })
    .eq("user_id", auth.userId)
    .eq("id", id);

  if (error) {
    return withMobileCors(NextResponse.json({ error: error.message }, { status: 500 }), request);
  }

  return withMobileCors(NextResponse.json({ ok: true }), request);
}
