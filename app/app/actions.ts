"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { classifySmartInput } from "@/lib/smart/classify-with-ai";
import { requireHardcodedSession, clearHardcodedSession } from "@/lib/auth/session";
import { resolveSessionUserId } from "@/lib/auth/session-user";
import { laneToPriority, type LaneKey } from "@/lib/items/lane";
import { indexItemsInVectorStore } from "@/lib/items/embeddings";

const ALLOWED_STATUSES = new Set(["active", "completed", "archived"]);
const ALLOWED_TYPES = new Set(["note", "todo", "link"]);

function splitInboxChunks(raw: string): string[] {
  const blankLineParts = raw.split(/\n\s*\n/).map((c) => c.trim()).filter(Boolean);
  if (blankLineParts.length > 1) return blankLineParts;

  const lines = raw.split(/\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length > 1 && lines.every((l) => l.length <= 120)) {
    return lines.map((l) => l.replace(/[,;]+$/, "").trim()).filter(Boolean);
  }

  if (lines.length === 1) {
    const parts = lines[0].split(/[,;]/).map((p) => p.trim()).filter(Boolean);
    if (parts.length > 1 && parts.every((part) => part.length <= 120)) return parts;
  }

  return [raw.trim()];
}

export async function captureInboxItem(formData: FormData) {
  const raw = String(formData.get("content") ?? "").trim();
  if (!raw) return;

  await requireHardcodedSession();

  const chunks = splitInboxChunks(raw);
  if (chunks.length === 0) return;

  const supabase = createAdminClient();
  const userId = await resolveSessionUserId();

  const classifications = await Promise.all(chunks.map((chunk) => classifySmartInput(chunk)));

  const rows = chunks.map((chunk, i) => ({
    user_id: userId,
    type: classifications[i].type,
    content: chunk,
    title: classifications[i].title,
    status: "active" as const,
    priority_score: classifications[i].priorityScore,
    confidence_score: classifications[i].confidenceScore,
    needs_review: classifications[i].needsReview,
    metadata: classifications[i].metadata,
  }));

  const { data, error } = await supabase
    .from("items")
    .insert(rows)
    .select("id,user_id,title,content,type,status");

  if (error) throw new Error(`Failed to save inbox items: ${error.message}`);

  await indexItemsInVectorStore((data ?? []) as Array<{ id: string; user_id: string; title: string | null; content: string; type: string; status: string }>);

  revalidatePath("/app");
  revalidatePath("/widget");
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

  const { error } = await supabase.from("items").update(payload).eq("id", itemId).eq("user_id", userId);
  if (error) throw new Error(`Failed to update item status: ${error.message}`);

  const fromStatus = String(existing.status ?? "active");
  const action = status === "completed" ? "completed" : "moved";

  await supabase.from("interactions").insert({
    user_id: userId,
    item_id: itemId,
    action,
    from_status: fromStatus,
    to_status: status,
  });

  revalidatePath("/app");
  revalidatePath("/widget");
}

export async function moveItemToLane(input: { itemId: string; toLane: LaneKey; fromLane?: LaneKey }) {
  await requireHardcodedSession();

  const itemId = String(input.itemId ?? "").trim();
  const toLane = input.toLane;
  const fromLane = input.fromLane;
  if (!itemId || !toLane) return;

  const supabase = createAdminClient();
  const userId = await resolveSessionUserId();

  const nextPriority = laneToPriority(toLane);

  const { error } = await supabase
    .from("items")
    .update({
      status: "active",
      priority_score: nextPriority,
    })
    .eq("id", itemId)
    .eq("user_id", userId);

  if (error) throw new Error(`Failed to move item: ${error.message}`);

  await supabase.from("interactions").insert({
    user_id: userId,
    item_id: itemId,
    action: "reordered",
    from_status: fromLane ?? "unknown",
    to_status: toLane,
  });

  revalidatePath("/app");
  revalidatePath("/widget");
}

