"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { classifySmartInput } from "@/lib/smart/classify-with-ai";
import { requireHardcodedSession, clearHardcodedSession } from "@/lib/auth/session";
import { resolveSessionUserId } from "@/lib/auth/session-user";
import { laneToPriority, type LaneKey } from "@/lib/items/lane";
import { indexItemsInVectorStore } from "@/lib/items/embeddings";
import { mirrorItemToObsidian, removeMirroredFileFromMetadata } from "@/lib/obsidian/mirror";
import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const ALLOWED_STATUSES = new Set(["active", "completed", "archived"]);
const ALLOWED_TYPES = new Set(["note", "todo", "link"]);
const TRASH_RETENTION_DAYS = 30;
const SERVER_ACTION_ERROR_LOG_PATH = process.env.SERVER_ACTION_ERROR_LOG_PATH?.trim() || "/workspace/ai-assistant/.runtime-logs/server-action-errors.log";

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    message: String(error),
  };
}

async function persistServerActionError(action: string, context: Record<string, unknown>) {
  try {
    await mkdir(dirname(SERVER_ACTION_ERROR_LOG_PATH), { recursive: true });
    await appendFile(
      SERVER_ACTION_ERROR_LOG_PATH,
      JSON.stringify({
        ts: new Date().toISOString(),
        action,
        ...context,
      }) + "\n",
      "utf8",
    );
  } catch (persistError) {
    console.error("Failed to persist server action error log", {
      action,
      persistError: serializeError(persistError),
    });
  }
}

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

function asMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function withoutTrashFlags(metadata: Record<string, unknown>) {
  const { deleted_at: _deletedAt, dismissed: _dismissed, ...rest } = metadata;
  return rest;
}

function normalizeTags(input: unknown) {
  if (Array.isArray(input)) {
    return Array.from(
      new Set(
        input
          .map((tag) => String(tag ?? "").trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""))
          .filter(Boolean),
      ),
    );
  }

  if (typeof input === "string") {
    try {
      return normalizeTags(JSON.parse(input));
    } catch {
      return normalizeTags(input.split(","));
    }
  }

  return [] as string[];
}

type BulkUpdateInput = {
  status?: "active" | "completed" | "archived";
  type?: "note" | "todo" | "link";
  priority_score?: number;
  tags?: string[];
  metadata_patch?: Record<string, unknown>;
  markReviewed?: boolean;
};

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
      .select("id,user_id,title,content,type,status,priority_score,confidence_score,needs_review,created_at,updated_at,metadata,tags");

  if (error) throw new Error(`Failed to save inbox items: ${error.message}`);

  const inserted = (data ?? []) as Array<{
    id: string;
    user_id: string;
    title: string | null;
    content: string;
    type: "todo" | "note" | "link";
    status: "active" | "completed" | "archived";
    priority_score: number;
    confidence_score: number | null;
    needs_review: boolean;
    created_at: string;
    updated_at?: string;
    metadata?: Record<string, unknown>;
    tags: string[];
  }>;

  for (const row of inserted) {
    const mirrored = await mirrorItemToObsidian(row);
    if (mirrored) {
      const metadata = asMetadata(row.metadata);
      await supabase
        .from("items")
        .update({ metadata: { ...metadata, obsidian_path: mirrored.obsidianPath } })
        .eq("id", row.id)
        .eq("user_id", userId);
    }
  }

  await indexItemsInVectorStore(
    inserted.map((row) => ({
      id: row.id,
      user_id: row.user_id,
      title: row.title,
      content: row.content,
      type: row.type,
      status: row.status,
    })),
  );

  revalidatePath("/app");
  revalidatePath("/widget");
}

