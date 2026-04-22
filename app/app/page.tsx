import { createAdminClient } from "@/lib/supabase/admin";
import { requireHardcodedSession } from "@/lib/auth/session";
import { resolveSessionUserId } from "@/lib/auth/session-user";
import type { InboxItem } from "@/lib/items/types";
import { AppBoard } from "./board-client";
import { normalizeItemTags, shouldHideFromInitialBoard } from "./board-logic";

export default async function AppPage() {
  await requireHardcodedSession();

  const supabase = createAdminClient();
  const sessionUserId = await resolveSessionUserId();

  let items = null;
  let error = null;

  {
    const result = await supabase
      .from("items")
      .select("id, type, title, content, status, priority_score, confidence_score, needs_review, created_at, updated_at, metadata, tags")
      .eq("user_id", sessionUserId)
      .order("priority_score", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(120);
    items = result.data;
    error = result.error;
  }

  if (error?.message?.includes("column items.tags does not exist")) {
    const fallback = await supabase
      .from("items")
      .select("id, type, title, content, status, priority_score, confidence_score, needs_review, created_at, updated_at, metadata")
      .eq("user_id", sessionUserId)
      .order("priority_score", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(120);
    items = fallback.data;
    error = fallback.error;
  }

  if (error) throw new Error(`Failed to load inbox items: ${error.message}`);

  const allItems = ((items ?? []) as InboxItem[])
    .map((item) => normalizeItemTags(item))
    .filter((item) => !shouldHideFromInitialBoard(item));

  return <AppBoard initialItems={allItems} username={process.env.HARDCODED_USERNAME ?? "sam"} />;
}
