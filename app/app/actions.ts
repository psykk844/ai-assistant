"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { classifySmartInput } from "@/lib/smart/classify-with-ai";
import { requireHardcodedSession, clearHardcodedSession } from "@/lib/auth/session";
import { resolveSessionUserId } from "@/lib/auth/session-user";

const ALLOWED_STATUSES = new Set(["active", "completed", "archived"]);

/**
 * Split raw input into individual items.
 *
 * Detection order:
 * 1. Blank-line separated chunks  (double Enter)
 * 2. Each non-blank line is short & standalone  (one item per line)
 * 3. Comma/semicolon separated on a single line
 *
 * A "short standalone line" is ≤120 chars and the input has ≥2 such lines.
 * This covers the natural "type a quick list" pattern.
 */
function splitInboxChunks(raw: string): string[] {
  // --- Strategy 1: blank-line separated ---
  const blankLineParts = raw.split(/\n\s*\n/).map((c) => c.trim()).filter(Boolean);
  if (blankLineParts.length > 1) return blankLineParts;

  // --- Strategy 2: each line is a standalone short item ---
  const lines = raw.split(/\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length > 1 && lines.every((l) => l.length <= 120)) {
    // Strip trailing commas/semicolons that people add out of habit
    return lines.map((l) => l.replace(/[,;]+$/, "").trim()).filter(Boolean);
  }

  // --- Strategy 3: comma / semicolon separated on one line ---
  if (lines.length === 1) {
    const parts = lines[0].split(/[,;]/).map((p) => p.trim()).filter(Boolean);
    if (parts.length > 1 && parts.every((p) => p.length <= 120)) {
      return parts;
    }
  }

  // --- Fallback: single item ---
  return [raw];
}

export async function captureInboxItem(formData: FormData) {
  const raw = String(formData.get("content") ?? "").trim();
  if (!raw) return;

  await requireHardcodedSession();

  const chunks = splitInboxChunks(raw);
  if (chunks.length === 0) return;

  const supabase = createAdminClient();
  const userId = await resolveSessionUserId();

  // Classify all chunks in parallel
  const classifications = await Promise.all(
    chunks.map((chunk) => classifySmartInput(chunk)),
  );

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

  const { error } = await supabase.from("items").insert(rows);

  if (error) throw new Error(`Failed to save inbox items: ${error.message}`);

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