export async function updateItemStatus(formData: FormData) {
  const itemId = String(formData.get("itemId") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();

  if (!itemId || !ALLOWED_STATUSES.has(status)) return;

  try {
    await requireHardcodedSession();

    const supabase = createAdminClient();
    const userId = await resolveSessionUserId();

    const { data: existing, error: existingError } = await supabase
      .from("items")
      .select("status, metadata")
      .eq("id", itemId)
      .eq("user_id", userId)
      .single();

    if (existingError) {
      console.error("Failed to load item for status update", { itemId, status, error: existingError });
      await persistServerActionError("updateItemStatus:load", {
        itemId,
        status,
        error: serializeError(existingError),
      });
      return;
    }

    const metadata = asMetadata(existing?.metadata);

    const payload: Record<string, unknown> = {
      status,
      completed_at: status === "completed" ? new Date().toISOString() : null,
    };

    if (status === "active") payload.metadata = withoutTrashFlags(metadata);

    const { data: updatedItem, error } = await supabase
      .from("items")
      .update(payload)
      .eq("id", itemId)
      .eq("user_id", userId)
      .select("id,user_id,title,content,type,status,priority_score,confidence_score,needs_review,created_at,updated_at,metadata,tags")
      .single();

    if (error) {
      console.error("Failed to update item status", { itemId, status, error });
      await persistServerActionError("updateItemStatus:update", {
        itemId,
        status,
        error: serializeError(error),
      });
      return;
    }

    if (updatedItem && status !== "archived") {
      try {
        const mirrored = await mirrorItemToObsidian(updatedItem as {
          id: string;
          user_id: string;
          title: string | null;
          content: string;
          type: "todo" | "note" | "link";
          status: "active" | "completed" | "archived";
          priority_score: number;
          confidence_score: number | null;
          needs_review: boolean;
          created_at: string;
          updated_at?: string;
          metadata?: Record<string, unknown>;
          tags: string[];
        });
        if (mirrored) {
          const metadataNext = asMetadata((updatedItem as { metadata?: Record<string, unknown> }).metadata);
          await supabase
            .from("items")
            .update({ metadata: { ...metadataNext, obsidian_path: mirrored.obsidianPath } })
            .eq("id", itemId)
            .eq("user_id", userId);
        }
      } catch (error) {
        console.error("Failed to mirror updated item to Obsidian", {
          itemId,
          status,
          error,
        });
      }
    }

    const fromStatus = String(existing.status ?? "active");
    const action = status === "completed" ? "completed" : "moved";

    try {
      await supabase.from("interactions").insert({
        user_id: userId,
        item_id: itemId,
        action,
        from_status: fromStatus,
        to_status: status,
      });
    } catch (error) {
      console.error("Failed to log item status interaction", {
        itemId,
        fromStatus,
        toStatus: status,
        error,
      });
      await persistServerActionError("updateItemStatus:interaction", {
        itemId,
        fromStatus,
        toStatus: status,
        error: serializeError(error),
      });
    }

    try {
      revalidatePath("/app");
      revalidatePath("/widget");
    } catch (error) {
      console.error("Failed to revalidate after status update", { itemId, status, error });
      await persistServerActionError("updateItemStatus:revalidate", {
        itemId,
        status,
        error: serializeError(error),
      });
    }
  } catch (error) {
    console.error("Unhandled error in updateItemStatus", {
      itemId,
      status,
      error,
    });
    await persistServerActionError("updateItemStatus:unhandled", {
      itemId,
      status,
      error: serializeError(error),
    });
  }
}


export async function moveItemToLane(input: { itemId: string; toLane: LaneKey; fromLane?: LaneKey }) {
  await requireHardcodedSession();

  const itemId = String(input.itemId ?? "").trim();
  const toLane = input.toLane;
  const fromLane = input.fromLane;
  if (!itemId || !toLane) return;

  const supabase = createAdminClient();
  const userId = await resolveSessionUserId();

  const { data: existing } = await supabase
    .from("items")
    .select("metadata")
    .eq("id", itemId)
    .eq("user_id", userId)
    .single();

  const metadata = withoutTrashFlags(asMetadata(existing?.metadata));

  const nextPriority = laneToPriority(toLane);

  const { data: movedItem, error } = await supabase
    .from("items")
    .update({
      status: "active",
      priority_score: nextPriority,
      metadata,
    })
    .eq("id", itemId)
    .eq("user_id", userId)
    .select("id,user_id,title,content,type,status,priority_score,confidence_score,needs_review,created_at,updated_at,metadata")
    .single();

  if (error) throw new Error(`Failed to move item: ${error.message}`);

  if (movedItem) {
    const mirrored = await mirrorItemToObsidian(movedItem as {
      id: string;
      user_id: string;
      title: string | null;
      content: string;
      type: "todo" | "note" | "link";
      status: "active" | "completed" | "archived";
      priority_score: number;
      confidence_score: number | null;
      needs_review: boolean;
      created_at: string;
      updated_at?: string;
      metadata?: Record<string, unknown>;
    });
    if (mirrored) {
      const metadataNext = asMetadata((movedItem as { metadata?: Record<string, unknown> }).metadata);
      await supabase
        .from("items")
        .update({ metadata: { ...metadataNext, obsidian_path: mirrored.obsidianPath } })
        .eq("id", itemId)
        .eq("user_id", userId);
    }
  }

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
  const tags = normalizeTags(formData.get("tags"));

  if (!itemId || !content) return;
  if (!ALLOWED_TYPES.has(type)) return;

  const supabase = createAdminClient();
  const userId = await resolveSessionUserId();

  const { data: existing } = await supabase
    .from("items")
    .select("status, metadata")
    .eq("id", itemId)
    .eq("user_id", userId)
    .single();

  const payload: Record<string, unknown> = {
    title: title || null,
    content,
    type,
    tags,
    priority_score: laneToPriority(lane),
    status: "active",
    metadata: withoutTrashFlags(asMetadata(existing?.metadata)),
  };

  if (markReviewed) payload.needs_review = false;

  const { data, error } = await supabase
    .from("items")
    .update(payload)
    .eq("id", itemId)
    .eq("user_id", userId)
     .select("id,user_id,title,content,type,status,priority_score,confidence_score,needs_review,created_at,updated_at,metadata,tags")
    .single();

  if (error) throw new Error(`Failed to update item details: ${error.message}`);

  await supabase.from("interactions").insert({
    user_id: userId,
    item_id: itemId,
    action: "moved",
    from_status: String(existing?.status ?? "active"),
    to_status: lane,
  });

  const updated = data as {
    id: string;
    user_id: string;
    title: string | null;
    content: string;
    type: "todo" | "note" | "link";
    status: "active" | "completed" | "archived";
    priority_score: number;
    confidence_score: number | null;
    needs_review: boolean;
    created_at: string;
    updated_at?: string;
    metadata?: Record<string, unknown>;
    tags: string[];
  };

  const mirrored = await mirrorItemToObsidian(updated);
  if (mirrored) {
    const metadataNext = asMetadata(updated.metadata);
    await supabase
      .from("items")
      .update({ metadata: { ...metadataNext, obsidian_path: mirrored.obsidianPath } })
      .eq("id", itemId)
      .eq("user_id", userId);
  }

  await indexItemsInVectorStore([
    {
      id: updated.id,
      user_id: updated.user_id,
      title: updated.title,
      content: updated.content,
      type: updated.type,
      status: updated.status,
    },
  ]);

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
    .select("status, metadata")
    .eq("id", itemId)
    .eq("user_id", userId)
    .single();

  const metadata = asMetadata(existing?.metadata);

  const { error } = await supabase
    .from("items")
    .update({
      status: "archived",
      metadata: {
        ...metadata,
        dismissed: true,
        deleted_at: new Date().toISOString(),
      },
    })
    .eq("id", itemId)
    .eq("user_id", userId);

  if (error) throw new Error(`Failed to move item to trash: ${error.message}`);

  await removeMirroredFileFromMetadata(metadata);

  await supabase.from("interactions").insert({
    user_id: userId,
    item_id: itemId,
    action: "deleted",
    from_status: String(existing?.status ?? "active"),
    to_status: "trash",
  });

  revalidatePath("/app");
  revalidatePath("/widget");
}

export async function restoreItemFromTrash(formData: FormData) {
  await requireHardcodedSession();
  const itemId = String(formData.get("itemId") ?? "").trim();
  if (!itemId) return;

  const supabase = createAdminClient();
  const userId = await resolveSessionUserId();

  const { data: existing, error: loadError } = await supabase
    .from("items")
    .select("status, metadata")
    .eq("id", itemId)
    .eq("user_id", userId)
    .single();

  if (loadError) throw new Error(`Failed to load trash item: ${loadError.message}`);

  const metadata = withoutTrashFlags(asMetadata(existing?.metadata));

  const { data: restoredItem, error } = await supabase
    .from("items")
    .update({
      status: "active",
      metadata,
    })
    .eq("id", itemId)
    .eq("user_id", userId)
    .select("id,user_id,title,content,type,status,priority_score,confidence_score,needs_review,created_at,updated_at,metadata")
    .single();

  if (error) throw new Error(`Failed to restore item: ${error.message}`);

  if (restoredItem) {
    const mirrored = await mirrorItemToObsidian(restoredItem as {
      id: string;
      user_id: string;
      title: string | null;
      content: string;
      type: "todo" | "note" | "link";
      status: "active" | "completed" | "archived";
      priority_score: number;
      confidence_score: number | null;
      needs_review: boolean;
      created_at: string;
      updated_at?: string;
      metadata?: Record<string, unknown>;
    });
    if (mirrored) {
      const metadataNext = asMetadata((restoredItem as { metadata?: Record<string, unknown> }).metadata);
      await supabase
        .from("items")
        .update({ metadata: { ...metadataNext, obsidian_path: mirrored.obsidianPath } })
        .eq("id", itemId)
        .eq("user_id", userId);
    }
  }

  await supabase.from("interactions").insert({
    user_id: userId,
    item_id: itemId,
    action: "moved",
    from_status: "trash",
    to_status: "active",
  });

  revalidatePath("/app");
  revalidatePath("/widget");
}

export async function permanentlyDeleteItem(formData: FormData) {
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

  await removeMirroredFileFromMetadata(asMetadata(existing?.metadata));

  const { error } = await supabase.from("items").delete().eq("id", itemId).eq("user_id", userId);
  if (error) throw new Error(`Failed to permanently delete item: ${error.message}`);

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
    const metadata = asMetadata(row.metadata);
    await supabase
      .from("items")
      .update({
        status: "archived",
        metadata: {
          ...metadata,
          cleared_from_backlog: true,
          deleted_at: new Date().toISOString(),
        },
      })
      .eq("id", row.id)
      .eq("user_id", userId);

    await removeMirroredFileFromMetadata(metadata);

    await supabase.from("interactions").insert({
      user_id: userId,
      item_id: row.id,
      action: "deleted",
      from_status: "completed",
      to_status: "trash",
    });
  }

  revalidatePath("/app");
  revalidatePath("/widget");
}