export async function updateItemDetails(formData: FormData) {
  await requireHardcodedSession();

  const itemId = String(formData.get("itemId") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  const type = String(formData.get("type") ?? "").trim();
  const lane = String(formData.get("lane") ?? "").trim() as LaneKey;
  const markReviewed = String(formData.get("markReviewed") ?? "false") === "true";

  if (!itemId || !content) return;
  if (!ALLOWED_TYPES.has(type)) return;

  const supabase = createAdminClient();
  const userId = await resolveSessionUserId();

  const { data: existing } = await supabase
    .from("items")
    .select("status")
    .eq("id", itemId)
    .eq("user_id", userId)
    .single();

  const payload: Record<string, unknown> = {
    title: title || null,
    content,
    type,
    priority_score: laneToPriority(lane),
    status: "active",
  };

  if (markReviewed) payload.needs_review = false;

  const { data, error } = await supabase
    .from("items")
    .update(payload)
    .eq("id", itemId)
    .eq("user_id", userId)
    .select("id,user_id,title,content,type,status")
    .single();

  if (error) throw new Error(`Failed to update item details: ${error.message}`);

  await supabase.from("interactions").insert({
    user_id: userId,
    item_id: itemId,
    action: "moved",
    from_status: String(existing?.status ?? "active"),
    to_status: lane,
  });

  await indexItemsInVectorStore([data as { id: string; user_id: string; title: string | null; content: string; type: string; status: string }]);

  revalidatePath("/app");
  revalidatePath("/widget");
}

export async function dismissItem(formData: FormData) {
  await requireHardcodedSession();
  const itemId = String(formData.get("itemId") ?? "").trim();
  if (!itemId) return;

  const supabase = createAdminClient();
  const userId = await resolveSessionUserId();

  const { data: existing } = await supabase
    .from("items")
    .select("metadata")
    .eq("id", itemId)
    .eq("user_id", userId)
    .single();

  const metadata = ((existing?.metadata ?? {}) as Record<string, unknown>);

  const { error } = await supabase
    .from("items")
    .update({ status: "archived", metadata: { ...metadata, dismissed: true } })
    .eq("id", itemId)
    .eq("user_id", userId);

  if (error) throw new Error(`Failed to dismiss item: ${error.message}`);

  await supabase.from("interactions").insert({
    user_id: userId,
    item_id: itemId,
    action: "deleted",
    from_status: "active",
    to_status: "dismissed",
  });

  revalidatePath("/app");
  revalidatePath("/widget");
}

export async function clearCompletedBacklog() {
  await requireHardcodedSession();

  const supabase = createAdminClient();
  const userId = await resolveSessionUserId();

  const { data: completed } = await supabase
    .from("items")
    .select("id,metadata")
    .eq("user_id", userId)
    .eq("status", "completed");

  if (!completed || completed.length === 0) return;

  for (const row of completed) {
    const metadata = ((row.metadata ?? {}) as Record<string, unknown>);
    await supabase
      .from("items")
      .update({ status: "archived", metadata: { ...metadata, cleared_from_backlog: true } })
      .eq("id", row.id)
      .eq("user_id", userId);

    await supabase.from("interactions").insert({
      user_id: userId,
      item_id: row.id,
      action: "moved",
      from_status: "completed",
      to_status: "archived",
    });
  }

  revalidatePath("/app");
  revalidatePath("/widget");
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

  await supabase.from("interactions").insert({
    user_id: userId,
    item_id: itemId,
    action: "corrected",
    from_status: "review",
    to_status: "accepted",
  });

  revalidatePath("/app");
}

export async function createSubtaskFromSuggestion(formData: FormData) {
  await requireHardcodedSession();

  const parentId = String(formData.get("itemId") ?? "").trim();
  const text = String(formData.get("text") ?? "").trim();
  if (!parentId || !text) return;

  const supabase = createAdminClient();
  const userId = await resolveSessionUserId();

  const { data, error } = await supabase
    .from("items")
    .insert({
      user_id: userId,
      type: "todo",
      title: text.slice(0, 90),
      content: text,
      status: "active",
      priority_score: 0.7,
      confidence_score: 0.9,
      needs_review: false,
      metadata: { parent_item_id: parentId, generated_from: "ai-suggested-action" },
    })
    .select("id,user_id,title,content,type,status");

  if (error) throw new Error(`Failed to create subtask: ${error.message}`);

  await indexItemsInVectorStore((data ?? []) as Array<{ id: string; user_id: string; title: string | null; content: string; type: string; status: string }>);

  revalidatePath("/app");
  revalidatePath("/widget");
}

export async function signOut() {
  await clearHardcodedSession();
  redirect("/login");
}
