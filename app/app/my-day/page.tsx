import { createAdminClient } from "@/lib/supabase/admin";
import { requireHardcodedSession } from "@/lib/auth/session";
import { resolveSessionUserId } from "@/lib/auth/session-user";
import type { InboxItem } from "@/lib/items/types";
import { MyDayClient } from "./my-day-client";

function normalizeItemTags(item: InboxItem): InboxItem {
  if (item.tags && Array.isArray(item.tags)) return item;
  const metaTags = (item.metadata as Record<string, unknown>)?.tags;
  return {
    ...item,
    tags: Array.isArray(metaTags) ? (metaTags as string[]) : [],
  };
}

export default async function MyDayPage() {
  await requireHardcodedSession();

  const supabase = createAdminClient();
  const userId = await resolveSessionUserId();
  const today = new Date().toISOString().slice(0, 10);
  const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();

  // Fetch all active items (we need full set for subtask tree building)
  const { data: allItems, error } = await supabase
    .from("items")
    .select("id, type, title, content, status, priority_score, confidence_score, needs_review, created_at, updated_at, metadata")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("priority_score", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw new Error(`Failed to load items: ${error.message}`);

  const items = ((allItems ?? []) as InboxItem[]).map(normalizeItemTags);

  // Helper: subtasks (items with parent_item_id) should not appear as standalone
  // cards — they render inside the parent's tree. Keep allActiveItems intact so
  // buildSubtaskTree can find them, but exclude them from flat lane lists.
  const isSubtask = (i: InboxItem) => {
    const m = (i.metadata as Record<string, unknown> | null | undefined) ?? {};
    return typeof m.parent_item_id === "string" && (m.parent_item_id as string).length > 0;
  };

  // Today lane: priority_score >= 0.85, top-level only
  const todayItems = items.filter((i) => i.priority_score >= 0.85 && !isSubtask(i));

  // Overdue: Today items created before today
  const overdueItems = todayItems.filter((i) => i.created_at.slice(0, 10) < today);

  // Stale: Next/Backlog items not updated in 5+ days, top-level only
  const staleItems = items.filter((i) => {
    if (i.priority_score >= 0.85) return false;
    if (isSubtask(i)) return false;
    const updated = i.updated_at ?? i.created_at;
    return updated < fiveDaysAgo;
  }).slice(0, 5);

  // Completed today (for progress tracking)
  const { data: completedToday } = await supabase
    .from("items")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "completed")
    .gte("updated_at", today + "T00:00:00Z");

  const completedCount = completedToday?.length ?? 0;

  return (
    <MyDayClient
      todayItems={todayItems}
      allActiveItems={items}
      overdueItems={overdueItems}
      staleItems={staleItems}
      completedTodayCount={completedCount}
    />
  );
}