export async function purgeExpiredTrash() {
  await requireHardcodedSession();

  const supabase = createAdminClient();
  const userId = await resolveSessionUserId();

  const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: archived } = await supabase
    .from("items")
    .select("id,metadata")
    .eq("user_id", userId)
    .eq("status", "archived");

  const purgeIds = (archived ?? [])
    .filter((row) => {
      const deletedAt = String(asMetadata(row.metadata).deleted_at ?? "").trim();
      if (!deletedAt) return false;
      return deletedAt <= cutoff;
    })
    .map((row) => row.id);

  if (purgeIds.length === 0) return;

  for (const row of (archived ?? []).filter((row) => purgeIds.includes(row.id))) {
    await removeMirroredFileFromMetadata(asMetadata(row.metadata));
  }

  const { error } = await supabase
    .from("items")
    .delete()
    .eq("user_id", userId)
    .in("id", purgeIds);

  if (error) throw new Error(`Failed to purge trash: ${error.message}`);

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
    .select("id,user_id,title,content,type,status,priority_score,confidence_score,needs_review,created_at,updated_at,metadata");

  if (error) throw new Error(`Failed to create subtask: ${error.message}`);

  const inserted = (data ?? []) as Array<{
    id: string;
    user_id: string;
    title: string | null;
    content: string;
    type: "todo" | "note" | "link";
    status: "active" | "completed" | "archived";
    priority_score: number;
    confidence_score: number | null;
    needs_review: boolean;
    created_at: string;
    updated_at?: string;
    metadata?: Record<string, unknown>;
  }>;

  for (const row of inserted) {
    const mirrored = await mirrorItemToObsidian(row);
    if (mirrored) {
      const metadata = asMetadata(row.metadata);
      await supabase
        .from("items")
        .update({ metadata: { ...metadata, obsidian_path: mirrored.obsidianPath } })
        .eq("id", row.id)
        .eq("user_id", userId);
    }
  }

  await indexItemsInVectorStore(
    inserted.map((row) => ({
      id: row.id,
      user_id: row.user_id,
      title: row.title,
      content: row.content,
      type: row.type,
      status: row.status,
    })),
  );

  revalidatePath("/app");
  revalidatePath("/widget");
}

