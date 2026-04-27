import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { mobileCorsPreflightResponse, requireMobileApiUser, unauthorizedResponse, withMobileCors } from "../../../_shared";

export const dynamic = "force-dynamic";

export function OPTIONS(request: Request) {
  return mobileCorsPreflightResponse(request);
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireMobileApiUser(request);
  if (!auth) return unauthorizedResponse(request);

  const { id } = await context.params;
  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from("items")
    .select("id")
    .eq("user_id", auth.userId)
    .eq("id", id)
    .single();

  if (!existing) {
    return withMobileCors(NextResponse.json({ error: "not found" }, { status: 404 }), request);
  }

  const { error } = await supabase
    .from("items")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
    })
    .eq("user_id", auth.userId)
    .eq("id", id);

  if (error) {
    return withMobileCors(NextResponse.json({ error: error.message }, { status: 500 }), request);
  }

  return withMobileCors(NextResponse.json({ ok: true }), request);
}
