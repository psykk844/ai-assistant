"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { classifySmartInput } from "@/lib/smart/classify-with-ai";
import { requireHardcodedSession, clearHardcodedSession } from "@/lib/auth/session";
import { resolveSessionUserId } from "@/lib/auth/session-user";

const ALLOWED_STATUSES = new Set(["active", "completed", "archived"]);

export async function captureInboxItem(formData: FormData) {
  const content = String(formData.get("content") ?? "").trim();
  if (!content) return;

  await requireHardcodedSession();

  const supabase = createAdminClient();
  const userId = await resolveSessionUserId();
  const classification = await classifySmartInput(content);

  const { error } = await supabase.from("items").insert({
    user_id: userId,
    type: classification.type,
    content,
    title: classification.title,
    status: "active",
    priority_score: classification.priorityScore,
    confidence_score: classification.confidenceScore,
    needs_review: classification.needsReview,
    metadata: classification.metadata,
  });

  if (error) throw new Error(`Failed to save inbox item: ${error.message}`);

  revalidatePath("/app");
}

export async function updateItemStatus(formData: FormData) {
  const itemId = String(formData.get("itemId") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();

  if (!itemId || !ALLOWED_STATUSES.has(status)) return;

  await requireHardcodedSession();

  const supabase = createAdminClient();
  const userId = await resolveSessionUserId();

  const { data: existing, error: existingError } = await supabase
    .from("items")
    .select("status")
    .eq("id", itemId)
    .eq("user_id", userId)
    .single();

  if (existingError) throw new Error(`Failed to load item for status update: ${existingError.message}`);

  const payload: Record<string, unknown> = {
    status,
    completed_at: status === "completed" ? new Date().toISOString() : null,
  };

  const { error } = await supabase
    .from("items")
    .update(payload)
    .eq("id", itemId)
    .eq("user_id", userId);

  if (error) throw new Error(`Failed to update item status: ${error.message}`);

  const fromStatus = String(existing.status ?? "active");
  const action = status === "completed" ? "completed" : "moved";

  const { error: interactionError } = await supabase.from("interactions").insert({
    user_id: userId,
    item_id: itemId,
    action,
    from_status: fromStatus,
    to_status: status,
  });

  if (interactionError) throw new Error(`Failed to record interaction: ${interactionError.message}`);

  revalidatePath("/app");
}

export async function markItemReviewed(formData: FormData) {
  const itemId = String(formData.get("itemId") ?? "").trim();
  if (!itemId) return;

  await requireHardcodedSession();

  const supabase = createAdminClient();
  const userId = await resolveSessionUserId();

  const { error } = await supabase
    .from("items")
    .update({ needs_review: false })
    .eq("id", itemId)
    .eq("user_id", userId);

  if (error) throw new Error(`Failed to mark item reviewed: ${error.message}`);

  const { error: interactionError } = await supabase.from("interactions").insert({
    user_id: userId,
    item_id: itemId,
    action: "corrected",
    from_status: "review",
    to_status: "accepted",
  });

  if (interactionError) throw new Error(`Failed to record review interaction: ${interactionError.message}`);

  revalidatePath("/app");
}

export async function signOut() {
  await clearHardcodedSession();
  redirect("/login");
}