export async function signOut() {
  await clearHardcodedSession();
  redirect("/login");
}

export async function bulkUpdateItems(itemIds: string[], updates: BulkUpdateInput) {
  await requireHardcodedSession();

  const ids = Array.from(new Set(itemIds.map((id) => String(id).trim()).filter(Boolean)));
  if (ids.length === 0) return;

  const supabase = createAdminClient();
  const userId = await resolveSessionUserId();
  const normalizedTags = normalizeTags(updates.tags ?? []);

  const { data: existing, error: loadError } = await supabase
    .from("items")
    .select("id,metadata,tags")
    .eq("user_id", userId)
    .in("id", ids);

  if (loadError) throw new Error(`Failed to load items for bulk update: ${loadError.message}`);

  await Promise.all(
    (existing ?? []).map(async (row) => {
      const payload: Record<string, unknown> = {};
      if (updates.status) payload.status = updates.status;
      if (updates.type) payload.type = updates.type;
      if (typeof updates.priority_score === "number") payload.priority_score = updates.priority_score;
      if (updates.markReviewed) payload.needs_review = false;

      if (normalizedTags.length > 0) {
        payload.tags = normalizeTags([...(row.tags ?? []), ...normalizedTags]);
      }

      if (updates.metadata_patch) {
        payload.metadata = {
          ...asMetadata(row.metadata),
          ...updates.metadata_patch,
        };
      }

      const { error } = await supabase
        .from("items")
        .update(payload)
        .eq("id", row.id)
        .eq("user_id", userId);

      if (error) throw new Error(`Failed to bulk update item ${row.id}: ${error.message}`);
    }),
  );

  revalidatePath("/app");
  revalidatePath("/widget");
}
