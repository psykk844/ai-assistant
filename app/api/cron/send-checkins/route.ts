import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushNotification } from "@/lib/push/web-push";
import { generateAIBriefing } from "@/app/app/my-day/briefing";
import { normalizeItemTags } from "@/app/app/board-logic";
import type { InboxItem } from "@/lib/items/types";

export async function POST(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const type = req.nextUrl.searchParams.get("type") ?? "morning";
  const supabase = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();

  // Get all active items (single-user app)
  const { data: allItems } = await supabase
    .from("items")
    .select("id, type, title, content, status, priority_score, confidence_score, needs_review, created_at, updated_at, metadata")
    .eq("status", "active")
    .order("priority_score", { ascending: false })
    .limit(100);

  const items = ((allItems ?? []) as InboxItem[]).map(normalizeItemTags);
  const todayItems = items.filter((i) => i.priority_score >= 0.85);
  const overdueItems = todayItems.filter((i) => i.created_at.slice(0, 10) < today);
  const staleItems = items
    .filter((i) => i.priority_score < 0.85 && (i.updated_at ?? i.created_at) < fiveDaysAgo)
    .slice(0, 3);

  let title: string;
  let body: string;

  if (type === "evening") {
    const { data: completedToday } = await supabase
      .from("items")
      .select("id")
      .eq("status", "completed")
      .gte("updated_at", today + "T00:00:00Z");

    const completedCount = completedToday?.length ?? 0;
    const remaining = todayItems.length;

    title = "🌙 Day's wrap-up";
    body = completedCount > 0
      ? `You completed ${completedCount} task${completedCount !== 1 ? "s" : ""} today! ${remaining > 0 ? `${remaining} remaining — they'll be here tomorrow.` : "Clean slate!"}`
      : remaining > 0
        ? `${remaining} tasks still open. No worries — tomorrow's a fresh start.`
        : "Quiet day! Rest up for tomorrow.";
  } else {
    title = "☀️ Good morning!";
    body = await generateAIBriefing(todayItems, overdueItems, staleItems);
  }

  // Send to all subscriptions
  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth");

  let sent = 0;
  let failed = 0;

  for (const sub of subs ?? []) {
    const success = await sendPushNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      { title, body, tag: `checkin-${type}`, url: "/app/my-day" }
    );
    if (success) sent++;
    else {
      failed++;
      await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
    }
  }

  return NextResponse.json({ type, sent, failed, title, body: body.slice(0, 100) });
}
