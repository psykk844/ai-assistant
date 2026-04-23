import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractUrl, fetchLinkSummary } from "@/lib/items/link-summary";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Find link items without summaries
  const { data: links, error } = await supabase
    .from("items")
    .select("id, content, title, metadata")
    .eq("type", "link")
    .in("status", ["active", "completed"])
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let updated = 0;
  let skipped = 0;

  for (const link of links ?? []) {
    const meta = (link.metadata as Record<string, unknown>) ?? {};
    if (meta.link_summary) { skipped++; continue; }

    const url = extractUrl(link.content);
    if (!url) { skipped++; continue; }

    try {
      const summary = await fetchLinkSummary(url);
      const updates: Record<string, unknown> = {
        metadata: { ...meta, link_summary: summary },
      };
      if (summary.page_title && (!link.title || link.title === "Saved link")) {
        updates.title = summary.page_title;
      }
      await supabase.from("items").update(updates).eq("id", link.id);
      updated++;
    } catch {
      skipped++;
    }
  }

  return NextResponse.json({ updated, skipped });
}
