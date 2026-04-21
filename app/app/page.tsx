import { createAdminClient } from "@/lib/supabase/admin";
import { requireHardcodedSession } from "@/lib/auth/session";
import { resolveSessionUserId } from "@/lib/auth/session-user";
import type { InboxItem } from "@/lib/items/types";
import { AppBoard } from "./board-client";

export default async function AppPage() {
  await requireHardcodedSession();

  const supabase = createAdminClient();
  const sessionUserId = await resolveSessionUserId();

  const { data: items, error } = await supabase
    .from("items")
    .select("id, type, title, content, status, priority_score, confidence_score, needs_review, created_at, updated_at, metadata")
    .eq("user_id", sessionUserId)
    .order("priority_score", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(120);

  if (error) throw new Error(`Failed to load inbox items: ${error.message}`);

  const allItems = ((items ?? []) as InboxItem[]).filter(
    (item) => !((item.metadata ?? {}) as Record<string, unknown>).dismissed,
  );

  return <AppBoard initialItems={allItems} username={process.env.HARDCODED_USERNAME ?? "sam"} />;
}
